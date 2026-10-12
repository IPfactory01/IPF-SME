import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { businessChecks, type BusinessCheck } from "../drizzle/schema";
import type { Database } from "./accountAuth";
import { databaseNow } from "./dbHelpers";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { requestPayment } from "./payments";

/** Where the owner asked for the Full Report: "Get my Full Report" on the result page, or pay on the link in their summary email. */
export type FullReportAsk = "result_page" | "pay_link";

const PAY_LINK_NOTE = "Started paying online from the link in their Business Check summary email.";

/**
 * The owner asks for the Full Report of a finished Business Check. The first time, it records when they asked, emails
 * them the payment details (the reference, the pay link and the bank transfer alternative) and tells Business Support
 * once. From the pay link it also files the payment request when an earlier attempt to send the details failed, so the
 * owner can always pay. Asking again from the result page does nothing.
 */
export async function askForFullReport(db: Database, check: BusinessCheck, input: { source: FullReportAsk; note?: string }) {
  const first = !check.reportRequestedAt;
  if (!first && input.source === "result_page") return;
  if (first) await db.update(businessChecks).set({ reportRequestedAt: databaseNow() }).where(eq(businessChecks.id, check.id));

  // The owner is emailed the payment details straight away; the office notice says whether that worked.
  let payment: string;
  try {
    const sent = await requestPayment(db, { businessCheckId: check.id, item: "full_report", actorUserId: null });
    payment = sent.deliveryStatus === "Failed"
      ? `Payment details: ${sent.reference}, but the email to the owner failed (${sent.deliveryProblem ?? "no reason given"}). Send them again from admin once that is fixed.`
      : `Payment details sent: ${sent.reference}`;
  } catch (error) {
    const paid = error instanceof TRPCError && error.code === "CONFLICT";
    if (!paid) console.error("[BusinessCheck] Could not send the report payment details:", error instanceof Error ? error.message : error);
    payment = paid ? "Payment: already paid" : "Payment details: NOT SENT. Send them from the admin console.";
  }
  if (!first) return;

  const note = input.note || (input.source === "pay_link" ? PAY_LINK_NOTE : "None");
  await deliverEmail({
    sender: "business_support",
    idempotencyKey: `business_checks:${check.id}:report:office`,
    to: BUSINESS_SUPPORT_MAILBOX,
    subject: `Business Check: ${check.businessName || check.fullName} asked for the Full Report`,
    body: [
      `${check.fullName} asked for the Full Report.`,
      "",
      `Email: ${check.email}`,
      `WhatsApp: ${check.whatsapp || "Not given"}`,
      `Business: ${check.businessName || "Not given"}`,
      `Note: ${note}`,
      payment,
      "",
      `Business Check #${check.id}${check.completedAt ? `, completed ${lagosTime(check.completedAt)} (Lagos time)` : ""}.`,
    ].join("\n"),
  });
}
