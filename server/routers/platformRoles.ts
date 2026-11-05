import { z } from "zod";
import { PLATFORM_ROLES } from "../../shared/auth";
import { getDb } from "../db";
import { grantPlatformRole, listPlatformRoleAssignments, revokePlatformRole } from "../platformAccess";
import { adminPermissionProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

const manageRoles = adminPermissionProcedure("manage_roles");
const roleInput = z.object({ userId: z.number().int().positive(), role: z.enum(PLATFORM_ROLES) });
/** The end date arrives as a day ("2027-03-09"); access ends at the end of that day, Lagos time. */
const grantInput = roleInput.extend({ expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() });
const endOfDay = (day: string) => new Date(`${day}T23:59:59+01:00`);

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/**
 * Platform roles are assigned here, separately from business membership. Requires the `manage_roles`
 * responsibility (the Super Admin always has it). Only a Super Admin can grant or revoke Super Admin, nobody but a
 * Super Admin can change their own roles, and the last Super Admin cannot be removed. Roles are given and removed only
 * below the giver's own; a specialist's role needs an end date.
 */
export const platformRolesRouter = router({
  list: manageRoles.query(async () => listPlatformRoleAssignments(await database())),
  grant: manageRoles.input(grantInput).mutation(async ({ ctx, input }) =>
    grantPlatformRole(await database(), { actor: { ...ctx.user, authority: ctx.authority }, targetUserId: input.userId, role: input.role, expiresAt: input.expiresOn ? endOfDay(input.expiresOn) : null })),
  revoke: manageRoles.input(roleInput).mutation(async ({ ctx, input }) =>
    revokePlatformRole(await database(), { actor: { ...ctx.user, authority: ctx.authority }, targetUserId: input.userId, role: input.role })),
});
