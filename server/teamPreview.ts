/**
 * Preview as a team member (R76, ET 10 November 2026): the Super Admin opens Admin exactly as another team member sees
 * it, read only, the way staff preview a client's room. A short-lived signed cookie names who started it, whom it shows
 * and when it ends. createContext honours it only when the signed-in person is that same Super Admin, and then
 * evaluates the request as the team member, so every screen answers with that person's permissions and assignments.
 * Every change is refused while it lasts (server/_core/trpc.ts), except closing it and signing out, so nobody is ever
 * acted for. Starting one is recorded (team_view_previewed).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions, Request } from "express";
import { eq } from "drizzle-orm";
import { users, type User } from "../drizzle/schema";
import type { Database } from "./accountAuth";
import { ENV } from "./_core/env";
import { loadAuthority } from "./platformAccess";

export const TEAM_PREVIEW_COOKIE = "ipf_team_preview";
export const TEAM_PREVIEW_MINUTES = 30;
export const TEAM_PREVIEW_REFUSAL = "This is a preview: nothing can be changed. Close the preview to work as yourself.";
/** The only changes a preview may make: closing it, and signing out. */
export const TEAM_PREVIEW_ALLOWED: ReadonlySet<string> = new Set(["adminAccess.endPreview", "account.signOut"]);

/** What a request in preview carries: who is looking, and whose view they see until when. */
export type TeamPreview = { byUserId: number; byName: string; asUserId: number; asName: string; asEmail: string | null; expiresAt: number };

const sign = (payload: string) => createHmac("sha256", `team-preview:${ENV.cookieSecret}`).update(payload).digest("base64url");

/** The cookie's value: who started it, whom it shows, when it ends, and a signature over all three. */
export function teamPreviewToken(byUserId: number, asUserId: number, expiresAt: number) {
  const payload = `${byUserId}.${asUserId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** The token read back, or null when it is missing, altered, malformed or over. */
export function readTeamPreviewToken(token: string | null | undefined, now = Date.now()): { byUserId: number; asUserId: number; expiresAt: number } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts.slice(0, 3).some(part => !/^\d+$/.test(part))) return null;
  const expected = Buffer.from(sign(parts.slice(0, 3).join(".")));
  const given = Buffer.from(parts[3]!);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [byUserId, asUserId, expiresAt] = parts.slice(0, 3).map(Number) as [number, number, number];
  return expiresAt > now ? { byUserId, asUserId, expiresAt } : null;
}

function readCookie(req: Request, name: string) {
  for (const item of (req.headers?.cookie || "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

/** HttpOnly, sent only from this site, Secure on HTTPS and in production. */
export function teamPreviewCookieOptions(req: Request, nodeEnv = process.env.NODE_ENV): CookieOptions {
  return { httpOnly: true, path: "/", sameSite: "strict", secure: req.secure || req.protocol === "https" || nodeEnv === "production" };
}

/**
 * The team member a request shows, when the signed-in Super Admin started a preview of them that has not ended: an
 * active person with a role at IP Factory who is not a Super Admin. Null otherwise, so the real person is unchanged.
 */
export async function teamPreviewOf(db: Pick<Database, "select">, req: Request, signedIn: User, now = Date.now()): Promise<{ user: User; expiresAt: number } | null> {
  const token = readTeamPreviewToken(readCookie(req, TEAM_PREVIEW_COOKIE), now);
  if (!token || token.byUserId !== signedIn.id || token.asUserId === signedIn.id) return null;
  if (!(await loadAuthority(db, signedIn)).isSuperAdmin) return null;
  const shown = (await db.select().from(users).where(eq(users.id, token.asUserId)).limit(1))[0];
  if (!shown || shown.status !== "active") return null;
  const authority = await loadAuthority(db, shown);
  if (authority.roles.length === 0 || authority.isSuperAdmin) return null;
  return { user: shown, expiresAt: token.expiresAt };
}
