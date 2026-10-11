import { randomBytes } from "crypto";
import { and, desc, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import type { Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { adminInvitations, businessMemberships, businesses, userCredentials, users, userSessions } from "../drizzle/schema";
import {
  ACCOUNT_AUTH_ERRORS,
  ACCOUNT_LOCKOUT_MS,
  ACCOUNT_MAX_FAILED_ATTEMPTS,
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SESSION_MAX_AGE_MS,
  changePasswordInputSchema,
  landingPathFor,
  normaliseAccountEmail,
  updateAccountInputSchema,
  updateBusinessInputSchema,
  type AccountMembership,
  type AccountSessionView,
} from "../shared/auth";
import { businessRoleCan, type BusinessCapability } from "../shared/businessCapabilities";
import { businessProfileCompletion } from "../shared/businessMemberships";
import type { Authority, PlatformPermission } from "../shared/platformPermissions";
import { getAccountSessionCookieOptions } from "./_core/cookies";
import { recordAudit } from "./audit";
import { getDb } from "./db";
import { databaseNow, emailEquals } from "./dbHelpers";
// The proven scrypt format and constant-time comparison already used for administrator passwords.
import { hashAdminPassword, OWNER_ADMIN_EMAIL, sha256, verifyAdminPasswordHash } from "./adminSecurity";
import { loadAuthority } from "./platformAccess";
import { consumeLimit, releaseLimit } from "./rateLimit";
import { isSameHostOrigin, isTrustedBrowserOrigin } from "./security";

const PG_UNIQUE_VIOLATION = "23505";
const RATE_LIMIT_WINDOW_MS = ACCOUNT_LOCKOUT_MS;


export function isUniqueViolation(error: unknown) {
  const candidate = error as { code?: string; cause?: { code?: string } } | undefined;
  return candidate?.code === PG_UNIQUE_VIOLATION || candidate?.cause?.code === PG_UNIQUE_VIOLATION;
}

function requestIp(req: Request) {
  return (req.ip || "unknown").trim().toLowerCase();
}

/**
 * Throttle keyed on address + email (or address + action for token previews), shared by every function instance
 * through server/rateLimit.ts; the database lockout below is the per-account control. `maximum` attempts per
 * 15 minutes.
 */
export function consumeRateLimit(action: "onboarding" | "signin", req: Request, email: string, maximum: number) {
  return consumeLimit({ scope: `${action}_${email === "preview" || email === "accept" || email === "join-preview" || email === "join-accept" ? email : "email"}`, max: maximum, windowMs: RATE_LIMIT_WINDOW_MS }, `${requestIp(req)}:${email}`);
}

/** Clears the throttle for an address + email after a successful sign-in. */
function releaseRateLimit(action: "onboarding" | "signin", req: Request, email: string) {
  return releaseLimit({ scope: `${action}_email`, max: 0, windowMs: RATE_LIMIT_WINDOW_MS }, `${requestIp(req)}:${email}`);
}

/**
 * Account cookies are SameSite=Lax and every mutation is a JSON POST, which browsers refuse to send
 * cross-site without a CORS preflight. This adds an explicit Origin check: a request that names another
 * site's origin is rejected. A missing Origin (non-browser client) carries no ambient cookie risk.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
  if (isTrustedBrowserOrigin(origin) || isSameHostOrigin(origin, host)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.crossSite });
}

let dummyPasswordHash: string | undefined;
/** Verified when no account matches, so a wrong email costs the same time as a wrong password. */
function burnPasswordCheck(password: string) {
  dummyPasswordHash ??= hashAdminPassword(randomBytes(16).toString("hex"));
  verifyAdminPasswordHash(password, dummyPasswordHash);
}

export function slugify(name: string) {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "business"}-${randomBytes(3).toString("hex")}`;
}

export async function createSession(tx: Pick<Database, "insert">, userId: number, activeBusinessId: number | null = null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCOUNT_SESSION_MAX_AGE_MS);
  await tx.insert(userSessions).values({ userId, tokenHash: sha256(token), expiresAt, activeBusinessId });
  return { token, expiresAt };
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(ACCOUNT_SESSION_COOKIE, token, { ...getAccountSessionCookieOptions(req), maxAge: ACCOUNT_SESSION_MAX_AGE_MS });
}

function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(ACCOUNT_SESSION_COOKIE, { ...getAccountSessionCookieOptions(req), maxAge: -1 });
}

/** True when the request carries an account session cookie (valid or not). */
export function hasAccountSessionCookie(req: Request) {
  return readSessionToken(req) !== null;
}

function readSessionToken(req: Request) {
  const header = req.headers.cookie || "";
  for (const item of header.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === ACCOUNT_SESSION_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** A resolved session: the safe view, plus the identifiers and authority the server needs and the client never sees. */
export type AccountSession = AccountSessionView & {
  sessionId: number;
  authority: Authority;
};

async function loadMemberships(db: Pick<Database, "select">, userId: number): Promise<AccountMembership[]> {
  const rows = await db
    .select({
      businessId: businesses.id,
      businessName: businesses.name,
      role: businessMemberships.role,
      description: businesses.description,
      yearFounded: businesses.yearFounded,
      sector: businesses.sector,
      website: businesses.website,
    })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businessMemberships.businessId, businesses.id))
    .where(and(eq(businessMemberships.userId, userId), eq(businessMemberships.status, "active"), eq(businesses.status, "active")))
    .orderBy(businessMemberships.id);
  return rows.map(row => {
    const completion = businessProfileCompletion({ name: row.businessName, description: row.description, yearFounded: row.yearFounded, sector: row.sector, website: row.website });
    return { businessId: row.businessId, businessName: row.businessName, role: row.role, status: "active" as const, profileComplete: completion.complete, profilePercent: completion.percent };
  });
}

/**
 * The active workspace. A stored choice is honoured only while it is still an active membership (so removing a
 * membership invalidates it at once); otherwise one membership selects itself and, with several, the first is used
 * until the person switches. Nobody with no membership gets a workspace: that is valid for internal staff.
 */
export function chooseActiveBusiness(memberships: AccountMembership[], storedBusinessId: number | null | undefined) {
  return memberships.find(item => item.businessId === storedBusinessId) ?? memberships[0] ?? null;
}

export function buildView(
  user: { id: number; name: string | null; email: string | null },
  authority: Authority,
  memberships: AccountMembership[],
  storedBusinessId: number | null = null,
): AccountSessionView {
  const view = {
    user: { id: user.id, fullName: user.name ?? "", email: user.email ?? "", status: "active" as const },
    platformRoles: authority.roles,
    permissions: authority.permissions,
    memberships,
    activeBusiness: chooseActiveBusiness(memberships, storedBusinessId),
  };
  return { ...view, landingPath: landingPathFor(view) };
}

/** The single way to find who is signed in: the session cookie, checked against the database on every call. */
export async function resolveAccountSession(req: Request): Promise<AccountSession | null> {
  const token = readSessionToken(req);
  if (!token) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      sessionId: userSessions.id,
      activeBusinessId: userSessions.activeBusinessId,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.tokenHash, sha256(token)), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date()), eq(users.status, "active")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const [memberships, authority] = await Promise.all([
    loadMemberships(db, row.userId),
    loadAuthority(db, { id: row.userId, role: row.role, email: row.email, status: row.status }),
  ]);
  return { sessionId: row.sessionId, authority, ...buildView({ id: row.userId, name: row.name, email: row.email }, authority, memberships, row.activeBusinessId) };
}

export function toAccountView({ sessionId: _sessionId, authority: _authority, ...view }: AccountSession): AccountSessionView {
  return view;
}

/**
 * Isolation rule: a business id supplied by the client is never trusted. The caller must hold an active
 * membership in it. A business that does not exist and one the caller cannot access look the same.
 */
export function requireBusinessMembership(session: Pick<AccountSession, "memberships">, businessId: number): AccountMembership {
  const membership = session.memberships.find(item => item.businessId === businessId);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
  return membership;
}

/** Membership plus a named capability, so routers never compare raw roles. */
export function requireBusinessCapability(session: Pick<AccountSession, "memberships">, businessId: number, capability: BusinessCapability): AccountMembership {
  const membership = requireBusinessMembership(session, businessId);
  if (!businessRoleCan(membership.role, capability)) {
    throw new TRPCError({ code: "FORBIDDEN", message: capability === "edit_business_profile" ? ACCOUNT_AUTH_ERRORS.cannotEditBusiness : ACCOUNT_AUTH_ERRORS.noBusinessAccess });
  }
  return membership;
}

/** The workspace the caller is acting in, or a clear refusal when they have none (a valid state for internal staff). */
export function requireActiveBusiness(session: Pick<AccountSession, "activeBusiness">): AccountMembership {
  if (!session.activeBusiness) throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noActiveBusiness });
  return session.activeBusiness;
}

export function requirePlatformPermission(session: Pick<AccountSession, "permissions">, permission: PlatformPermission) {
  if (!session.permissions.includes(permission)) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include this responsibility." });
}

export async function emailIsReserved(db: Pick<Database, "select">, email: string) {
  if (OWNER_ADMIN_EMAIL && email === OWNER_ADMIN_EMAIL) return true;
  const invited = await db.select({ id: adminInvitations.id }).from(adminInvitations).where(and(emailEquals(adminInvitations.email, email), eq(adminInvitations.status, "Pending"))).limit(1);
  return invited.length > 0;
}

/** Wrong email, wrong password, unknown account and suspended account all fail with the same message. */
export async function signInAccount(req: Request, res: Response, rawInput: { email: string; password: string }, options: { internalOnly?: boolean } = {}) {
  assertSameOrigin(req);
  const email = normaliseAccountEmail(rawInput.email);
  if (!(await consumeRateLimit("signin", req, email, ACCOUNT_MAX_FAILED_ATTEMPTS))) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const user = email ? (await db.select().from(users).where(emailEquals(users.email, email)).limit(1))[0] : undefined;
  const credential = user ? (await db.select().from(userCredentials).where(eq(userCredentials.userId, user.id)).limit(1))[0] : undefined;
  if (!user || !credential || user.status !== "active") {
    burnPasswordCheck(rawInput.password);
    throw new TRPCError({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
  }
  if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
    await recordAudit(db, { action: "account_sign_in_locked", actorUserId: user.id, targetEmail: user.email });
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  }
  if (!verifyAdminPasswordHash(rawInput.password, credential.passwordHash)) {
    const attempts = credential.failedAttempts + 1;
    const lock = attempts >= ACCOUNT_MAX_FAILED_ATTEMPTS ? new Date(Date.now() + ACCOUNT_LOCKOUT_MS) : null;
    await db.update(userCredentials).set({ failedAttempts: lock ? 0 : attempts, lockedUntil: lock }).where(eq(userCredentials.id, credential.id));
    // Only an existing account is recorded (an unknown address would let anyone fill the log); no password is ever stored.
    await recordAudit(db, { action: "account_sign_in_failed", actorUserId: user.id, targetEmail: user.email, details: { attempts, locked: Boolean(lock) } });
    throw new TRPCError({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.invalidCredentials });
  }

  const authority = await loadAuthority(db, user);
  if (options.internalOnly && authority.roles.length === 0) {
    // The password was right but this person has no internal role: no session is created at all.
    await recordAudit(db, { action: "admin_sign_in_refused", actorUserId: user.id, targetEmail: user.email });
    throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.notAuthorisedForAdmin });
  }

  const memberships = await loadMemberships(db, user.id);
  const session = await db.transaction(async tx => {
    await tx.update(userCredentials).set({ failedAttempts: 0, lockedUntil: null }).where(eq(userCredentials.id, credential.id));
    await tx.update(users).set({ lastSignedIn: databaseNow() }).where(eq(users.id, user.id));
    // Restore the workspace used last time, if the person still belongs to it.
    const previous = (await tx.select({ activeBusinessId: userSessions.activeBusinessId }).from(userSessions)
      .where(and(eq(userSessions.userId, user.id), isNotNull(userSessions.activeBusinessId))).orderBy(desc(userSessions.id)).limit(1))[0];
    const restored = chooseActiveBusiness(memberships, previous?.activeBusinessId ?? null)?.businessId ?? null;
    const created = await createSession(tx, user.id, restored);
    await recordAudit(tx, { action: "account_signed_in", actorUserId: user.id, targetEmail: user.email });
    return { ...created, restored };
  });
  await releaseRateLimit("signin", req, email);
  setSessionCookie(req, res, session.token);
  return buildView(user, authority, memberships, session.restored);
}

/** Revokes the current session server-side and clears the cookie. Safe to call when already signed out. */
export async function signOutAccount(req: Request, res: Response) {
  assertSameOrigin(req);
  const token = readSessionToken(req);
  if (token) {
    const db = await getDb();
    if (db) {
      const live = (await db.select({ userId: userSessions.userId }).from(userSessions).where(and(eq(userSessions.tokenHash, sha256(token)), isNull(userSessions.revokedAt))).limit(1))[0];
      if (live) {
        await db.transaction(async tx => {
          await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.tokenHash, sha256(token)), isNull(userSessions.revokedAt)));
          await recordAudit(tx, { action: "account_signed_out", actorUserId: live.userId });
        });
      }
    }
  }
  clearSessionCookie(req, res);
  return { success: true } as const;
}

/**
 * Chooses the active workspace for this session. The business id is verified against an active membership on the
 * server; it never creates a new session and never reveals a business the person cannot access.
 */
export async function switchWorkspace(req: Request, session: AccountSession, businessId: number): Promise<AccountSessionView> {
  assertSameOrigin(req);
  const membership = requireBusinessMembership(session, businessId);
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  await db.transaction(async tx => {
    await tx.update(userSessions).set({ activeBusinessId: membership.businessId }).where(eq(userSessions.id, session.sessionId));
    await recordAudit(tx, { action: "workspace_switched", actorUserId: session.user.id, targetEmail: session.user.email, details: { businessId: membership.businessId, from: session.activeBusiness?.businessId ?? null } });
  });
  return toAccountView({ ...session, activeBusiness: membership });
}

const BUSINESS_PROFILE_COLUMNS = ["description", "yearFounded", "sector", "website", "staffBand", "revenueBand", "country", "state"] as const;

/** The business profile as one member of that business sees it, with what their role lets them do. */
export async function getBusinessProfile(session: AccountSession, businessId: number) {
  const membership = requireBusinessCapability(session, businessId, "view_business");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const business = (await db.select().from(businesses).where(eq(businesses.id, membership.businessId)).limit(1))[0];
  if (!business) throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.noBusinessAccess });
  const completion = businessProfileCompletion(business);
  return {
    businessId: business.id,
    name: business.name,
    description: business.description,
    yearFounded: business.yearFounded,
    sector: business.sector,
    website: business.website,
    staffBand: business.staffBand,
    revenueBand: business.revenueBand,
    country: business.country,
    state: business.state,
    logoUrl: business.logoUrl,
    role: membership.role,
    canEdit: businessRoleCan(membership.role, "edit_business_profile"),
    completion,
  };
}

/** Updates only the fields sent. Checked against the caller's membership and role on the server. */
export async function updateBusinessProfile(req: Request, session: AccountSession, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = updateBusinessInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  const { businessId, ...fields } = parsed.data;
  requireBusinessCapability(session, businessId, "edit_business_profile");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const changes: Record<string, string | number | null> = {};
  if (fields.name !== undefined) changes.name = fields.name;
  for (const key of BUSINESS_PROFILE_COLUMNS) if (fields[key] !== undefined) changes[key] = fields[key] as string | number | null;
  if (Object.keys(changes).length === 0) return getBusinessProfile(session, businessId);

  await db.transaction(async tx => {
    await tx.update(businesses).set(changes).where(eq(businesses.id, businessId));
    await recordAudit(tx, { action: "business_profile_updated", actorUserId: session.user.id, targetEmail: session.user.email, details: { businessId, fields: Object.keys(changes) } });
  });
  const refreshed = await resolveAccountSessionFromId(db, session);
  return getBusinessProfile(refreshed, businessId);
}

/** Re-reads memberships (names and completion changed) without touching the cookie. */
async function resolveAccountSessionFromId(db: Database, session: AccountSession): Promise<AccountSession> {
  const memberships = await loadMemberships(db, session.user.id);
  return { ...session, memberships, activeBusiness: chooseActiveBusiness(memberships, session.activeBusiness?.businessId ?? null) };
}

/** Only the signed-in person's own name. Email is the identity key and is never changed here. */
export async function updateAccountProfile(req: Request, session: AccountSession, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = updateAccountInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  await db.transaction(async tx => {
    await tx.update(users).set({ name: parsed.data.fullName }).where(eq(users.id, session.user.id));
    await recordAudit(tx, { action: "account_profile_updated", actorUserId: session.user.id, targetEmail: session.user.email, details: { fields: ["name"] } });
  });
  return toAccountView({ ...session, user: { ...session.user, fullName: parsed.data.fullName } });
}

/**
 * Changes the signed-in person's password. The current password must be right (wrong guesses count towards the
 * same lockout as sign-in). The new password is rehashed, every OTHER session is revoked so a stolen session
 * cannot outlive the change, and the current session stays signed in.
 */
export async function changeAccountPassword(req: Request, session: AccountSession, rawInput: unknown) {
  assertSameOrigin(req);
  const parsed = changePasswordInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Check the details and try again." });
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const credential = (await db.select().from(userCredentials).where(eq(userCredentials.userId, session.user.id)).limit(1))[0];
  if (!credential) throw new TRPCError({ code: "FORBIDDEN", message: ACCOUNT_AUTH_ERRORS.wrongCurrentPassword });
  if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: ACCOUNT_AUTH_ERRORS.tooManyRequests });
  }
  if (!verifyAdminPasswordHash(parsed.data.currentPassword, credential.passwordHash)) {
    const attempts = credential.failedAttempts + 1;
    const lock = attempts >= ACCOUNT_MAX_FAILED_ATTEMPTS ? new Date(Date.now() + ACCOUNT_LOCKOUT_MS) : null;
    await db.update(userCredentials).set({ failedAttempts: lock ? 0 : attempts, lockedUntil: lock }).where(eq(userCredentials.id, credential.id));
    throw new TRPCError({ code: "BAD_REQUEST", message: ACCOUNT_AUTH_ERRORS.wrongCurrentPassword });
  }
  const newHash = hashAdminPassword(parsed.data.newPassword);
  await db.transaction(async tx => {
    await tx.update(userCredentials).set({ passwordHash: newHash, failedAttempts: 0, lockedUntil: null }).where(eq(userCredentials.id, credential.id));
    await tx.update(userSessions).set({ revokedAt: databaseNow() }).where(and(eq(userSessions.userId, session.user.id), isNull(userSessions.revokedAt), ne(userSessions.id, session.sessionId)));
    await recordAudit(tx, { action: "account_password_changed", actorUserId: session.user.id, targetEmail: session.user.email });
  });
  return { success: true } as const;
}
