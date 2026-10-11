import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { issuePasswordReset, listPeople, setAccountStatus } from "../accountRecovery";
import { getDb } from "../db";
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
});
