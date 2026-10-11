import { z } from "zod";
import {
  acceptOnboardingInvitation,
  createOnboardingInvitation,
  listOnboardingCandidates,
  listOnboardingInvitations,
  onboardingMetrics,
  previewOnboardingInvitation,
  revokeOnboardingInvitation,
} from "../clientOnboarding";
import { adminPermissionProcedure, publicProcedure, router } from "../_core/trpc";

const manage = adminPermissionProcedure("manage_client_onboarding");

/**
 * Client onboarding. The only way a client account (user + business + owner membership) comes into being:
 * an authorised administrator invites a business check, and the client accepts the secure link.
 */
export const clientOnboardingRouter = router({
  // ---- the invited client (public, token-gated) ----
  preview: publicProcedure.input(z.object({ token: z.string().min(1).max(200) })).query(({ ctx, input }) => previewOnboardingInvitation(ctx.req, input.token)),
  // Validated inside acceptOnboardingInvitation so the client receives one readable message, not a JSON issue list.
  accept: publicProcedure.input(z.unknown()).mutation(({ ctx, input }) => acceptOnboardingInvitation(ctx.req, ctx.res, input)),

  // ---- authorised administrators ----
  candidates: manage.query(() => listOnboardingCandidates()),
  invitations: manage.query(() => listOnboardingInvitations()),
  metrics: manage.query(() => onboardingMetrics()),
  /** Before the Current State Assessment payment is confirmed, a reason is required and recorded with the invitation. */
  invite: manage
    .input(z.object({ businessCheckId: z.number().int().positive(), overrideReason: z.string().trim().min(5, "Give the reason for inviting before payment.").max(500).optional() }))
    .mutation(({ ctx, input }) => createOnboardingInvitation({ businessCheckId: input.businessCheckId, actorUserId: ctx.user.id, overrideReason: input.overrideReason })),
  revoke: manage
    .input(z.object({ invitationId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => revokeOnboardingInvitation({ invitationId: input.invitationId, actorUserId: ctx.user.id })),
});
