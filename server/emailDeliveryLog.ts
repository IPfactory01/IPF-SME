import { desc, eq } from "drizzle-orm";
import { businessSupportEmailDeliveries, resendEmailEvents } from "../drizzle/schema";
import type { EmailDeliveryResult } from "./email";
import { getDb } from "./db";

/** Best-effort operational metadata log. Never persists an email body or prevents the underlying send. */
export async function logBusinessSupportEmail(input: {
  to: string;
  subject: string;
  attemptedAt: Date;
  result: EmailDeliveryResult;
  businessCheckId?: number;
  paymentRequestId?: number;
  invitationId?: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    const values = {
      providerMessageId: input.result.status === "Sent" ? input.result.providerMessageId ?? null : null,
      recipientEmail: input.to.slice(0, 320),
      purpose: input.subject.slice(0, 255),
      businessCheckId: input.businessCheckId ?? null,
      paymentRequestId: input.paymentRequestId ?? null,
      invitationId: input.invitationId ?? null,
      latestState: input.result.status === "Sent" ? "sent" : input.result.status === "Failed" ? "failed" : "simulated",
      attemptedAt: input.attemptedAt,
      acceptedAt: input.result.status === "Sent" ? input.attemptedAt : null,
    };
    const [delivery] = values.providerMessageId
      ? await db.insert(businessSupportEmailDeliveries).values(values).onConflictDoUpdate({ target: businessSupportEmailDeliveries.providerMessageId, set: values }).returning({ id: businessSupportEmailDeliveries.id })
      : await db.insert(businessSupportEmailDeliveries).values(values).returning({ id: businessSupportEmailDeliveries.id });
    // A very fast provider event can beat the email API response and this log write. Reconcile any already received event.
    if (delivery && values.providerMessageId) {
      const [event] = await db.select({ eventType: resendEmailEvents.eventType, happenedAt: resendEmailEvents.happenedAt })
        .from(resendEmailEvents).where(eq(resendEmailEvents.providerMessageId, values.providerMessageId)).orderBy(desc(resendEmailEvents.happenedAt)).limit(1);
      if (event) await db.update(businessSupportEmailDeliveries).set({ latestState: event.eventType, lastEventAt: event.happenedAt }).where(eq(businessSupportEmailDeliveries.id, delivery.id));
    }
  } catch (error) {
    console.warn("[Email] Business Support delivery status could not be recorded:", error instanceof Error ? error.message : "unknown error");
  }
}
