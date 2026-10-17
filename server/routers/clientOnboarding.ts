import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  acceptOnboardingInvitation,
  createOnboardingInvitation,
  listOnboardingCandidates,
  listOnboardingInvitations,
  onboardingMetrics,
  previewOnboardingInvitation,
  revokeOnboardingInvitation,
  sendClientSignInLink,
} from "../clientOnboarding";
import { adminPermissionProcedure, publicProcedure, router } from "../_core/trpc";
import { consumeLimit, LIMITS } from "../rateLimit";

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
    .mutation(async ({ ctx, input }) => {
      if (!(await consumeLimit(LIMITS.onboardingEmail, `actor:${ctx.user.id}`))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many invitation emails. Kindly try again later." });
      return createOnboardingInvitation({ businessCheckId: input.businessCheckId, actorUserId: ctx.user.id, overrideReason: input.overrideReason });
    }),
  /** One button on the client's record: a fresh invitation if they have no account yet, else a password reset link. */
  sendSignInLink: manage
    .input(z.object({ businessCheckId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await consumeLimit(LIMITS.onboardingEmail, `actor:${ctx.user.id}`))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many sign-in links. Kindly try again later." });
      return sendClientSignInLink({ businessCheckId: input.businessCheckId, actorUserId: ctx.user.id });
    }),
  revoke: manage
    .input(z.object({ invitationId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => revokeOnboardingInvitation({ invitationId: input.invitationId, actorUserId: ctx.user.id })),
});
