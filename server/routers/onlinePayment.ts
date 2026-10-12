import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PAYMENT_ITEMS } from "../../shared/payments";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { onlinePaymentPage, onlinePaymentStatus, requireOnlinePayment, startOnlinePayment } from "../onlinePayment";
import { consumeLimit, LIMITS, type RateLimitRule } from "../rateLimit";

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not reach your payment just now. Please try again in a minute." });
  return db;
}

/** Counted before the database or Paystack is touched, so a flood costs nothing but the counter. */
async function allow(rule: RateLimitRule, subject: string) {
  if (!(await consumeLimit(rule, subject))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests for this payment. Kindly try again later." });
}

/** The Business Check's unguessable token (as its result page uses), never the sequential payment reference. */
const token = z.string().trim().min(16).max(64);
const item = z.enum(PAYMENT_ITEMS);
/** A Paystack attempt's reference, e.g. TS-R-000123-1a2b3c4d. */
const reference = z.string().trim().min(1).max(64);

/**
 * Paying online with Paystack (server/onlinePayment.ts). Every procedure here is public on purpose: the owner pays
 * before they have an account, from the link in their payment details email. Each is keyed by something only that
 * owner holds (the Business Check token, or the reference Paystack returns them with), is rate-limited through the
 * shared counters, and answers only what its page needs. Amounts always come from the payment request in the database.
 */
export const onlinePaymentRouter = router({
  /** Public: the pay page, opened from the payment details email. Answers the item, its amount, the mode and where it stands. */
  page: publicProcedure.input(z.object({ token, item })).query(async ({ input }) => {
    await allow(LIMITS.paymentPage, input.token);
    return onlinePaymentPage(await database(), input);
  }),
  /** Public: "Pay securely with Paystack". Opens a transaction for the amount in the database and returns Paystack's checkout page. */
  start: publicProcedure.input(z.object({ token, item })).mutation(async ({ input }) => {
    await allow(LIMITS.paymentStart, input.token);
    requireOnlinePayment();
    return startOnlinePayment(await database(), input);
  }),
  /** Public: the return page after Paystack. Confirms through the shared path if the webhook has not yet; answers paid, pending or failed. */
  status: publicProcedure.input(z.object({ reference })).mutation(async ({ ctx, input }) => {
    await allow(LIMITS.paymentStatusAddress, ctx.req.ip || "unknown");
    await allow(LIMITS.paymentStatus, input.reference);
    return onlinePaymentStatus(await database(), input.reference);
  }),
});
