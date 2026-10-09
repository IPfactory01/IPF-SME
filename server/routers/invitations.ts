import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  acceptAccountInvitation,
  inviteSeat,
  inviteStaff,
  listSeats,
  listStaff,
  listStaffInvitations,
  previewAccountInvitation,
  removeSeat,
  revokeSeatInvitation,
  revokeStaffInvitation,
  seatInvitationSchema,
  setSeatAccess,
  staffInvitationSchema,
} from "../accountInvitations";
import { engagementDb, isMissingEngagementTable, MIGRATION_MISSING_MESSAGE } from "../engagements";
import { accountProcedure, adminPermissionProcedure, publicProcedure, router } from "../_core/trpc";

const id = z.number().int().positive();

/** account_invitations and business_member_access arrive with migration 0008: say so instead of failing. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingEngagementTable(error)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: MIGRATION_MISSING_MESSAGE });
    throw error;
  }
}

/** IP Factory staff: authentication through the internal area, permission manage_roles (the Super Admin has it). */
const roles = adminPermissionProcedure("manage_roles");
const actorOf = (ctx: { user: { id: number; name: string | null } | null; authority: Parameters<typeof inviteStaff>[1]["authority"] }) => ({ id: ctx.user!.id, name: ctx.user!.name, authority: ctx.authority });

/**
 * Invitations that create an email-and-password account. Staff: the Super Admin invites with one role. The owner's
 * staff: the owner (or a business admin) of the business in use invites into the included seat; no business id is
 * accepted from the browser. Accepting is public, by token, and checks the email it is bound to.
 */
export const invitationsRouter = router({
  staff: router({
    team: roles.query(async ({ ctx }) => guarded(async () => listStaff(await engagementDb(), actorOf(ctx)))),
    list: roles.query(async ({ ctx }) => guarded(async () => listStaffInvitations(await engagementDb(), actorOf(ctx)))),
    invite: roles.input(staffInvitationSchema).mutation(async ({ ctx, input }) => guarded(async () => inviteStaff(await engagementDb(), actorOf(ctx), input))),
    revoke: roles.input(z.object({ invitationId: id })).mutation(async ({ ctx, input }) => guarded(async () => revokeStaffInvitation(await engagementDb(), actorOf(ctx), input))),
  }),
  seats: router({
    list: accountProcedure.query(async ({ ctx }) => guarded(async () => listSeats(await engagementDb(), ctx.account))),
    invite: accountProcedure.input(seatInvitationSchema).mutation(async ({ ctx, input }) => guarded(async () => inviteSeat(await engagementDb(), ctx.account, input))),
    revoke: accountProcedure.input(z.object({ invitationId: id })).mutation(async ({ ctx, input }) => guarded(async () => revokeSeatInvitation(await engagementDb(), ctx.account, input))),
    remove: accountProcedure.input(z.object({ membershipId: id })).mutation(async ({ ctx, input }) => guarded(async () => removeSeat(await engagementDb(), ctx.account, input))),
    setAccess: accountProcedure.input(z.object({ membershipId: id, access: z.enum(["full", "contributor"]) })).mutation(async ({ ctx, input }) => guarded(async () => setSeatAccess(await engagementDb(), ctx.account, input))),
  }),
  preview: publicProcedure.input(z.object({ token: z.string().min(20).max(200) })).query(async ({ ctx, input }) => {
    try {
      return await previewAccountInvitation(await engagementDb(), ctx.req, input.token);
    } catch (error) {
      if (isMissingEngagementTable(error)) return { available: false } as const;
      throw error;
    }
  }),
  accept: publicProcedure.input(z.unknown()).mutation(async ({ ctx, input }) => guarded(async () => acceptAccountInvitation(await engagementDb(), ctx.req, ctx.res, input))),
});
