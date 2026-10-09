import { randomBytes, randomUUID } from "crypto";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  accountInvitations,
  businessMemberAccess,
  businessMemberships,
  businesses,
  userCredentials,
  userPlatformRoles,
  users,
  type AccountInvitation,
} from "../drizzle/schema";
import {
  ACCOUNT_AUTH_ERRORS,
  ACCOUNT_EMAIL_MAX_LENGTH,
  ACCOUNT_FULL_NAME_MAX_LENGTH,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  normaliseAccountEmail,
  ONBOARDING_ERRORS,
  ONBOARDING_INVITATION_TTL_MS,
  validateAccountPassword,
  type PlatformRole,
} from "../shared/auth";
import { BRAND } from "../shared/brand";
import { CLIENT_ACCESS_LABELS, TEAM_SEATS_INCLUDED, type ClientAccessLevel } from "../shared/engagement";
import { authorityAllows } from "../shared/platformPermissions";
import { assertSameOrigin, buildView, consumeRateLimit, createSession, emailIsReserved, isUniqueViolation, setSessionCookie, type AccountSession, type Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { databaseNow, emailEquals } from "./dbHelpers";
import { deliverEmail } from "./email";
import { hashAdminPassword, sha256 } from "./adminSecurity";
import { loadAuthority } from "./platformAccess";
import type { StaffActor } from "./engagements";
import { getTrustedApplicationOrigin } from "./security";

/**
 * Invitations that create an email-and-password account (account_invitations): IP Factory staff, invited by the
 * Super Admin with a platform role, and the owner's staff, invited by the owner into their one included seat with an
 * access level. The same rules as the client invitation: only the SHA-256 of the token is stored, the link works
 * once, expires in seven days, can be revoked and is bound to the email. An existing account is never merged.
 */

export const JOIN_PATH = "/join";
const unavailable = () => new TRPCError({ code: "NOT_FOUND", message: ONBOARDING_ERRORS.unavailable });
const newInvitationSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(ACCOUNT_EMAIL_MAX_LENGTH).transform(normaliseAccountEmail),
  fullName: z.string().trim().min(2, "Enter their full name.").max(ACCOUNT_FULL_NAME_MAX_LENGTH),
});

export const acceptAccountInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  email: z.string().trim().email("Enter a valid email address.").max(ACCOUNT_EMAIL_MAX_LENGTH).transform(normaliseAccountEmail),
  fullName: z.string().trim().min(2, "Enter your full name.").max(ACCOUNT_FULL_NAME_MAX_LENGTH),
  password: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
  confirmPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH + 1),
}).superRefine((value, context) => {
  const policy = validateAccountPassword(value.password);
  if (policy) context.addIssue({ code: "custom", path: ["password"], message: policy });
  if (value.password !== value.confirmPassword) context.addIssue({ code: "custom", path: ["confirmPassword"], message: "The password confirmation does not match." });
});

/** A pending invitation past its expiry is expired, whatever the stored status says. */
export function invitationState(invitation: Pick<AccountInvitation, "status" | "expiresAt">, now = new Date()) {
  return invitation.status === "pending" && invitation.expiresAt.getTime() <= now.getTime() ? "expired" as const : invitation.status;
}

async function identityTaken(db: Pick<Database, "select">, email: string) {
  return (await db.select({ id: users.id }).from(users).where(emailEquals(users.email, email)).limit(1)).length > 0 || (await emailIsReserved(db, email));
}

export function buildInvitationEmail(input: { kind: "staff" | "business_member"; fullName: string; url: string; inviterName: string; businessName?: string | null; access?: ClientAccessLevel | null }) {
  const name = input.fullName.split(" ")[0] || "there";
  const staff = input.kind === "staff";
  return {
    subject: staff ? `Join the ${BRAND.organisationName} team on ${BRAND.productName}` : `${input.inviterName} invited you to ${input.businessName ?? "their business"} on ${BRAND.productName}`,
    body: [
      `Dear ${name},`,
      "",
      staff
        ? `${input.inviterName} has invited you to the ${BRAND.organisationName} team on ${BRAND.productName}, where we run our client engagements.`
        : `${input.inviterName} has invited you to work with them and ${BRAND.organisationName} on ${input.businessName ?? "their business"}. ${input.access ? CLIENT_ACCESS_LABELS[input.access].detail : ""}`.trim(),
      "Use the secure link below to set your password. It works once and expires in seven days.",
      "",
      `Create your account: ${input.url}`,
      "",
      "If you were not expecting this, you can ignore this email.",
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

async function issue(db: Database, input: { kind: "staff" | "business_member"; email: string; fullName: string; platformRole?: PlatformRole; businessId?: number; access?: ClientAccessLevel; actorUserId: number; inviterName: string; businessName?: string }) {
  const token = randomBytes(32).toString("base64url");
  let invitation: { id: number };
  try {
    invitation = await db.transaction(async tx => {
      // A fresh invitation to the same address replaces the one still out.
      await tx.update(accountInvitations).set({ status: "revoked", revokedAt: databaseNow() }).where(and(emailEquals(accountInvitations.email, input.email), eq(accountInvitations.status, "pending")));
      const [row] = await tx.insert(accountInvitations).values({
        kind: input.kind, email: input.email, fullName: input.fullName, platformRole: input.platformRole ?? null, businessId: input.businessId ?? null, access: input.access ?? null,
        tokenHash: sha256(token), expiresAt: new Date(Date.now() + ONBOARDING_INVITATION_TTL_MS), createdByUserId: input.actorUserId,
      }).returning({ id: accountInvitations.id });
      await recordAudit(tx, { action: "account_invitation_created", actorUserId: input.actorUserId, targetEmail: input.email, details: { invitationId: row.id, kind: input.kind, ...(input.platformRole ? { role: input.platformRole } : {}), ...(input.businessId ? { businessId: input.businessId, access: input.access } : {}) } });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: "An invitation to this address is already out." });
    throw error;
  }
  const invitationUrl = `${getTrustedApplicationOrigin()}${JOIN_PATH}/${encodeURIComponent(token)}`;
  const message = buildInvitationEmail({ kind: input.kind, fullName: input.fullName, url: invitationUrl, inviterName: input.inviterName, businessName: input.businessName, access: input.access });
  const delivery = await deliverEmail({ to: input.email, subject: message.subject, body: message.body, sender: "business_support" });
  await db.update(accountInvitations).set({ deliveryStatus: delivery.status }).where(eq(accountInvitations.id, invitation.id));
  // The link is shown once to whoever invited, because outbound email may not be set up yet.
  return { invitationId: invitation.id, invitationUrl, deliveryStatus: delivery.status };
}

// ---- IP Factory staff ----------------------------------------------------------------------------------------------

export const staffInvitationSchema = newInvitationSchema.extend({ role: z.enum(["admin", "desk_lead", "analyst", "partner", "subject_matter_expert", "finance"]) });

/** The Super Admin (manage_roles) invites a staff member with one role. Super Admin itself is never granted by invitation. */
export async function inviteStaff(db: Database, actor: StaffActor & { name: string | null }, rawInput: unknown) {
  if (!authorityAllows(actor.authority, "manage_roles")) throw new TRPCError({ code: "FORBIDDEN", message: "Only someone who manages roles can invite staff." });
  const input = staffInvitationSchema.parse(rawInput);
  if (await identityTaken(db, input.email)) throw new TRPCError({ code: "CONFLICT", message: "This email already has an account. Give that person a role instead." });
  return issue(db, { kind: "staff", email: input.email, fullName: input.fullName, platformRole: input.role, actorUserId: actor.id, inviterName: actor.name || BRAND.organisationName });
}

export async function listStaffInvitations(db: Database, actor: StaffActor) {
  if (!authorityAllows(actor.authority, "manage_roles")) throw new TRPCError({ code: "FORBIDDEN", message: "Only someone who manages roles can see staff invitations." });
  const rows = await db.select({ id: accountInvitations.id, email: accountInvitations.email, fullName: accountInvitations.fullName, role: accountInvitations.platformRole, status: accountInvitations.status, expiresAt: accountInvitations.expiresAt, deliveryStatus: accountInvitations.deliveryStatus, createdAt: accountInvitations.createdAt })
    .from(accountInvitations).where(eq(accountInvitations.kind, "staff")).orderBy(desc(accountInvitations.id)).limit(100);
  return rows.map(row => ({ ...row, status: invitationState(row) }));
}

/** Everyone with an internal role, for the Admin Team screen (the legacy list shows only legacy administrators). */
export async function listStaff(db: Database, actor: StaffActor) {
  if (!authorityAllows(actor.authority, "manage_roles")) throw new TRPCError({ code: "FORBIDDEN", message: "Only someone who manages roles can see the team." });
  const rows = await db.select({ userId: users.id, name: users.name, email: users.email, status: users.status, role: userPlatformRoles.role })
    .from(userPlatformRoles).innerJoin(users, eq(userPlatformRoles.userId, users.id)).orderBy(users.name);
  const people = new Map<number, { userId: number; name: string; email: string; status: string; roles: string[] }>();
  for (const row of rows) {
    const person = people.get(row.userId) ?? { userId: row.userId, name: row.name ?? "", email: row.email ?? "", status: row.status, roles: [] };
    person.roles.push(row.role);
    people.set(row.userId, person);
  }
  return Array.from(people.values());
}

export async function revokeStaffInvitation(db: Database, actor: StaffActor, input: { invitationId: number }) {
  if (!authorityAllows(actor.authority, "manage_roles")) throw new TRPCError({ code: "FORBIDDEN", message: "Only someone who manages roles can revoke staff invitations." });
  return revoke(db, { invitationId: input.invitationId, kind: "staff", actorUserId: actor.id });
}

async function revoke(db: Database, input: { invitationId: number; kind: "staff" | "business_member"; businessId?: number; actorUserId: number }) {
  const revoked = await db.update(accountInvitations).set({ status: "revoked", revokedAt: databaseNow() })
    .where(and(eq(accountInvitations.id, input.invitationId), eq(accountInvitations.kind, input.kind), eq(accountInvitations.status, "pending"), ...(input.businessId ? [eq(accountInvitations.businessId, input.businessId)] : [])))
    .returning({ id: accountInvitations.id, email: accountInvitations.email });
  if (revoked.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "Only a pending invitation can be revoked." });
  await recordAudit(db, { action: "account_invitation_revoked", actorUserId: input.actorUserId, targetEmail: revoked[0].email, details: { invitationId: revoked[0].id, kind: input.kind } });
  return { success: true } as const;
}

// ---- The owner's staff (seats) -------------------------------------------------------------------------------------

export const seatInvitationSchema = newInvitationSchema.extend({ access: z.enum(["full", "contributor"]) });

/** Only owner-level people of the business in use manage its seats. */
function requireOwnerLevel(session: AccountSession) {
  const business = session.activeBusiness;
  if (!business || business.role === "member") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can add people to the business." });
  return business;
}

/** The business's seats: who has one, who is invited, and how many are left. */
export async function listSeats(db: Database, session: AccountSession) {
  const business = requireOwnerLevel(session);
  const [members, invitations] = await Promise.all([
    db.select({ membershipId: businessMemberships.id, userId: users.id, name: users.name, email: users.email, access: businessMemberAccess.access })
      .from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
      .leftJoin(businessMemberAccess, eq(businessMemberAccess.membershipId, businessMemberships.id))
      .where(and(eq(businessMemberships.businessId, business.businessId), eq(businessMemberships.role, "member"), eq(businessMemberships.status, "active"))),
    db.select().from(accountInvitations).where(and(eq(accountInvitations.kind, "business_member"), eq(accountInvitations.businessId, business.businessId), eq(accountInvitations.status, "pending"))),
  ]);
  const pending = invitations.filter(item => invitationState(item) === "pending");
  return {
    included: TEAM_SEATS_INCLUDED,
    used: members.length + pending.length,
    members: members.map(member => ({ membershipId: member.membershipId, name: member.name ?? "", email: member.email ?? "", access: member.access ?? "full" as ClientAccessLevel })),
    invitations: pending.map(item => ({ id: item.id, fullName: item.fullName, email: item.email, access: item.access, expiresAt: item.expiresAt, deliveryStatus: item.deliveryStatus })),
  };
}

/** The owner invites someone into an included seat, as Full or Contributor. No paid seats in the pilot. */
export async function inviteSeat(db: Database, session: AccountSession, rawInput: unknown) {
  const business = requireOwnerLevel(session);
  const input = seatInvitationSchema.parse(rawInput);
  const seats = await listSeats(db, session);
  if (seats.used >= seats.included) throw new TRPCError({ code: "FORBIDDEN", message: `Your engagement includes ${seats.included === 1 ? "one person" : `${seats.included} people`} from your team. Remove them or their invitation to invite someone else.` });
  if (await identityTaken(db, input.email)) throw new TRPCError({ code: "CONFLICT", message: "This email already has an account. Ask IP Factory to help add them." });
  return issue(db, { kind: "business_member", email: input.email, fullName: input.fullName, businessId: business.businessId, access: input.access, actorUserId: session.user.id, inviterName: session.user.fullName, businessName: business.businessName });
}

export async function revokeSeatInvitation(db: Database, session: AccountSession, input: { invitationId: number }) {
  const business = requireOwnerLevel(session);
  return revoke(db, { invitationId: input.invitationId, kind: "business_member", businessId: business.businessId, actorUserId: session.user.id });
}

/** The owner frees a seat: the person loses access to the business at once. Their account stays (one identity). */
export async function removeSeat(db: Database, session: AccountSession, input: { membershipId: number }) {
  const business = requireOwnerLevel(session);
  const removed = await db.update(businessMemberships).set({ status: "removed" })
    .where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, business.businessId), eq(businessMemberships.role, "member"), ne(businessMemberships.status, "removed")))
    .returning({ id: businessMemberships.id, userId: businessMemberships.userId });
  if (removed.length !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "That person is not on your team." });
  await recordAudit(db, { action: "business_member_removed", actorUserId: session.user.id, details: { businessId: business.businessId, membershipId: removed[0].id, userId: removed[0].userId } });
  return { success: true } as const;
}

export async function setSeatAccess(db: Database, session: AccountSession, input: { membershipId: number; access: ClientAccessLevel }) {
  const business = requireOwnerLevel(session);
  const membership = (await db.select({ id: businessMemberships.id }).from(businessMemberships)
    .where(and(eq(businessMemberships.id, input.membershipId), eq(businessMemberships.businessId, business.businessId), eq(businessMemberships.role, "member"), eq(businessMemberships.status, "active"))).limit(1))[0];
  if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "That person is not on your team." });
  await db.insert(businessMemberAccess).values({ membershipId: membership.id, access: input.access, grantedByUserId: session.user.id })
    .onConflictDoUpdate({ target: businessMemberAccess.membershipId, set: { access: input.access, grantedByUserId: session.user.id } });
  return { success: true } as const;
}

// ---- Accepting -----------------------------------------------------------------------------------------------------

/** What the invited person sees before setting a password. Any unusable invitation looks the same. */
export async function previewAccountInvitation(db: Database, req: Request, token: string) {
  if (!consumeRateLimit("onboarding", req, "join-preview", 60)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  const invitation = (await db.select().from(accountInvitations).where(eq(accountInvitations.tokenHash, sha256(token))).limit(1))[0];
  if (!invitation || invitationState(invitation) !== "pending") return { available: false } as const;
  const business = invitation.businessId ? (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, invitation.businessId)).limit(1))[0] : null;
  return { available: true, kind: invitation.kind, email: invitation.email, fullName: invitation.fullName, businessName: business?.name ?? null, access: invitation.access } as const;
}

/**
 * Accepts an invitation: the person, the password and either the platform role or the membership with its access
 * level, plus the first session, in ONE transaction; the claim is conditional so two acceptances cannot both win.
 */
export async function acceptAccountInvitation(db: Database, req: Request, res: Response, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = acceptAccountInvitationSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  const input = parsed.data;
  if (!consumeRateLimit("onboarding", req, "join-accept", 10)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  const passwordHash = hashAdminPassword(input.password);
  let created;
  try {
    created = await db.transaction(async tx => {
      const invitation = (await tx.select().from(accountInvitations).where(eq(accountInvitations.tokenHash, sha256(input.token))).limit(1))[0];
      if (!invitation || invitationState(invitation) !== "pending") throw unavailable();
      if (input.email !== normaliseAccountEmail(invitation.email)) throw new TRPCError({ code: "BAD_REQUEST", message: ONBOARDING_ERRORS.emailMismatch });
      if (await identityTaken(tx, invitation.email)) throw new TRPCError({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccount });
      const [user] = await tx.insert(users).values({ openId: `local:${randomUUID()}`, name: input.fullName, email: invitation.email, loginMethod: "password", role: "user", status: "active" }).returning({ id: users.id });
      await tx.insert(userCredentials).values({ userId: user.id, passwordHash });
      let businessId: number | null = null;
      if (invitation.kind === "staff") {
        if (!invitation.platformRole || invitation.platformRole === "super_admin") throw unavailable();
        await tx.insert(userPlatformRoles).values({ userId: user.id, role: invitation.platformRole, grantedByUserId: invitation.createdByUserId });
      } else {
        const business = invitation.businessId ? (await tx.select({ id: businesses.id, status: businesses.status }).from(businesses).where(eq(businesses.id, invitation.businessId)).limit(1))[0] : undefined;
        if (!business || business.status !== "active") throw unavailable();
        const [membership] = await tx.insert(businessMemberships).values({ businessId: business.id, userId: user.id, role: "member", status: "active" }).returning({ id: businessMemberships.id });
        await tx.insert(businessMemberAccess).values({ membershipId: membership.id, access: invitation.access ?? "contributor", grantedByUserId: invitation.createdByUserId });
        businessId = business.id;
      }
      const session = await createSession(tx, user.id, businessId);
      const claimed = await tx.update(accountInvitations).set({ status: "accepted", acceptedAt: databaseNow(), acceptedByUserId: user.id })
        .where(and(eq(accountInvitations.id, invitation.id), eq(accountInvitations.status, "pending"), gt(accountInvitations.expiresAt, new Date()), isNull(accountInvitations.acceptedAt)))
        .returning({ id: accountInvitations.id });
      if (claimed.length !== 1) throw unavailable();
      await recordAudit(tx, { action: "account_invitation_accepted", actorUserId: user.id, targetEmail: invitation.email, details: { invitationId: invitation.id, kind: invitation.kind } });
      return { userId: user.id, email: invitation.email, session, businessId };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: ONBOARDING_ERRORS.existingAccount });
    throw error;
  }
  setSessionCookie(req, res, created.session.token);
  const authority = await loadAuthority(db, { id: created.userId, role: "user", email: created.email, status: "active" });
  const memberships = created.businessId
    ? (await db.select({ businessId: businesses.id, businessName: businesses.name }).from(businesses).where(inArray(businesses.id, [created.businessId])))
      .map(row => ({ businessId: row.businessId, businessName: row.businessName, role: "member" as const, status: "active" as const, profileComplete: false, profilePercent: 0 }))
    : [];
  return buildView({ id: created.userId, name: input.fullName, email: created.email }, authority, memberships, created.businessId);
}
