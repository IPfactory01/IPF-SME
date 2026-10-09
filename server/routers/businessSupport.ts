import { z } from "zod";
import type { PipelineStage } from "../../shared/businessCheck/pipeline";
import {
  CALL_OUTCOMES,
  businessSupportDb,
  getBusinessCheckDetail,
  listBusinessChecks,
  listClients,
  listDiscoveryCalls,
  recordDiscoveryCallOutcome,
  scheduleDiscoveryCall,
  SETTABLE_STAGES,
  setPipelineStage,
} from "../businessSupportAdmin";
import { confirmPayment, markProofReceived, requestPayment } from "../payments";
import { adminDownloadReport, resendReportLink } from "../fullReport/service";
import { PAYMENT_ITEMS } from "../../shared/payments";
import { adminPermissionProcedure, router } from "../_core/trpc";

// Prospects (business checks, calls) and the invitation step belong to client onboarding; the client list is a view of
// businesses, so it has its own permission and is not granted by onboarding alone.
const prospects = adminPermissionProcedure("manage_client_onboarding");
const clients = adminPermissionProcedure("view_all_businesses");
// Sending payment details and confirming money arrived are commercial actions: finance and the Super Admin.
const payments = adminPermissionProcedure("manage_payments");

/**
 * The IPF Business Support admin view of the funnel: Free Business Check -> discovery call -> onboarding. Nothing here
 * creates a user or a business: that happens only when a client accepts an onboarding invitation.
 */
export const businessSupportRouter = router({
  checks: prospects.query(async () => listBusinessChecks(await businessSupportDb())),
  checkDetail: prospects
    .input(z.object({ businessCheckId: z.number().int().positive() }))
    .query(async ({ input }) => getBusinessCheckDetail(await businessSupportDb(), input.businessCheckId)),
  discoveryCalls: prospects.query(async () => listDiscoveryCalls(await businessSupportDb())),
  scheduleCall: prospects
    .input(z.object({ businessCheckId: z.number().int().positive(), scheduledFor: z.coerce.date() }))
    .mutation(async ({ ctx, input }) => scheduleDiscoveryCall(await businessSupportDb(), { ...input, actorUserId: ctx.user.id })),
  recordOutcome: prospects
    .input(z.object({ businessCheckId: z.number().int().positive(), outcome: z.enum(CALL_OUTCOMES) }))
    .mutation(async ({ ctx, input }) => recordDiscoveryCallOutcome(await businessSupportDb(), { ...input, actorUserId: ctx.user.id })),
  /** Moves a business check to any later stage (Opportunity, Won, Lost, Nurture, Referred…), with an optional note. */
  setStage: prospects
    .input(z.object({ businessCheckId: z.number().int().positive(), stage: z.enum(SETTABLE_STAGES as [Exclude<PipelineStage, "lead">, ...Exclude<PipelineStage, "lead">[]]), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => setPipelineStage(await businessSupportDb(), { ...input, note: input.note || undefined, actorUserId: ctx.user.id })),
  clients: clients.query(async () => listClients(await businessSupportDb())),
  /** Emails the owner the payment details for the full report or the Current State Assessment (again, if already sent). */
  requestPayment: payments
    .input(z.object({ businessCheckId: z.number().int().positive(), item: z.enum(PAYMENT_ITEMS) }))
    .mutation(async ({ ctx, input }) => requestPayment(await businessSupportDb(), { ...input, actorUserId: ctx.user.id })),
  /** The owner sent proof of payment; the money is not confirmed yet. */
  markProofReceived: payments
    .input(z.object({ paymentRequestId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => markProofReceived(await businessSupportDb(), { ...input, actorUserId: ctx.user.id })),
  /** The sent full report, rebuilt from the owner's stored answers, as a PDF. */
  downloadReport: prospects
    .input(z.object({ businessCheckId: z.number().int().positive() }))
    .mutation(async ({ input }) => adminDownloadReport(await businessSupportDb(), input.businessCheckId)),
  /** Sends the owner a new link to the Report Intake. */
  resendReportLink: payments
    .input(z.object({ businessCheckId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => resendReportLink(await businessSupportDb(), { ...input, actorUserId: ctx.user.id })),
  /** The money is in the account. For the Current State Assessment this wins the business and sends the client account invitation. */
  confirmPayment: payments
    .input(z.object({ paymentRequestId: z.number().int().positive(), note: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => confirmPayment(await businessSupportDb(), { ...input, note: input.note || undefined, actorUserId: ctx.user.id })),
});
