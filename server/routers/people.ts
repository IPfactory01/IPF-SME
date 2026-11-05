import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { issuePasswordReset, listPeople, setAccountStatus, setJobTitle } from "../accountRecovery";
import { JOB_TITLE_MAX_LENGTH } from "../../shared/engagement";
import { getDb } from "../db";
import { removeAccess, removeAccessInputSchema, resetTwoStep } from "../platformAccess";
import { adminPermissionProcedure, router } from "../_core/trpc";

const manageUsers = adminPermissionProcedure("manage_users");
const userInput = z.object({ userId: z.number().int().positive() });

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/**
 * People with a password account, for staff with `manage_users` (the Super Admin by default): issue a password reset
 * link, suspend or reinstate an account. Roles are managed separately (platformRoles).
 */
export const peopleRouter = router({
  list: manageUsers.query(async () => listPeople(await database())),
  issuePasswordReset: manageUsers.input(userInput).mutation(async ({ ctx, input }) =>
    issuePasswordReset(await database(), { actor: { id: ctx.user.id, email: ctx.user.email ?? null, authority: ctx.authority }, targetUserId: input.userId })),
  setStatus: manageUsers
    .input(z.object({ userId: z.number().int().positive(), status: z.enum(["active", "suspended"]), reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) =>
      setAccountStatus(await database(), { actor: { id: ctx.user.id, email: ctx.user.email ?? null, authority: ctx.authority }, targetUserId: input.userId, status: input.status, reason: input.reason })),
  /** The firm title clients see beside the person's role on their engagement. */
  setJobTitle: manageUsers.input(z.object({ userId: z.number().int().positive(), jobTitle: z.string().trim().max(JOB_TITLE_MAX_LENGTH).nullable() })).mutation(async ({ ctx, input }) =>
    setJobTitle(await database(), { actor: { id: ctx.user.id, email: ctx.user.email ?? null, authority: ctx.authority }, targetUserId: input.userId, jobTitle: input.jobTitle })),
  /** One click: every role, engagement and session gone, account suspended, reason recorded, Super Admins told. */
  removeAccess: manageUsers.input(removeAccessInputSchema).mutation(async ({ ctx, input }) =>
    removeAccess(await database(), { actor: { ...ctx.user, authority: ctx.authority }, userId: input.userId, reason: input.reason })),
  /** A lost phone: clears two-step sign-in and ends sessions; they set it up again at the next sign-in. */
  resetTwoStep: manageUsers.input(userInput).mutation(async ({ ctx, input }) =>
    resetTwoStep(await database(), { actor: { ...ctx.user, authority: ctx.authority }, userId: input.userId })),
});
