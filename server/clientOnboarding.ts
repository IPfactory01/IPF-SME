import { randomBytes, randomUUID } from "crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import {
  adminAccessAuditEvents,
  businessChecks,
  businessMemberships,
  businesses,
  clientOnboardingInvitations,
  userCredentials,
  userPlatformRoles,
  users,
  userSessions,
  type ClientOnboardingInvitation,
} from "../drizzle/schema";
import {
  ACCOUNT_AUTH_ERRORS,
  ONBOARDING_ERRORS,
  ONBOARDING_INVITATION_TTL_MS,
  normaliseAccountEmail,
  onboardingAcceptInputSchema,
} from "../shared/auth";
import { BRAND } from "../shared/brand";
import { businessProfileCompletion } from "../shared/businessMemberships";
import { z } from "zod";
import {
  assertSameOrigin,
  buildView,
  consumeRateLimit,
  createSession,
  emailIsReserved,
  isUniqueViolation,
  setSessionCookie,
  slugify,
  type Database,
} from "./accountAuth";
import { getDb } from "./db";
import { databaseNow, emailEquals } from "./dbHelpers";
import { deliverEmail } from "./email";
import { hashAdminPassword, sha256 } from "./adminSecurity";
import { linkEngagementToBusiness } from "./engagements";
import { NO_AUTHORITY } from "./platformAccess";
import { getTrustedApplicationOrigin } from "./security";

const emailSchema = z.string().trim().email().max(320);

export type InvitationStatus = ClientOnboardingInvitation["status"];

/** A pending invitation past its expiry is expired, whatever the stored status still says. */
export function effectiveInvitationStatus(invitation: Pick<ClientOnboardingInvitation, "status" | "expiresAt">, now = new Date()): InvitationStatus {
  return invitation.status === "pending" && invitation.expiresAt.getTime() <= now.getTime() ? "expired" : invitation.status;
}

const unavailable = () => new TRPCError({ code: "NOT_FOUND", message: ONBOARDING_ERRORS.unavailable });

async function requireDatabase() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/** Why an address cannot become a client account: it already has one, or it is reserved for an administrator. */
async function identityConflict(db: Pick<Database, "select">, email: string) {
  const existing = await db.select({ id: users.id }).from(users).where(emailEquals(users.email, email)).limit(1);
  return existing.length > 0 || (await emailIsReserved(db, email));
}

/** Sent as IP Factory in The Shift layout; the "Create your account: <link>" line becomes the button. */
export function buildOnboardingEmail(input: { fullName: string; businessName: string; url: string }) {
  const name = input.fullName.split(" ")[0] || "there";
  return {
    subject: `Set up your client account on ${BRAND.productName}`,
    body: [
      `Dear ${name},`,
      "",
      `Welcome to ${BRAND.productEndorsement}. Use the secure link below to create your client account${input.businessName ? ` for ${input.businessName}` : ""}.`,
      "It works once and expires in seven days.",
      "",
      `Create your account: ${input.url}`,
      "",
      "If you were not expecting this, you can ignore this email.",
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/**
 * Issues a single-use onboarding invitation for a business check (a prospect). The raw token exists only in the
 * returned URL, which goes to the authorised admin and the client's email: it is never stored or logged.
 *
 * NOTE: there is no canonical persisted "discovery call = fit" field, so it is not enforced here, and none is faked. The
 * caller is an authorised administrator (see docs/authentication.md). A confirmed Current State Assessment payment
 * (server/payments.ts, payment_requests) calls this automatically; an administrator can still invite by hand.
 */
export async function createOnboardingInvitation(input: { businessCheckId: number; actorUserId: number }) {
  const db = await requireDatabase();
  const check = (await db.select().from(businessChecks).where(eq(businessChecks.id, input.businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: ONBOARDING_ERRORS.noCheck });
  const email = normaliseAccountEmail(check.email);
  if (!emailSchema.safeParse(email).success) throw new TRPCError({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.invalidCheckEmail });
  if (await identityConflict(db, email)) throw new TRPCError({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccountAdmin });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ONBOARDING_INVITATION_TTL_MS);
  const invitation = await db.transaction(async tx => {
    await tx.update(clientOnboardingInvitations)
      .set({ status: "revoked", revokedAt: databaseNow() })
      .where(and(eq(clientOnboardingInvitations.businessCheckId, check.id), eq(clientOnboardingInvitations.status, "pending")));
    const [row] = await tx.insert(clientOnboardingInvitations).values({
      businessCheckId: check.id,
      email,
      fullNameSnapshot: check.fullName,
      businessNameSnapshot: check.businessName ?? "",
      tokenHash: sha256(token),
      expiresAt,
      createdByUserId: input.actorUserId,
    }).returning({ id: clientOnboardingInvitations.id });
    return row;
  });

  const invitationUrl = `${getTrustedApplicationOrigin()}/onboarding/${encodeURIComponent(token)}`;
  const message = buildOnboardingEmail({ fullName: check.fullName, businessName: check.businessName ?? "", url: invitationUrl });
  // Not BCC'd to a shared mailbox: the link is a one-time credential.
  const delivery = await deliverEmail({ to: email, subject: message.subject, body: message.body, sender: "business_support" });
  await db.update(clientOnboardingInvitations).set({
    deliveryStatus: delivery.status,
    deliveryMessageId: delivery.status === "Sent" ? delivery.providerMessageId || null : null,
  }).where(eq(clientOnboardingInvitations.id, invitation.id));
  await db.insert(adminAccessAuditEvents).values({
    actorUserId: input.actorUserId,
    action: "client_onboarding_invitation_created",
    targetEmail: email,
    details: JSON.stringify({ invitationId: invitation.id, businessCheckId: check.id, deliveryStatus: delivery.status }),
  });
  return { invitationId: invitation.id, invitationUrl, expiresAt, deliveryStatus: delivery.status };
}

export async function revokeOnboardingInvitation(input: { invitationId: number; actorUserId: number }) {
  const db = await requireDatabase();
  const revoked = await db.update(clientOnboardingInvitations)
    .set({ status: "revoked", revokedAt: databaseNow() })
    .where(and(eq(clientOnboardingInvitations.id, input.invitationId), eq(clientOnboardingInvitations.status, "pending")))
    .returning({ id: clientOnboardingInvitations.id, email: clientOnboardingInvitations.email });
  if (revoked.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "Only a pending invitation can be revoked." });
  await db.insert(adminAccessAuditEvents).values({
    actorUserId: input.actorUserId,
    action: "client_onboarding_invitation_revoked",
    targetEmail: revoked[0].email,
    details: JSON.stringify({ invitationId: revoked[0].id }),
  });
  return { success: true } as const;
}

/** What the invited client sees before creating the account. Any unusable invitation looks the same. */
export async function previewOnboardingInvitation(req: Request, token: string) {
  if (!consumeRateLimit("onboarding", req, "preview", 60)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  const db = await requireDatabase();
  const invitation = (await db.select().from(clientOnboardingInvitations).where(eq(clientOnboardingInvitations.tokenHash, sha256(token))).limit(1))[0];
  if (!invitation || effectiveInvitationStatus(invitation) !== "pending") return { available: false } as const;
  return { available: true, email: invitation.email, fullName: invitation.fullNameSnapshot, businessName: invitation.businessNameSnapshot } as const;
}

/**
 * Accepts an invitation: creates the person, password credential, business, owner membership and first session and
 * marks the invitation accepted, all in ONE transaction. Any failure keeps nothing.
 */
export async function acceptOnboardingInvitation(req: Request, res: Response, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = onboardingAcceptInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  const input = parsed.data;
  if (!consumeRateLimit("onboarding", req, "accept", 10)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  const db = await requireDatabase();
  const passwordHash = hashAdminPassword(input.password);

  let created;
  try {
    created = await db.transaction(async tx => {
      const invitation = (await tx.select().from(clientOnboardingInvitations).where(eq(clientOnboardingInvitations.tokenHash, sha256(input.token))).limit(1))[0];
      if (!invitation || effectiveInvitationStatus(invitation) !== "pending") throw unavailable();
      if (input.email !== invitation.email) throw new TRPCError({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.emailMismatch });
      // One person, one identity: an existing account is never merged, overwritten or given a new business here.
      if (await identityConflict(tx, invitation.email)) throw new TRPCError({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccount });

      const [user] = await tx.insert(users).values({
        openId: `local:${randomUUID()}`,
        name: input.fullName,
        email: invitation.email,
        loginMethod: "password",
        role: "user",
        status: "active",
      }).returning({ id: users.id });
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash });
      const [business] = await tx.insert(businesses).values({
        name: input.businessName,
        slug: slugify(input.businessName),
        createdByUserId: user.id,
      }).returning({ id: businesses.id, name: businesses.name });
      await tx.insert(businessMemberships).values({ businessId: business.id, userId: user.id, role: "owner", status: "active" });
      const session = await createSession(tx, user.id);
      // The claim is conditional, so two simultaneous acceptances cannot both win.
      const claimed = await tx.update(clientOnboardingInvitations).set({
        status: "accepted",
        acceptedAt: databaseNow(),
        acceptedByUserId: user.id,
        businessId: business.id,
      }).where(and(
        eq(clientOnboardingInvitations.id, invitation.id),
        eq(clientOnboardingInvitations.status, "pending"),
        gt(clientOnboardingInvitations.expiresAt, new Date()),
        isNull(clientOnboardingInvitations.acceptedAt),
      )).returning({ id: clientOnboardingInvitations.id });
      if (claimed.length !== 1) throw unavailable();
      return { userId: user.id, email: invitation.email, business, session, businessCheckId: invitation.businessCheckId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccount });
    throw error;
  }

  // Outside the account transaction: a missing engagement table (migration 0008) must never stop an owner signing up.
  await linkEngagementToBusiness(db, { businessCheckId: created.businessCheckId, businessId: created.business.id }).catch(error => {
    console.error("[Engagements] Account created, but the engagement could not be linked:", error instanceof Error ? error.message : error);
  });
  setSessionCookie(req, res, created.session.token);
  // A new client has no platform role: platform roles are never granted by onboarding.
  return buildView(
    { id: created.userId, name: input.fullName, email: created.email },
    NO_AUTHORITY,
    [{ businessId: created.business.id, businessName: created.business.name, role: "owner", status: "active", profileComplete: false, profilePercent: businessProfileCompletion({ name: created.business.name }).percent }],
    created.business.id,
  );
}

/** The state of each business check's most recent onboarding invitation (a check with none is absent from the map). */
export async function latestInvitationStatuses(db: Pick<Database, "select">) {
  const invitations = await db.select({
    businessCheckId: clientOnboardingInvitations.businessCheckId,
    status: clientOnboardingInvitations.status,
    expiresAt: clientOnboardingInvitations.expiresAt,
  }).from(clientOnboardingInvitations).orderBy(desc(clientOnboardingInvitations.id));
  const latest = new Map<number, InvitationStatus>();
  for (const invitation of invitations) if (!latest.has(invitation.businessCheckId)) latest.set(invitation.businessCheckId, effectiveInvitationStatus(invitation));
  return latest;
}

/** Business checks an administrator can invite, with the call request and the state of their latest invitation. Prospects only. */
export async function listOnboardingCandidates() {
  const db = await requireDatabase();
  const [checks, latest] = await Promise.all([
    db.select({
      id: businessChecks.id,
      fullName: businessChecks.fullName,
      email: businessChecks.email,
      businessName: businessChecks.businessName,
      whatsapp: businessChecks.whatsapp,
      pipelineStage: businessChecks.pipelineStage,
      callRequestedAt: businessChecks.callRequestedAt,
      callScheduledFor: businessChecks.callScheduledFor,
      completedAt: businessChecks.completedAt,
      createdAt: businessChecks.createdAt,
    }).from(businessChecks).orderBy(desc(businessChecks.createdAt)).limit(200),
    latestInvitationStatuses(db),
  ]);
  return checks.map(check => ({ ...check, invitationStatus: latest.get(check.id) ?? null }));
}

export async function listOnboardingInvitations() {
  const db = await requireDatabase();
  const rows = await db.select({
    id: clientOnboardingInvitations.id,
    businessCheckId: clientOnboardingInvitations.businessCheckId,
    email: clientOnboardingInvitations.email,
    businessName: clientOnboardingInvitations.businessNameSnapshot,
    status: clientOnboardingInvitations.status,
    expiresAt: clientOnboardingInvitations.expiresAt,
    acceptedAt: clientOnboardingInvitations.acceptedAt,
    deliveryStatus: clientOnboardingInvitations.deliveryStatus,
    createdAt: clientOnboardingInvitations.createdAt,
  }).from(clientOnboardingInvitations).orderBy(desc(clientOnboardingInvitations.createdAt)).limit(200);
  // The token hash is never returned.
  return rows.map(row => ({ ...row, status: effectiveInvitationStatus(row) }));
}

/** Prospects, people, workspaces and links are different things and are counted separately. */
export async function onboardingMetrics() {
  const db = await requireDatabase();
  const one = async (query: PromiseLike<Array<{ n: number | string }>>) => Number((await query)[0]?.n ?? 0);
  return {
    businessChecks: await one(db.select({ n: count() }).from(businessChecks)),
    /** Every identity (clients, staff and legacy sign-ins); portalUsers is the subset who can sign in with a password. */
    users: await one(db.select({ n: count() }).from(users)),
    portalUsers: await one(db.select({ n: count() }).from(userCredentials)),
    businesses: await one(db.select({ n: count() }).from(businesses)),
    memberships: await one(db.select({ n: count() }).from(businessMemberships)),
    platformRoleAssignments: await one(db.select({ n: count() }).from(userPlatformRoles)),
    pendingInvitations: await one(db.select({ n: count() }).from(clientOnboardingInvitations).where(and(eq(clientOnboardingInvitations.status, "pending"), gt(clientOnboardingInvitations.expiresAt, new Date())))),
    activeSessions: await one(db.select({ n: count() }).from(userSessions).where(and(isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date())))),
  };
}

