import { isFirmLevel } from "../../shared/platformPermissions";
import { TRPCError } from "@trpc/server";
import { consumeLimit, LIMITS } from "../rateLimit";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { adminAccessAuditEvents, adminCredentials, adminInvitations, adminPasswordResetTokens, adminPermissionProfiles, users } from "../../drizzle/schema";
import {
  clearAdminAccessSession,
  hasVerifiedAdminAccess,
  isOwnerAdmin,
  issueAdminAccessSession,
  normalizeAdminEmail,
  OWNER_ADMIN_EMAIL,
  revokeAdminSessionsForUser,
  setAdminPassword,
  sha256,
  validateAdminPassword,
  verifyAndRecordAdminPassword,
} from "../adminSecurity";
import { getDb } from "../db";
import { deliverEmail } from "../email";
import { loadAuthority } from "../platformAccess";
import { ownerAdminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getTrustedApplicationOrigin } from "../security";
import { recordAudit } from "../audit";
import { TEAM_PREVIEW_COOKIE, TEAM_PREVIEW_MINUTES, teamPreviewCookieOptions, teamPreviewToken } from "../teamPreview";
import { emailEquals } from "../dbHelpers";
import { ADMIN_PERMISSION_IDS, isAdminPermission, parseAdminPermissions, serializeAdminPermissions } from "../../shared/adminPermissions";
import { BRAND } from "../../shared/brand";

const passwordSchema = z.string().min(12).max(160);
const PASSWORD_RESET_TOKEN_MAX_AGE_MS = 20 * 60 * 1000;

function expirationStatus(expiresAt: Date) {
  return expiresAt.getTime() <= Date.now() ? "Expired" as const : "Pending" as const;
}

export const adminAccessRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db || !ctx.user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const credentials = await db.select({ id: adminCredentials.id }).from(adminCredentials).where(eq(adminCredentials.userId, ctx.user.id)).limit(1);
    const authority = await loadAuthority(db, ctx.user);
    const internal = authority.roles.length > 0;
    const viaAccount = ctx.authChannel === "account";
    // The universal sign-in already verified the person's password, so internal access needs no second administrator
    // password; the legacy channel still does.
    const passwordVerified = viaAccount ? internal : ctx.user.role === "admin" && await hasVerifiedAdminAccess(ctx.req, ctx.user.id);
    return {
      email: ctx.user.email,
      name: ctx.user.name,
      isAdmin: ctx.user.role === "admin" || internal,
      // Super Admin by the central resolver (owner email OR stored super_admin role), not by the email alone.
      isOwner: authority.isSuperAdmin,
      isSuperAdmin: authority.isSuperAdmin,
      hasPassword: credentials.length > 0,
      passwordVerified,
      signedInVia: ctx.authChannel ?? "legacy",
      platformRoles: authority.roles,
      /** The person's level (Partner, Senior Associate, ...), shown under their name instead of the roles behind it. */
      level: authority.isSuperAdmin ? "Super Admin" : isFirmLevel(ctx.user.jobTitle) ? ctx.user.jobTitle : null,
      // Resolved by the central authority resolver: the Super Admin has everything, everyone else what their roles and
      // legacy administrator profile grant.
      permissions: authority.legacyCapabilities,
      platformPermissions: authority.permissions,
      /** Preview as a team member (R76): whose view this is, who is looking, and until when. */
      preview: ctx.preview ? { name: ctx.preview.asName, email: ctx.preview.asEmail, by: ctx.preview.byName, until: new Date(ctx.preview.expiresAt) } : null,
    };
  }),

  /**
   * Preview as a team member (R76): the Super Admin opens Admin as this person sees it for 30 minutes, read only.
   * Never from inside a preview (the person in it is not the Super Admin), never a client, never another Super Admin.
   */
  previewAs: ownerAdminProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db || !ctx.user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "This is already your own view." });
    const shown = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!shown || shown.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "This person is not available to preview." });
    const authority = await loadAuthority(db, shown);
    if (authority.roles.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Only someone at IP Factory can be previewed here. A client's room has Preview as client." });
    if (authority.isSuperAdmin) throw new TRPCError({ code: "BAD_REQUEST", message: "Another Super Admin sees what you see." });
    const expiresAt = Date.now() + TEAM_PREVIEW_MINUTES * 60_000;
    ctx.res.cookie(TEAM_PREVIEW_COOKIE, teamPreviewToken(ctx.user.id, shown.id, expiresAt), { ...teamPreviewCookieOptions(ctx.req), maxAge: TEAM_PREVIEW_MINUTES * 60_000 });
    await recordAudit(db, { action: "team_view_previewed", actorUserId: ctx.user.id, targetEmail: shown.email ?? null, details: { userId: shown.id, until: new Date(expiresAt).toISOString() } });
    return { success: true, name: shown.name ?? shown.email ?? "", until: new Date(expiresAt) } as const;
  }),

  /** Close the preview: the one change a preview may make, and harmless to anyone without one. */
  endPreview: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(TEAM_PREVIEW_COOKIE, teamPreviewCookieOptions(ctx.req));
    return { success: true } as const;
  }),

  enrollOwnerPassword: protectedProcedure
    .input(z.object({ password: passwordSchema, confirmPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || !isOwnerAdmin(ctx.user) || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the recognised Super Admin can create this password." });
      }
      if (input.password !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The password confirmation does not match." });
      }
      const policyError = validateAdminPassword(input.password);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      await setAdminPassword(ctx.user.id, input.password);
      await issueAdminAccessSession(ctx.req, ctx.res, ctx.user.id);
      const db = await getDb();
      await db?.insert(adminAccessAuditEvents).values({
        actorUserId: ctx.user.id,
        action: "owner_password_enrolled",
        targetEmail: normalizeAdminEmail(ctx.user.email),
      });
      return { success: true, message: "Your administrator password is now active." };
    }),

  verifyPassword: protectedProcedure
    .input(z.object({ password: z.string().min(1).max(160) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an authorised administrator." });
      }
      const result = await verifyAndRecordAdminPassword(ctx.user.id, input.password);
      if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.reason });
      await issueAdminAccessSession(ctx.req, ctx.res, ctx.user.id);
      return { success: true, message: "Administrator access verified." };
    }),

  requestPasswordReset: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "This account is not an authorised administrator." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const email = normalizeAdminEmail(ctx.user.email);
    if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "This administrator account does not have a verified email address." });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_MAX_AGE_MS);
    await db.update(adminPasswordResetTokens).set({ revokedAt: new Date() }).where(and(
      eq(adminPasswordResetTokens.userId, ctx.user.id),
      isNull(adminPasswordResetTokens.consumedAt),
      isNull(adminPasswordResetTokens.revokedAt),
    ));
    const inserted = await db.insert(adminPasswordResetTokens).values({
      userId: ctx.user.id,
      tokenHash: sha256(token),
      expiresAt,
      deliveryStatus: "Simulated",
    }).returning({ id: adminPasswordResetTokens.id });
    const resetId = Number(inserted[0].id);
    const baseUrl = getTrustedApplicationOrigin();
    const resetUrl = `${baseUrl}/admin/reset?token=${encodeURIComponent(token)}`;
    const delivery = await deliverEmail({
      to: email,
      subject: `Reset your administrator password on ${BRAND.productName}`,
      body: `Hello,\n\nWe received a request to reset the administrator password for ${email} on ${BRAND.productName}. Kindly use the secure link below within 20 minutes:\n\n${resetUrl}\n\nFor your protection, this link can be used once. If you did not request this reset, please ignore this email; your existing password will remain unchanged.\n\n${BRAND.organisationName}`,
      sender: "business_support",
    });
    if (delivery.status !== "Sent") {
      await db.update(adminPasswordResetTokens).set({ revokedAt: new Date(), deliveryStatus: delivery.status, deliveryMessageId: null }).where(eq(adminPasswordResetTokens.id, resetId));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The reset email could not be delivered. Kindly try again shortly." });
    }
    await db.update(adminPasswordResetTokens).set({ deliveryStatus: delivery.status, deliveryMessageId: delivery.providerMessageId || null }).where(eq(adminPasswordResetTokens.id, resetId));
    await db.insert(adminAccessAuditEvents).values({
      actorUserId: ctx.user.id,
      action: "admin_password_reset_requested",
      targetEmail: email,
      details: JSON.stringify({ expiresAt: expiresAt.toISOString(), deliveryStatus: delivery.status }),
    });
    return { success: true, expiresAt };
  }),

  confirmPasswordReset: publicProcedure
    .input(z.object({ token: z.string().min(30).max(200), password: passwordSchema, confirmPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!(await consumeLimit(LIMITS.publicLookup, ctx.req.ip || "unknown"))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Kindly try again later." });
      if (input.password !== input.confirmPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The password confirmation does not match." });
      }
      const policyError = validateAdminPassword(input.password);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const resetToken = (await db.select().from(adminPasswordResetTokens).where(and(
        eq(adminPasswordResetTokens.tokenHash, sha256(input.token)),
        isNull(adminPasswordResetTokens.consumedAt),
        isNull(adminPasswordResetTokens.revokedAt),
        gt(adminPasswordResetTokens.expiresAt, new Date()),
      )).limit(1))[0];
      if (!resetToken) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This password reset link is unavailable or has expired. Kindly request a new link." });
      }
      const administrator = (await db.select().from(users).where(and(eq(users.id, resetToken.userId), eq(users.role, "admin"))).limit(1))[0];
      if (!administrator) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This password reset link is no longer valid." });
      }
      await revokeAdminSessionsForUser(administrator.id);
      await setAdminPassword(administrator.id, input.password);
      await db.update(adminPasswordResetTokens).set({ consumedAt: new Date() }).where(eq(adminPasswordResetTokens.id, resetToken.id));
      clearAdminAccessSession(ctx.req, ctx.res);
      await db.insert(adminAccessAuditEvents).values({
        actorUserId: administrator.id,
        action: "admin_password_reset_completed",
        targetEmail: normalizeAdminEmail(administrator.email),
        details: JSON.stringify({ resetTokenId: resetToken.id }),
      });
      return { success: true, message: "Your administrator password has been reset. Kindly sign in again." };
    }),

  logoutPassword: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) await revokeAdminSessionsForUser(ctx.user.id);
    clearAdminAccessSession(ctx.req, ctx.res);
    return { success: true };
  }),
  // The JUMP-era administrator team (Gmail invitations and permission checklists) was removed on 6 November 2026; IP Factory
  // people are invited by level in Admin › Team.
});
