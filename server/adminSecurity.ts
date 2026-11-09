import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { adminAccessSessions, adminCredentials, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { getAdminAccessCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { databaseNow } from "./dbHelpers";
export const ADMIN_ACCESS_COOKIE = "jump_admin_access";
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const ADMIN_PASSWORD_LOCKOUT_MS = 15 * 60 * 1000;
export const OWNER_ADMIN_EMAIL = ENV.ownerAdminEmail;

export function normalizeAdminEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

export function isOwnerAdmin(user: Pick<User, "email">) {
  const email = normalizeAdminEmail(user.email);
  return email !== "" && email === OWNER_ADMIN_EMAIL;
}

export function validateAdminPassword(password: string) {
  const categories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `Use at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (categories < 3) {
    return "Use at least three of: uppercase letters, lowercase letters, numbers, and symbols.";
  }
  return null;
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyAdminPasswordHash(password: string, stored: string) {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie || "";
  for (const item of cookieHeader.split(";")) {
    const [key, ...rawValue] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export async function hasVerifiedAdminAccess(req: Request, userId: number) {
  const rawToken = readCookie(req, ADMIN_ACCESS_COOKIE);
  if (!rawToken) return false;
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ id: adminAccessSessions.id })
    .from(adminAccessSessions)
    .where(
      and(
        eq(adminAccessSessions.userId, userId),
        eq(adminAccessSessions.tokenHash, sha256(rawToken)),
        isNull(adminAccessSessions.revokedAt),
        gt(adminAccessSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return result.length > 0;
}

export async function issueAdminAccessSession(req: Request, res: Response, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_MS);
  await db.insert(adminAccessSessions).values({
    userId,
    tokenHash: sha256(rawToken),
    expiresAt,
  });
  res.cookie(ADMIN_ACCESS_COOKIE, rawToken, {
    ...getAdminAccessCookieOptions(req),
    maxAge: ADMIN_SESSION_MAX_AGE_MS,
  });
  return expiresAt;
}

export async function revokeAdminSessionsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(adminAccessSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminAccessSessions.userId, userId), isNull(adminAccessSessions.revokedAt)));
}

export function clearAdminAccessSession(req: Request, res: Response) {
  res.clearCookie(ADMIN_ACCESS_COOKIE, { ...getAdminAccessCookieOptions(req), maxAge: -1 });
}

export async function setAdminPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(adminCredentials).values({
    userId,
    passwordHash: hashAdminPassword(password),
    failedAttempts: 0,
    lockedUntil: null,
  }).onConflictDoUpdate({
    target: adminCredentials.userId,
    set: {
      passwordHash: hashAdminPassword(password),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: databaseNow(),
    },
  });
}

export async function verifyAndRecordAdminPassword(userId: number, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const credential = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, userId)).limit(1);
  const current = credential[0];
  if (!current) return { ok: false as const, reason: "No administrator password is set up for this account." };
  if (current.lockedUntil && current.lockedUntil.getTime() > Date.now()) {
    return { ok: false as const, reason: "Too many attempts. Kindly try again in 15 minutes." };
  }
  if (verifyAdminPasswordHash(password, current.passwordHash)) {
    await db.update(adminCredentials).set({ failedAttempts: 0, lockedUntil: null }).where(eq(adminCredentials.id, current.id));
    return { ok: true as const };
  }
  const nextAttempts = current.failedAttempts + 1;
  const lock = nextAttempts >= 5 ? new Date(Date.now() + ADMIN_PASSWORD_LOCKOUT_MS) : null;
  await db.update(adminCredentials).set({
    failedAttempts: lock ? 0 : nextAttempts,
    lockedUntil: lock,
  }).where(eq(adminCredentials.id, current.id));
  return { ok: false as const, reason: lock ? "Too many attempts. Kindly try again in 15 minutes." : "The administrator password is not correct." };
}
