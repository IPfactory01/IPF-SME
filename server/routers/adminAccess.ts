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
import { deliverEmail, JUMP_MONITORING_BCC } from "../email";
import { loadAuthority } from "../platformAccess";
import { ownerAdminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getTrustedApplicationOrigin } from "../security";
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
      // Resolved by the central authority resolver: the Super Admin has everything, everyone else what their roles and
      // legacy administrator profile grant.
      permissions: authority.legacyCapabilities,
      platformPermissions: authority.permissions,
    };
  }),

  enrollOwnerPassword: protectedProcedure
    .input(z.object({ password: passwordSchema, confirmPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || !isOwnerAdmin(ctx.user) || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: `Only the recognised ${BRAND.programmeShortName} super administrator can create this password.` });
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
      return { success: true, message: `Your ${BRAND.programmeShortName} administrator password is now active.` };
    }),

  verifyPassword: protectedProcedure
    .input(z.object({ password: z.string().min(1).max(160) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: `This account is not an authorised ${BRAND.programmeShortName} administrator.` });
      }
      const result = await verifyAndRecordAdminPassword(ctx.user.id, input.password);
      if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.reason });
      await issueAdminAccessSession(ctx.req, ctx.res, ctx.user.id);
      return { success: true, message: "Administrator access verified." };
    }),

  requestPasswordReset: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: `This account is not an authorised ${BRAND.programmeShortName} administrator.` });
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
      subject: `Reset your ${BRAND.programmeShortName} administrator password`,
      body: `Hello,\n\nWe received a request to reset the ${BRAND.programmeShortName} administrator password for ${email}. Kindly use the secure link below within 20 minutes:\n\n${resetUrl}\n\nFor your protection, this link can be used once. If you did not request this reset, please ignore this email; your existing password will remain unchanged.\n\n${BRAND.senderDisplayName}`,
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
      return { success: true, message: `Your ${BRAND.programmeShortName} administrator password has been reset. Kindly sign in again with your authorised Gmail account.` };
    }),

  logoutPassword: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) await revokeAdminSessionsForUser(ctx.user.id);
    clearAdminAccessSession(ctx.req, ctx.res);
    return { success: true };
  }),

  inviteAdmin: ownerAdminProcedure
    .input(z.object({
      email: z.string().email(),
      inviteeName: z.string().trim().min(2).max(255).optional(),
      permissions: z.array(z.string().refine(isAdminPermission)).min(1).max(ADMIN_PERMISSION_IDS.length),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const email = normalizeAdminEmail(input.email);
      if (email === OWNER_ADMIN_EMAIL) throw new TRPCError({ code: "BAD_REQUEST", message: "The super administrator already has permanent access." });

      const existingAdmin = await db.select({ id: users.id }).from(users).where(and(emailEquals(users.email, email), eq(users.role, "admin"))).limit(1);
      if (existingAdmin.length) throw new TRPCError({ code: "CONFLICT", message: `That email is already an active ${BRAND.programmeShortName} administrator.` });

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const permissions = parseAdminPermissions(JSON.stringify(input.permissions));
      await db.update(adminInvitations).set({ status: "Revoked" }).where(and(eq(adminInvitations.email, email), eq(adminInvitations.status, "Pending")));
      const inserted = await db.insert(adminInvitations).values({
        email,
        inviteeName: input.inviteeName || null,
        tokenHash: sha256(token),
        createdByUserId: ctx.user.id,
        expiresAt,
        proposedPermissionsJson: serializeAdminPermissions(permissions),
      }).returning({ id: adminInvitations.id });
      const invitationId = Number(inserted[0].id);
      const baseUrl = getTrustedApplicationOrigin();
      const invitationUrl = `${baseUrl}/admin/invite?token=${encodeURIComponent(token)}`;
      const name = input.inviteeName ? ` ${input.inviteeName}` : "";
      const delivery = await deliverEmail({
        to: email,
        bcc: JUMP_MONITORING_BCC,
        subject: `Invitation to the ${BRAND.programmeName} administration console`,
        body: `Hello${name},\n\n${BRAND.facilitatorName} has invited you to become an administrator for the ${BRAND.programmeFullName}. Kindly use the secure link below within seven days. You will sign in with this exact email address and create your own ${BRAND.programmeShortName} administrator password.\n\n${invitationUrl}\n\nThis link is personal. Please do not forward it.\n\n${BRAND.senderDisplayName}`,
      });
      await db.update(adminInvitations).set({
        deliveryStatus: delivery.status,
        deliveryMessageId: delivery.status === "Sent" ? delivery.providerMessageId || null : null,
      }).where(eq(adminInvitations.id, invitationId));
      await db.insert(adminAccessAuditEvents).values({
        actorUserId: ctx.user.id,
        action: "admin_invitation_created",
        targetEmail: email,
        details: JSON.stringify({ invitationId, deliveryStatus: delivery.status, permissions }),
      });
      return { success: true, invitationUrl, expiresAt, deliveryStatus: delivery.status };
    }),

  listTeam: ownerAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const team = await db.select().from(users).where(eq(users.role, "admin")).orderBy(desc(users.lastSignedIn));
    const profiles = await db.select().from(adminPermissionProfiles);
    const permissionMap = new Map(profiles.map((profile) => [profile.userId, parseAdminPermissions(profile.permissionsJson)]));
    return team.map((member) => ({
      ...member,
      isSuperAdmin: isOwnerAdmin(member),
      permissions: isOwnerAdmin(member) ? ADMIN_PERMISSION_IDS : permissionMap.get(member.id) || [],
    }));
  }),

  listInvitations: ownerAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const invitations = await db.select().from(adminInvitations).orderBy(desc(adminInvitations.createdAt));
    return invitations.map((invitation) => ({
      ...invitation,
      displayStatus: invitation.status === "Pending" ? expirationStatus(invitation.expiresAt) : invitation.status,
      proposedPermissions: parseAdminPermissions(invitation.proposedPermissionsJson),
    }));
  }),

  revokeAdmin: ownerAdminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0] || target[0].role !== "admin") throw new TRPCError({ code: "NOT_FOUND", message: "Active administrator not found." });
      if (isOwnerAdmin(target[0])) throw new TRPCError({ code: "FORBIDDEN", message: `The ${BRAND.programmeShortName} super administrator cannot be revoked here.` });
      await db.update(users).set({ role: "user" }).where(eq(users.id, target[0].id));
      await db.delete(adminPermissionProfiles).where(eq(adminPermissionProfiles.userId, target[0].id));
      await revokeAdminSessionsForUser(target[0].id);
      await db.insert(adminAccessAuditEvents).values({
        actorUserId: ctx.user.id,
        action: "admin_revoked",
        targetEmail: normalizeAdminEmail(target[0].email),
      });
      return { success: true };
    }),

  updatePermissions: ownerAdminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      permissions: z.array(z.string().refine(isAdminPermission)).min(1).max(ADMIN_PERMISSION_IDS.length),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = (await db.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!target || target.role !== "admin") throw new TRPCError({ code: "NOT_FOUND", message: "Active administrator not found." });
      if (isOwnerAdmin(target)) throw new TRPCError({ code: "FORBIDDEN", message: "The Super Admin retains all permissions and cannot be restricted." });
      const permissionsJson = serializeAdminPermissions(parseAdminPermissions(JSON.stringify(input.permissions)));
      const profile = (await db.select({ id: adminPermissionProfiles.id }).from(adminPermissionProfiles).where(eq(adminPermissionProfiles.userId, target.id)).limit(1))[0];
      if (profile) {
        await db.update(adminPermissionProfiles).set({ permissionsJson, updatedByUserId: ctx.user.id }).where(eq(adminPermissionProfiles.id, profile.id));
      } else {
        await db.insert(adminPermissionProfiles).values({ userId: target.id, permissionsJson, updatedByUserId: ctx.user.id });
      }
      await db.insert(adminAccessAuditEvents).values({ actorUserId: ctx.user.id, action: "admin_permissions_updated", targetEmail: normalizeAdminEmail(target.email), details: permissionsJson });
      return { success: true };
    }),

  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string().min(30).max(200), password: passwordSchema, confirmPassword: passwordSchema }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (input.password !== input.confirmPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "The password confirmation does not match." });
      const policyError = validateAdminPassword(input.password);
      if (policyError) throw new TRPCError({ code: "BAD_REQUEST", message: policyError });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const candidates = await db.select().from(adminInvitations).where(and(eq(adminInvitations.tokenHash, sha256(input.token)), eq(adminInvitations.status, "Pending"))).limit(1);
      const invitation = candidates[0];
      if (!invitation || invitation.expiresAt.getTime() <= Date.now()) {
        if (invitation) await db.update(adminInvitations).set({ status: "Expired" }).where(eq(adminInvitations.id, invitation.id));
        throw new TRPCError({ code: "NOT_FOUND", message: "This invitation is unavailable or has expired." });
      }
      if (normalizeAdminEmail(ctx.user.email) !== invitation.email) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Kindly sign in with ${invitation.email} to accept this invitation.` });
      }
      await db.update(users).set({ role: "admin" }).where(eq(users.id, ctx.user.id));
      await setAdminPassword(ctx.user.id, input.password);
      const permissionsJson = serializeAdminPermissions(parseAdminPermissions(invitation.proposedPermissionsJson));
      const profile = (await db.select({ id: adminPermissionProfiles.id }).from(adminPermissionProfiles).where(eq(adminPermissionProfiles.userId, ctx.user.id)).limit(1))[0];
      if (profile) {
        await db.update(adminPermissionProfiles).set({ permissionsJson, updatedByUserId: invitation.createdByUserId }).where(eq(adminPermissionProfiles.id, profile.id));
      } else {
        await db.insert(adminPermissionProfiles).values({ userId: ctx.user.id, permissionsJson, updatedByUserId: invitation.createdByUserId });
      }
      await db.update(adminInvitations).set({ status: "Accepted", acceptedByUserId: ctx.user.id, acceptedAt: new Date() }).where(eq(adminInvitations.id, invitation.id));
      await issueAdminAccessSession(ctx.req, ctx.res, ctx.user.id);
      await db.insert(adminAccessAuditEvents).values({
        actorUserId: ctx.user.id,
        action: "admin_invitation_accepted",
        targetEmail: invitation.email,
        details: JSON.stringify({ invitationId: invitation.id, permissions: parseAdminPermissions(invitation.proposedPermissionsJson) }),
      });
      return { success: true };
    }),

  inviteStatus: publicProcedure
    .input(z.object({ token: z.string().min(30).max(200) }))
    .query(async ({ ctx, input }) => {
      if (!(await consumeLimit(LIMITS.publicLookup, ctx.req.ip || "unknown"))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Kindly try again later." });
      const db = await getDb();
      if (!db) return { valid: false };
      const result = await db.select({ inviteeName: adminInvitations.inviteeName, expiresAt: adminInvitations.expiresAt, status: adminInvitations.status }).from(adminInvitations).where(eq(adminInvitations.tokenHash, sha256(input.token))).limit(1);
      const invitation = result[0];
      return { valid: Boolean(invitation && invitation.status === "Pending" && invitation.expiresAt.getTime() > Date.now()), inviteeName: invitation?.inviteeName || null };
    }),
});
