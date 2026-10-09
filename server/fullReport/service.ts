import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { businessChecks, fullReports, paymentRequests, type FullReportRecord } from "../../drizzle/schema";
import { BRAND } from "../../shared/brand";
import { evaluate, type CheckResult } from "../../shared/businessCheck/engine";
import type { Answers } from "../../shared/businessCheck/questions";
import { buildFullReport, REPORT_VERSION, type FullReport } from "../../shared/fullReport/build";
import { intakeSchema, readIntake, type ReportIntake } from "../../shared/fullReport/intake";
import { ENV } from "../_core/env";
import type { Database } from "../accountAuth";
import { sha256 } from "../adminSecurity";
import { recordAudit } from "../audit";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "../email";
import { getTrustedApplicationOrigin } from "../security";
import { renderFullReportPdf } from "./pdf";

/**
 * The paid full report, from confirmed payment to the owner's inbox. Confirming the report payment issues a single
 * link to the Report Intake (only its hash is stored). When the owner submits the intake, the report is built by fixed
 * rules, rendered as a PDF and emailed at once: nobody reviews it, by design (agreed 9 October 2026). The stored answers
 * and submission time rebuild the same report for every later download.
 */

export const REPORT_ERRORS = {
  unavailable: "This report link is not valid. Use the link in your payment confirmation email, or reply to it for help.",
  alreadySent: "Your report has already been sent. You can download it again below.",
  notReady: "Your report is not ready yet. Complete the form first.",
} as const;

const reportUrl = (token: string) => `${getTrustedApplicationOrigin()}/report/${encodeURIComponent(token)}`;

/** Issues (or reissues) the Report Intake link for a confirmed report payment. Null when the report was already sent. */
export async function issueReportLink(db: Database, input: { businessCheckId: number; paymentRequestId: number }) {
  const token = randomBytes(32).toString("base64url");
  const existing = (await db.select().from(fullReports).where(eq(fullReports.businessCheckId, input.businessCheckId)).limit(1))[0];
  if (existing?.status === "delivered") return null;
  if (existing) await db.update(fullReports).set({ tokenHash: sha256(token) }).where(eq(fullReports.id, existing.id));
  else await db.insert(fullReports).values({ businessCheckId: input.businessCheckId, paymentRequestId: input.paymentRequestId, tokenHash: sha256(token) });
  return reportUrl(token);
}

async function recordFor(db: Pick<Database, "select">, token: string) {
  if (!token || token.length > 200) throw new TRPCError({ code: "NOT_FOUND", message: REPORT_ERRORS.unavailable });
  const record = (await db.select().from(fullReports).where(eq(fullReports.tokenHash, sha256(token))).limit(1))[0];
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: REPORT_ERRORS.unavailable });
  return record;
}

async function checkFor(db: Pick<Database, "select">, businessCheckId: number) {
  const check = (await db.select().from(businessChecks).where(eq(businessChecks.id, businessCheckId)).limit(1))[0];
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: REPORT_ERRORS.unavailable });
  return check;
}

/** What the intake page needs: who it is for and whether the report has gone. Nothing else about the check. */
export async function reportForm(db: Pick<Database, "select">, token: string) {
  const record = await recordFor(db, token);
  const check = await checkFor(db, record.businessCheckId);
  return { status: record.status, fullName: check.fullName, businessName: check.businessName ?? "", email: check.email, deliveredAt: record.deliveredAt };
}

function parse<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Rebuilds the report from what was stored when the intake was submitted: the same report every time. */
async function assemble(db: Pick<Database, "select">, record: FullReportRecord): Promise<{ report: FullReport; generatedAt: Date; email: string; fullName: string }> {
  const intake = readIntake(parse<unknown>(record.intakeJson));
  if (!intake || !record.intakeSubmittedAt) throw new TRPCError({ code: "BAD_REQUEST", message: REPORT_ERRORS.notReady });
  const check = await checkFor(db, record.businessCheckId);
  const payment = (await db.select({ reference: paymentRequests.reference }).from(paymentRequests).where(eq(paymentRequests.id, record.paymentRequestId)).limit(1))[0];
  const answers = parse<Answers>(check.answersJson) ?? {};
  // The result the owner saw when they finished the check, so the report agrees with it.
  const result = parse<CheckResult>(check.resultJson) ?? evaluate(answers);
  const report = buildFullReport({
    reference: payment?.reference ?? `TS-R-${String(check.id).padStart(6, "0")}`,
    date: record.intakeSubmittedAt,
    contact: { fullName: check.fullName, businessName: check.businessName },
    answers,
    result,
    intake,
  });
  return { report, generatedAt: record.intakeSubmittedAt, email: check.email, fullName: check.fullName };
}

const fileName = (report: FullReport) => `${report.businessName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Business"}-full-business-check-report.pdf`;

/** The email that carries the report: the one-page answer in words, and the PDF attached. */
export function reportEmail(report: FullReport, downloadUrl: string) {
  const firstName = report.ownerName.split(/\s+/)[0] || "there";
  return {
    subject: `Your full business check report: ${report.businessName}`,
    body: [
      `Dear ${firstName},`,
      "",
      `Your full business check report for ${report.businessName} is attached.`,
      "",
      "WHERE YOU STAND",
      report.onePage.position,
      "",
      "FIX THIS FIRST",
      `${report.onePage.fixFirst.area}: ${report.onePage.fixFirst.finding}`,
      "",
      "YOUR FIRST MOVES",
      ...report.onePage.moves.map((move) => `• ${move.month}: ${move.move}`),
      "",
      "THE ONE NUMBER TO WATCH",
      report.onePage.watch,
      "",
      `Download it again: ${downloadUrl}`,
      "",
      `If you would like help with the plan, reply to this email or book a free 20-minute call: ${ENV.discoveryCallUrl}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

/**
 * Takes the owner's Report Intake, builds the report and emails it straight away. The intake is accepted once: a second
 * submission is refused, and the owner downloads the report they already have.
 */
export async function submitReportIntake(db: Database, token: string, rawIntake: unknown) {
  const record = await recordFor(db, token);
  if (record.status === "delivered") throw new TRPCError({ code: "CONFLICT", message: REPORT_ERRORS.alreadySent });
  const parsed = intakeSchema.safeParse(rawIntake);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Please check your answers." });

  // Claimed in one step, so two submissions at once cannot both produce a report.
  const [claimed] = await db.update(fullReports)
    .set({ status: "delivered", intakeJson: JSON.stringify(parsed.data), intakeSubmittedAt: new Date(), reportVersion: REPORT_VERSION })
    .where(and(eq(fullReports.id, record.id), eq(fullReports.status, "awaiting_intake")))
    .returning();
  if (!claimed) throw new TRPCError({ code: "CONFLICT", message: REPORT_ERRORS.alreadySent });

  const { report, generatedAt, email } = await assemble(db, claimed);
  const pdf = await renderFullReportPdf(report, generatedAt);
  const message = reportEmail(report, reportUrl(token));
  const delivery = await deliverEmail({
    sender: "business_support",
    to: email,
    subject: message.subject,
    body: message.body,
    attachments: [{ filename: fileName(report), content: pdf, contentType: "application/pdf" }],
  }).catch(() => ({ status: "Failed" as const }));
  await db.update(fullReports).set({ deliveredAt: new Date(), deliveryStatus: delivery.status }).where(eq(fullReports.id, claimed.id));
  await recordAudit(db, { action: "full_report_delivered", targetEmail: email, details: { businessCheckId: claimed.businessCheckId, reference: report.reference, delivery: delivery.status } });
  await deliverEmail({
    sender: "business_support",
    to: BUSINESS_SUPPORT_MAILBOX,
    subject: `Full report sent: ${report.businessName}`,
    body: [
      `The full business check report for ${report.businessName} (${report.ownerName}) was built from their Report Intake and emailed to them.`,
      "",
      `Email: ${email}`,
      `Reference: ${report.reference}`,
      `Fix first: ${report.onePage.fixFirst.area}`,
      `Delivery: ${delivery.status}`,
      "",
      `Business check #${claimed.businessCheckId}.`,
    ].join("\n"),
  }).catch(() => undefined);
  return { delivered: true, deliveryStatus: delivery.status, fileName: fileName(report), pdf: pdf.toString("base64") };
}

/** The report again, for the owner with their link. */
export async function downloadReport(db: Pick<Database, "select">, token: string) {
  const record = await recordFor(db, token);
  if (record.status !== "delivered") throw new TRPCError({ code: "BAD_REQUEST", message: REPORT_ERRORS.notReady });
  const { report, generatedAt } = await assemble(db, record);
  return { fileName: fileName(report), pdf: (await renderFullReportPdf(report, generatedAt)).toString("base64") };
}

/** The report for the admin console, by business check. */
export async function adminDownloadReport(db: Pick<Database, "select">, businessCheckId: number) {
  const record = (await db.select().from(fullReports).where(eq(fullReports.businessCheckId, businessCheckId)).limit(1))[0];
  if (!record || record.status !== "delivered") throw new TRPCError({ code: "NOT_FOUND", message: "This report has not been sent yet." });
  const { report, generatedAt } = await assemble(db, record);
  return { fileName: fileName(report), pdf: (await renderFullReportPdf(report, generatedAt)).toString("base64") };
}

/** Where a business check's report stands, for the admin record. */
export async function reportStatusFor(db: Pick<Database, "select">, businessCheckId: number) {
  const record = (await db.select({ status: fullReports.status, createdAt: fullReports.createdAt, deliveredAt: fullReports.deliveredAt, deliveryStatus: fullReports.deliveryStatus })
    .from(fullReports).where(eq(fullReports.businessCheckId, businessCheckId)).limit(1))[0];
  return record ?? null;
}

/** Sends the Report Intake link again (a new link; the old one stops working), for an owner who lost the email. */
export async function resendReportLink(db: Database, input: { businessCheckId: number; actorUserId: number }) {
  const record = (await db.select().from(fullReports).where(eq(fullReports.businessCheckId, input.businessCheckId)).limit(1))[0];
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Confirm the report payment first: that sends the form link." });
  if (record.status === "delivered") throw new TRPCError({ code: "CONFLICT", message: "The report has already been sent." });
  const check = await checkFor(db, input.businessCheckId);
  const link = await issueReportLink(db, { businessCheckId: check.id, paymentRequestId: record.paymentRequestId });
  const firstName = check.fullName.trim().split(/\s+/)[0] || "there";
  const delivery = await deliverEmail({
    sender: "business_support",
    to: check.email,
    subject: "Your report form",
    body: [
      `Dear ${firstName},`,
      "",
      "Here is the link to your report form again. Any earlier link no longer works.",
      "Your full business check report is emailed to you the moment you finish the form.",
      "",
      `Complete your report form: ${link}`,
      "",
      BRAND.organisationName,
    ].join("\n"),
  }).catch(() => ({ status: "Failed" as const }));
  await recordAudit(db, { action: "full_report_link_sent", actorUserId: input.actorUserId, targetEmail: check.email, details: { businessCheckId: check.id, delivery: delivery.status } });
  return { success: true, deliveryStatus: delivery.status } as const;
}
