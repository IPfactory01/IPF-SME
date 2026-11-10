import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '../../shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { resolveAccountSession } from "../accountAuth";
import { loadAuthority } from "../platformAccess";
import { authorityAllows, type AnyAuthorityPermission, type PlatformPermission } from "../../shared/platformPermissions";
import { ACCOUNT_AUTH_ERRORS } from "../../shared/auth";
import { hasVerifiedAdminAccess, isOwnerAdmin } from "../adminSecurity";
import { getDb } from "../db";
import { UNEXPECTED_ERROR_MESSAGE } from "../databaseHealth";
import { TEAM_PREVIEW_ALLOWED, TEAM_PREVIEW_REFUSAL } from "../teamPreview";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => safeErrorShape(shape, error),
});

/**
 * A failure nobody planned for (the database not answering, a query that breaks) reaches the browser as one plain
 * sentence, never the SQL or the driver's message; the full error goes to the hosting log. Errors the code raises on
 * purpose (TRPCError with a message written for people) pass through unchanged.
 */
export function safeErrorShape<S extends { message: string; data: { code: string } & Record<string, unknown> }>(shape: S, error: TRPCError): S {
  const unplanned = error.code === "INTERNAL_SERVER_ERROR" && error.cause !== undefined && !(error.cause instanceof TRPCError);
  if (!unplanned) return shape;
  console.error("[Server] Unexpected error:", error.cause);
  const data = { ...shape.data };
  delete data.stack;
  return { ...shape, message: UNEXPECTED_ERROR_MESSAGE, data };
}

export const router = t.router;

/**
 * Preview as a team member (R76): while the Super Admin sees Admin as someone else, nothing is done in that person's
 * name. Every mutation is refused, whatever the procedure, except closing the preview and signing out.
 */
const readOnlyInPreview = t.middleware(({ ctx, type, path, next }) => {
  if (ctx.preview && type === "mutation" && !TEAM_PREVIEW_ALLOWED.has(path)) throw new TRPCError({ code: "FORBIDDEN", message: TEAM_PREVIEW_REFUSAL });
  return next();
});
const procedure = t.procedure.use(readOnlyInPreview);

export const publicProcedure = procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = procedure.use(requireUser);

/**
 * Requires a universal-account session (cookie checked against user_sessions). Independent of the legacy
 * `protectedProcedure` (platform OAuth) and `participantProcedure`. Uses its own message so the client's
 * legacy redirect to the OAuth login is never triggered.
 */
export const accountProcedure = procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const account = await resolveAccountSession(ctx.req);
    if (!account) throw new TRPCError({ code: "UNAUTHORIZED", message: ACCOUNT_AUTH_ERRORS.signInRequired });
    return next({ ctx: { ...ctx, account } });
  }),
);

/**
 * Entry to the internal/administrator area. Two channels, one rule set:
 *  - account channel: a universal email-and-password session whose person holds an internal platform role. The
 *    password already proved who they are, so the separate administrator-password session is not required.
 *  - legacy channel: platform OAuth identity with `users.role = 'admin'` AND the administrator-password session,
 *    exactly as before.
 * What a person may DO inside is decided per action by the central authority resolver (adminPermissionProcedure).
 */
export const adminProcedure = procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    if (ctx.authChannel === "account") {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const authority = await loadAuthority(db, ctx.user);
      if (authority.roles.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    if (ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    if (!(await hasVerifiedAdminAccess(ctx.req, ctx.user.id))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Kindly verify your administrator password to continue." });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Super Admin only. "Super Admin" is decided by the central authority resolver: the recognised owner email OR a stored
 * `super_admin` role. Relying on the email alone made the console depend on OWNER_ADMIN_EMAIL matching exactly at runtime.
 */
export const ownerAdminProcedure = adminProcedure.use(
  t.middleware(async ({ ctx, next }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    if (!ctx.user || !(await loadAuthority(db, ctx.user)).isSuperAdmin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This action is reserved for the Super Admin." });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

/**
 * A capability-scoped administrative procedure. The decision comes from the central authority resolver
 * (shared/platformPermissions.ts): the Super Admin has everything, otherwise a responsibility is granted if the
 * person's platform roles or their legacy administrator profile grant it. It accepts a legacy capability id or a
 * platform permission, and the answer is the same whichever system names it.
 */
export function adminPermissionProcedure(permission: AnyAuthorityPermission) {
  return adminProcedure.use(
    t.middleware(async ({ ctx, next }) => {
      if (!ctx.user) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const authority = await loadAuthority(db, ctx.user);
      if (!authorityAllows(authority, permission)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your administrator role does not include this responsibility." });
      }
      return next({ ctx: { ...ctx, user: ctx.user, authority } });
    }),
  );
}

/**
 * A procedure for an account-session user who holds a platform permission (an internal IPF person signed in with
 * email and password). Business membership is irrelevant here: platform authority and business access are separate.
 */
export function platformPermissionProcedure(permission: PlatformPermission) {
  return accountProcedure.use(async ({ ctx, next }) => {
    if (!ctx.account.permissions.includes(permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include this responsibility." });
    }
    return next({ ctx });
  });
}
