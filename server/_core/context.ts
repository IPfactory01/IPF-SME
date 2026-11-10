import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import { resolveAccountSession } from "../accountAuth";
import { getDb } from "../db";
import { teamPreviewOf, type TeamPreview } from "../teamPreview";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * How `user` was authenticated. "legacy" is the platform OAuth session (which the administrator-password session
   * still builds on); "account" is the universal email-and-password session. Absent when nobody is signed in.
   */
  authChannel?: "legacy" | "account";
  /**
   * Preview as a team member (R76): set when the signed-in Super Admin is previewing someone. `user` is then that team
   * member, so every check answers as it would for them, and every change is refused (server/_core/trpc.ts).
   */
  preview?: TeamPreview;
};

/**
 * The legacy OAuth session is tried first, unchanged. Otherwise a universal account session identifies the staff
 * member, but ONLY when that person holds an internal platform role: a client's account session never becomes the
 * administrator identity, so `ctx.user` stays null for them and every admin procedure refuses them.
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let authChannel: TrpcContext["authChannel"];

  try {
    user = await sdk.authenticateRequest(opts.req);
    if (user) authChannel = "legacy";
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    try {
      const session = await resolveAccountSession(opts.req);
      if (session && session.authority.roles.length > 0) {
        const db = await getDb();
        const row = db ? (await db.select().from(users).where(eq(users.id, session.user.id)).limit(1))[0] : undefined;
        if (row && row.status === "active") {
          user = row;
          authChannel = "account";
        }
      }
    } catch {
      user = null;
    }
  }

  // Preview as a team member (R76): only for the Super Admin who started it, and never a reason to refuse them.
  let preview: TeamPreview | undefined;
  if (user && opts.req.headers?.cookie?.includes("ipf_team_preview=")) {
    try {
      const db = await getDb();
      const shown = db ? await teamPreviewOf(db, opts.req, user) : null;
      if (shown) {
        preview = { byUserId: user.id, byName: user.name ?? user.email ?? "", asUserId: shown.user.id, asName: shown.user.name ?? shown.user.email ?? "", asEmail: shown.user.email ?? null, expiresAt: shown.expiresAt };
        user = shown.user;
        authChannel = "account";
      }
    } catch {
      preview = undefined;
    }
  }

  return { req: opts.req, res: opts.res, user, authChannel, preview };
}
