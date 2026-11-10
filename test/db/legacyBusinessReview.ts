/**
 * A Business Review link as the platform sent it before F3 (App flow 3.2, item 5): a payment request for its first half,
 * unpaid, with the check moved to Opportunity as sending it did. Since F3 sending the link opens the engagement on fees
 * instead, so the tests of the older route (its pay page, its 48 hours, confirming it, the engagement it starts) build
 * their request this way: the data the platform still holds and must keep reading correctly.
 */
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { PRICES } from "@shared/businessSupport";
import { paymentReference } from "@shared/payments";
import { firstHalf } from "@shared/products";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function legacyBusinessReviewRequest(db: any, input: { businessCheckId: number; requestedByUserId: number | null; amountNaira?: number; requestedAt?: Date }) {
  const [request] = await db.insert(schema.paymentRequests).values({
    businessCheckId: input.businessCheckId, item: "current_state", amountNaira: input.amountNaira ?? firstHalf(PRICES.currentState),
    reference: paymentReference("current_state", input.businessCheckId), requestedByUserId: input.requestedByUserId, requestedAt: input.requestedAt ?? new Date(),
  }).returning();
  await db.update(schema.businessChecks).set({ pipelineStage: "opportunity" })
    .where(and(eq(schema.businessChecks.id, input.businessCheckId), inArray(schema.businessChecks.pipelineStage, ["lead", "qualified_lead", "call_booked"])));
  return request as typeof schema.paymentRequests.$inferSelect;
}
