import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { businessMemberships, userCredentials, userPasswordResetTokens, userPlatformRoles, users, userSessions } from "../drizzle/schema";
import { ACCOUNT_AUTH_ERRORS, PASSWORD_RESET_ERRORS, PASSWORD_RESET_TTL_MS, requestPasswordResetInputSchema, resetPasswordInputSchema, type PlatformRole } from "../shared/auth";
import { BRAND } from "../shared/brand";
import type { Authority } from "../shared/platformPermissions";
import { assertSameOrigin, type Database } from "./accountAuth";
import { hashAdminPassword, isOwnerAdmin, sha256 } from "./adminSecurity";
import { recordAudit } from "./audit";
import { databaseNow, emailEquals, isUndefinedTable } from "./dbHelpers";
import { deliverEmail } from "./email";
import { listSuperAdminIds } from "./platformAccess";
import { consumeLimit, LIMITS } from "./rateLimit";
import { getTrustedApplicationOrigin } from "./security";

/**
 * Account recovery for universal accounts (clients and staff). A reset link reaches a person two ways: a member of the
 * team with `manage_users` issues one (emailed, and shown once to the issuer while email is deferred, as invitations
 * are), or the person asks for one with "Forgot your password?" on a sign-in page, which only ever emails it and
 * answers the same whether or not an account exists. The link is a 256-bit token stored as its SHA-256, works once,
 * within PASSWORD_RESET_TTL_MS, and signs the person out everywhere when used. For the permanent Super Admin
 * (OWNER_ADMIN_EMAIL) the same link also sets the first password, so the owner never needs database access to get in:
 * control of the owner's mailbox is the proof. The same responsibility suspends and reinstates accounts; suspension
 * revokes every session at once.
 */

export const RESET_PATH = "/reset";

export type Actor = { id: number; email: string | null; authority: Authority };

const isSuperAdmin = (authority: Authority) => authority.roles.includes("super_admin");
const unavailable = () => new TRPCError({ code: "NOT_FOUND", message: PASSWORD_RESET_ERRORS.unavailable });
const notSetUp = () => new TRPCError({ code: "PRECONDITION_FAILED", message: PASSWORD_RESET_ERRORS.notSetUp });
const tooMany = () => new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
const requestIp = (req: Request) => (req.ip || "unknown").trim().toLowerCase();

/** Everyone who can sign in with a password, with their roles and whether they are a Super Admin. For `manage_users`. */
export async function listPeople(db: Pick<Database, "select">) {
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, lastSignedIn: users.lastSignedIn })
    .from(users).innerJoin(userCredentials, eq(userCredentials.userId, users.id)).orderBy(users.name, users.id).limit(500);
  const roles = await db.select({ userId: userPlatformRoles.userId, role: userPlatformRoles.role }).from(userPlatformRoles);
  const memberships = await db.select({ userId: businessMemberships.userId }).from(businessMemberships).where(eq(businessMemberships.status, "active"));
  const rolesOf = new Map<number, PlatformRole[]>();
  for (const row of roles) rolesOf.set(row.userId, [...(rolesOf.get(row.userId) ?? []), row.role]);
  const businessesOf = new Map<number, number>();
  for (const row of memberships) businessesOf.set(row.userId, (businessesOf.get(row.userId) ?? 0) + 1);
  return rows.map(row => ({
    ...row,
    roles: rolesOf.get(row.id) ?? [],
    businesses: businessesOf.get(row.id) ?? 0,
    superAdmin: isOwnerAdmin({ email: row.email }) || (rolesOf.get(row.id) ?? []).includes("super_admin"),
  }));
}

/**
 * The email that carries the reset link. The "Reset your password: <link>" line becomes the button in the layout.
 * `requested` when the person asked for it themselves; `firstPassword` when the owner has no password yet.
 */
export function buildResetEmail(input: { name: string; url: string; requested?: boolean; firstPassword?: boolean }) {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  const verb = input.firstPassword ? "set" : "reset";
  const why = input.requested
    ? `Someone asked to ${verb} the password for this email address on ${BRAND.productName}.`
    : `A member of the ${BRAND.organisationName} team issued a link to reset your password on ${BRAND.productName}.`;
  return {
    subject: `${input.firstPassword ? "Set" : "Reset"} your password on ${BRAND.productName}`,
    body: [
      `Dear ${first},`,
      "",
      `${why} The link works once and expires in 20 minutes.`,
      "",
      `${input.firstPassword ? "Set" : "Reset"} your password: ${input.url}`,
      "",
      `If you did not ask for this, you can ignore this email: ${input.firstPassword ? "nothing changes until the link is used" : "your password stays as it is"}.`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

async function personWithPassword(db: Pick<Database, "select">, userId: number) {
  const person = (await db.select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(users).innerJoin(userCredentials, eq(userCredentials.userId, users.id)).where(eq(users.id, userId)).limit(1))[0];
  if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "That person does not have a password account." });
  return person;
}

async function protectedPerson(db: Pick<Database, "select">, person: { id: number; email: string | null }) {
  return isOwnerAdmin({ email: person.email }) || (await listSuperAdminIds(db)).has(person.id);
}

/** Issues (and emails) a reset link for a person; a new link revokes the one still out. The raw link is returned once. */
export async function issuePasswordReset(db: Database, input: { actor: Actor; targetUserId: number }) {
  const target = await personWithPassword(db, input.targetUserId);
  if (!target.email) throw new TRPCError({ code: "BAD_REQUEST", message: "This account has no email address to send the link to." });
  if (target.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "Reinstate the account before issuing a reset link." });
  if ((await protectedPerson(db, target)) && !isSuperAdmin(input.actor.authority)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only a Super Admin can issue a reset link for a Super Admin." });
  }
  return sendResetLink(db, { target: { id: target.id, name: target.name, email: target.email }, actorUserId: input.actor.id });
}

/**
 * A reset link for a client, from their record in the console (`manage_client_onboarding`). Only for a client account:
 * someone who is also on the team, or a Super Admin, gets their link from People (`manage_users`), so this permission
 * never reaches a staff account.
 */
export async function issueClientReset(db: Database, input: { actorUserId: number; targetUserId: number }) {
  const target = (await db.select({ id: users.id, name: users.name, email: users.email, status: users.status })
    .from(users).innerJoin(userCredentials, eq(userCredentials.userId, users.id)).where(eq(users.id, input.targetUserId)).limit(1))[0];
  if (!target || !target.email) throw new TRPCError({ code: "NOT_FOUND", message: "This client does not have a password account yet." });
  if (target.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "This client's account is suspended. Reinstate it in People first." });
  const roles = await db.select({ id: userPlatformRoles.id }).from(userPlatformRoles).where(eq(userPlatformRoles.userId, target.id)).limit(1);
  if (roles.length || (await protectedPerson(db, target))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This person is also on the IP Factory team. Send their link from People." });
  }
  return sendResetLink(db, { target: { id: target.id, name: target.name, email: target.email }, actorUserId: input.actorUserId });
}

/**
 * Stores a new link for a person (revoking the one still out), audits it and emails it. `actorUserId` is null when the
 * person asked for it themselves. The raw link is returned to the caller, which decides whether anyone may see it.
 */
async function sendResetLink(db: Database, input: { target: { id: number; name: string | null; email: string }; actorUserId: number | null; firstPassword?: boolean }) {
  const { target } = input;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  let resetId: number;
  try {
    resetId = await db.transaction(async tx => {
      await tx.update(userPasswordResetTokens).set({ revokedAt: databaseNow() })
        .where(and(eq(userPasswordResetTokens.userId, target.id), isNull(userPasswordResetTokens.consumedAt), isNull(userPasswordResetTokens.revokedAt)));
      const [row] = await tx.insert(userPasswordResetTokens)
        .values({ userId: target.id, tokenHash: sha256(token), expiresAt, issuedByUserId: input.actorUserId })
        .returning({ id: userPasswordResetTokens.id });
      await recordAudit(tx, {
        action: input.actorUserId === null ? "account_password_reset_requested" : "account_password_reset_issued",
        actorUserId: input.actorUserId ?? target.id,
        targetEmail: target.email,
        details: { targetUserId: target.id, resetId: row.id, expiresAt: expiresAt.toISOString(), ...(input.firstPassword ? { firstPassword: true } : {}) },
      });
      return row.id;
    });
  } catch (error) {
    if (isUndefinedTable(error)) throw notSetUp();
    throw error;
  }
  const resetUrl = `${getTrustedApplicationOrigin()}${RESET_PATH}/${encodeURIComponent(token)}`;
  const message = buildResetEmail({ name: target.name ?? "", url: resetUrl, requested: input.actorUserId === null, firstPassword: input.firstPassword });
  const delivery = await deliverEmail({ to: target.email, subject: message.subject, body: message.body, sender: "business_support", idempotencyKey: `user_password_reset_tokens:${resetId}` });
  await db.update(userPasswordResetTokens).set({ deliveryStatus: delivery.status }).where(eq(userPasswordResetTokens.id, resetId));
  return { resetId, resetUrl, expiresAt, deliveryStatus: delivery.status };
}

/**
 * "Forgot your password?": emails a reset link to an active account with a password, or a first-password link to the
 * permanent Super Admin (creating the owner's account if the database has none yet, as `pnpm owner:bootstrap` does).
 * Every outcome answers the same, the link is never returned, and requests are limited per address and per email, so
 * the form neither reveals who has an account nor floods an inbox.
 */
export async function requestPasswordReset(db: Database, req: Request, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = requestPasswordResetInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Enter the email address you sign in with." });
  const email = parsed.data.email;
  if (!(await consumeLimit(LIMITS.resetRequest, `ip:${requestIp(req)}`)) || !(await consumeLimit(LIMITS.resetRequest, `email:${email}`))) throw tooMany();
  const owner = isOwnerAdmin({ email });
  let person = (await db.select({ id: users.id, name: users.name, email: users.email, status: users.status, credentialId: userCredentials.id })
    .from(users).leftJoin(userCredentials, eq(userCredentials.userId, users.id)).where(emailEquals(users.email, email)).limit(1))[0];
  if (!person && owner) {
    const [created] = await db.insert(users).values({ openId: `local:${randomUUID()}`, name: "Super Admin", email, loginMethod: "password", role: "admin", status: "active" })
      .returning({ id: users.id, name: users.name, email: users.email, status: users.status });
    person = { ...created, credentialId: null };
  }
  if (!person || person.status !== "active" || !person.email) return { success: true as const };
  if (person.credentialId === null && !owner) return { success: true as const };
  await sendResetLink(db, { target: { id: person.id, name: person.name, email: person.email }, actorUserId: null, firstPassword: person.credentialId === null });
  return { success: true as const };
}

async function openReset(db: Pick<Database, "select">, token: string) {
  if (!token || token.length > 200) return null;
  return (await db.select({ id: userPasswordResetTokens.id, userId: users.id, email: users.email, status: users.status })
    .from(userPasswordResetTokens)
    .innerJoin(users, eq(users.id, userPasswordResetTokens.userId))
    .where(and(
      eq(userPasswordResetTokens.tokenHash, sha256(token)),
      isNull(userPasswordResetTokens.consumedAt),
      isNull(userPasswordResetTokens.revokedAt),
      gt(userPasswordResetTokens.expiresAt, new Date()),
    )).limit(1))[0] ?? null;
}

/** What the reset page shows first: whether the link is usable and for which address. Every unusable link looks the same. */
export async function previewPasswordReset(db: Pick<Database, "select">, req: Request, token: string) {
  if (!(await consumeLimit(LIMITS.publicLookup, requestIp(req)))) throw tooMany();
  try {
    const reset = await openReset(db, token);
    return reset && reset.status === "active" && reset.email ? { available: true as const, email: reset.email } : { available: false as const };
  } catch (error) {
    if (isUndefinedTable(error)) return { available: false as const };
    throw error;
  }
}

/**
 * Sets the new password from a reset link: the link is claimed in one conditional statement, the password replaced,
 * the lockout cleared and every session of the person revoked, all in one transaction. The person then signs in.
 */
export async function confirmPasswordReset(db: Database, req: Request, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = resetPasswordInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  if (!(await consumeLimit(LIMITS.publicLookup, requestIp(req)))) throw tooMany();
  const passwordHash = hashAdminPassword(parsed.data.password);
  try {
    return await db.transaction(async tx => {
      const [claimed] = await tx.update(userPasswordResetTokens).set({ consumedAt: databaseNow() })
        .where(and(
          eq(userPasswordResetTokens.tokenHash, sha256(parsed.data.token)),
          isNull(userPasswordResetTokens.consumedAt),
          isNull(userPasswordResetTokens.revokedAt),
          gt(userPasswordResetTokens.expiresAt, new Date()),
        )).returning({ userId: userPasswordResetTokens.userId });
      if (!claimed) throw unavailable();
      const person = (await tx.select({ id: users.id, email: users.email, status: users.status }).from(users).where(eq(users.id, claimed.userId)).limit(1))[0];
      if (!person || person.status !== "active") throw unavailable();
      const [credential] = await tx.update(userCredentials).set({ passwordHash, failedAttempts: 0, lockedUntil: null })
        .where(eq(userCredentials.userId, person.id)).returning({ id: userCredentials.id });
      const owner = isOwnerAdmin({ email: person.email });
      // Only the permanent Super Admin gets a first password from a link; anyone else without one is refused.
      if (!credential && !owner) throw unavailable();
      if (!credential) await tx.insert(userCredentials).values({ userId: person.id, passwordHash });
      if (owner) {
        await tx.update(users).set({ role: "admin" }).where(eq(users.id, person.id));
        await tx.insert(userPlatformRoles).values({ userId: person.id, role: "super_admin", grantedByUserId: person.id }).onConflictDoNothing();
      }
      await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.userId, person.id), isNull(userSessions.revokedAt)));
      await recordAudit(tx, { action: "account_password_reset_completed", actorUserId: person.id, targetEmail: person.email, ...(credential ? {} : { details: { firstPassword: true } }) });
      return { success: true as const, email: person.email ?? "" };
    });
  } catch (error) {
    if (isUndefinedTable(error)) throw unavailable();
    throw error;
  }
}

/**
 * Suspends or reinstates a person. Suspension revokes every session at once and sign-in refuses with the generic
 * message. Nobody changes their own account; only a Super Admin touches a Super Admin; the permanent and the last
 * Super Admin cannot be suspended.
 */
export async function setAccountStatus(db: Database, input: { actor: Actor; targetUserId: number; status: "active" | "suspended"; reason?: string }) {
  if (input.targetUserId === input.actor.id) throw new TRPCError({ code: "CONFLICT", message: "You cannot suspend or reinstate your own account." });
  const target = (await db.select({ id: users.id, email: users.email, status: users.status }).from(users).where(eq(users.id, input.targetUserId)).limit(1))[0];
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That person does not exist." });
  if (target.status === "disabled") throw new TRPCError({ code: "CONFLICT", message: "This account is disabled and is not managed here." });
  if (target.status === input.status) return { success: true as const, changed: false as const, status: target.status };
  const superAdmins = await listSuperAdminIds(db);
  if (superAdmins.has(target.id) || isOwnerAdmin({ email: target.email })) {
    if (!isSuperAdmin(input.actor.authority)) throw new TRPCError({ code: "FORBIDDEN", message: "Only a Super Admin can suspend or reinstate a Super Admin." });
    if (input.status === "suspended" && isOwnerAdmin({ email: target.email })) throw new TRPCError({ code: "CONFLICT", message: "The permanent Super Admin cannot be suspended." });
    if (input.status === "suspended" && superAdmins.size <= 1) throw new TRPCError({ code: "CONFLICT", message: "The last Super Admin cannot be suspended." });
  }
  const reason = input.reason?.trim() || "";
  await db.transaction(async tx => {
    await tx.update(users).set({ status: input.status }).where(eq(users.id, target.id));
    if (input.status === "suspended") await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.userId, target.id), isNull(userSessions.revokedAt)));
    await recordAudit(tx, {
      action: input.status === "suspended" ? "account_suspended" : "account_reinstated",
      actorUserId: input.actor.id,
      targetEmail: target.email,
      details: { targetUserId: target.id, ...(reason ? { reason } : {}) },
    });
  });
  return { success: true as const, changed: true as const, status: input.status };
}
