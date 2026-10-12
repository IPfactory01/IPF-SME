import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { INTERNATIONAL_PHONE } from "../../shared/phone";
import { businessChecks, type BusinessCheck } from "../../drizzle/schema";
import { businessDetails, cleanAnswers, evaluate, isComplete } from "../../shared/businessCheck/engine";
import { advancePipeline } from "../../shared/businessCheck/pipeline";
import { stageOf, type Answers } from "../../shared/businessCheck/questions";
import { officeEmail, ownerEmail, summariseCheck, type CheckContact, type CheckSummary } from "../businessCheck";
import { getDb } from "../db";
import { databaseNow } from "../dbHelpers";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "../email";
import { onlinePaymentOffer } from "../payments";
import { askForFullReport } from "../fullReportRequest";
import { ENV } from "../_core/env";
import { bookedCallTime, CALENDLY_EVENT_URI, findBookedCall } from "../calendly";
import { recordAudit } from "../audit";
import { consumeLimit, LIMITS, resetRateLimitsForTests } from "../rateLimit";
import { publicProcedure, router } from "../_core/trpc";
import { lagosTime } from "../lagosTime";

const tooMany = (message: string) => new TRPCError({ code: "TOO_MANY_REQUESTS", message });

/** Clears every rate limit's counters. Tests only; never call this from application code. */
export function resetBusinessCheckRateLimitsForTests() {
  return resetRateLimitsForTests();
}

const answerValue = z.union([z.string().max(300), z.array(z.string().max(64)).max(10)]);
const answersInput = z.record(z.string().max(32), answerValue.optional()).refine((value) => Object.keys(value).length <= 80);
const tokenInput = z.string().min(16).max(64);

/** The first screen: who the owner is. Everything about the business is asked inside the check. */
export const businessCheckStartInput = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(320),
  /** International format from the country picker, e.g. +2348031234567. */
  whatsapp: z.string().trim().regex(INTERNATIONAL_PHONE, "Kindly check the WhatsApp number.").optional(),
  heardFrom: z.string().trim().max(64).optional(),
});

export type BusinessCheckResponse = {
  token: string;
  result: ReturnType<typeof evaluate>;
  summary: CheckSummary;
  summarySource: "AI" | "Rules";
  discoveryCallUrl: string;
  /**
   * Whether the owner's emailed copy was really sent. "Sent" only when the provider accepted it; otherwise the result
   * is saved but no email went out ("Simulated" when email is not configured, "Failed" when it was refused). The page
   * must not claim an email was sent unless this is "Sent".
   */
  emailStatus: "Sent" | "Failed" | "Simulated";
};

const unavailable = (what: string) => new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `We could not ${what} just now. Kindly try again shortly.` });

async function database(what: string) {
  const db = await getDb();
  if (!db) throw unavailable(what);
  return db;
}

async function findCheck(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, token: string) {
  const [check] = await db.select().from(businessChecks).where(eq(businessChecks.publicToken, token)).limit(1);
  if (!check) throw new TRPCError({ code: "NOT_FOUND", message: "We could not find that Business Check. Kindly start again." });
  return check;
}

/** Columns that follow from the answers so far: the stage and the business details typed in the check. */
function answerColumns(answers: Answers) {
  const { businessName, description } = businessDetails(answers);
  return { answersJson: JSON.stringify(answers), stage: stageOf(answers) ?? "unknown", businessName: businessName || null, description: description || null };
}

function contactOf(check: BusinessCheck, answers: Answers): CheckContact {
  const { businessName, description } = businessDetails(answers);
  return { fullName: check.fullName, email: check.email, whatsapp: check.whatsapp || undefined, heardFrom: check.heardFrom || undefined, businessName: businessName || undefined, description: description || undefined };
}

/** A date and time as the team reads it in the office email, e.g. "Wed, 14 Oct 2026, 10:00 am". */

export const businessCheckRouter = router({
  /** The details screen: records the owner as a lead before the first question. */
  start: publicProcedure.input(businessCheckStartInput).mutation(async ({ input, ctx }) => {
    const ip = (ctx.req.ip || "unknown").toLowerCase();
    // The address cap first, so flooding with new emails cannot get past it; both count the attempt.
    if (!(await consumeLimit(LIMITS.checkStartIp, ip)) || !(await consumeLimit(LIMITS.checkStartEmail, `${ip}:${input.email}`))) {
      throw tooMany("Kindly wait a few minutes before starting another Business Check.");
    }
    const db = await database("start your Business Check");
    const token = randomBytes(24).toString("base64url");
    await db.insert(businessChecks).values({
      publicToken: token,
      pipelineStage: "lead",
      fullName: input.fullName,
      email: input.email,
      whatsapp: input.whatsapp || null,
      heardFrom: input.heardFrom || null,
      stage: "unknown",
      answersJson: "{}",
    });
    return { token };
  }),

  /** Saves answers as the owner goes, so an unfinished check still tells the team where they were. */
  saveProgress: publicProcedure.input(z.object({ token: tokenInput, answers: answersInput })).mutation(async ({ input }) => {
    if (!(await consumeLimit(LIMITS.checkSave, input.token))) throw tooMany("Too many updates. Your answers are still kept on this device.");
    const db = await database("save your progress");
    const check = await findCheck(db, input.token);
    // A finished check is final; later edits on the device do not change what was submitted.
    if (check.completedAt) return { saved: false };
    await db.update(businessChecks).set(answerColumns(cleanAnswers(input.answers))).where(eq(businessChecks.id, check.id));
    return { saved: true };
  }),

  /** Finishes the check: works out the result on the server, writes the summary and emails both sides once. */
  submit: publicProcedure.input(z.object({ token: tokenInput, answers: answersInput })).mutation(async ({ input }): Promise<BusinessCheckResponse> => {
    // Each submission can run the AI summary and send two emails, so one check gets a few an hour (a retry included).
    if (!(await consumeLimit(LIMITS.checkSubmit, input.token))) throw tooMany("Your Business Check has been sent. Kindly wait a while before sending it again.");
    const db = await database("record your Business Check");
    const check = await findCheck(db, input.token);
    if (check.completedAt && check.resultJson && check.summaryJson && check.summarySource) {
      // Already submitted (a double click or a retry): return what was recorded, without emailing again.
      // The owner's own delivery status is not stored; the office copy goes through the same provider, so its status stands in.
      return { token: check.publicToken, result: JSON.parse(check.resultJson), summary: JSON.parse(check.summaryJson), summarySource: check.summarySource, discoveryCallUrl: ENV.discoveryCallUrl, emailStatus: check.notificationStatus };
    }
    const answers = cleanAnswers(input.answers);
    if (!isComplete(answers)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Some questions are still unanswered. Kindly go back and complete them." });
    }

    const result = evaluate(answers);
    const contact = contactOf(check, answers);
    const { summary, source } = await summariseCheck({ answers, result, contact });

    // The completion is claimed in one conditional statement before anything is sent, so two submissions at once
    // (a double click, a retry) record it once and email once; the loser is answered from what was recorded.
    const [claimed] = await db.update(businessChecks).set({
      ...answerColumns(answers),
      pipelineStage: advancePipeline(check.pipelineStage, "qualified_lead"),
      route: result.route,
      readiness: result.founder.level,
      primaryArea: result.primaryArea?.area ?? null,
      resultJson: JSON.stringify(result),
      summaryJson: JSON.stringify(summary),
      summarySource: source,
      completedAt: databaseNow(),
    }).where(and(eq(businessChecks.id, check.id), isNull(businessChecks.completedAt))).returning({ id: businessChecks.id });
    if (!claimed) {
      const recorded = await findCheck(db, input.token);
      return { token: recorded.publicToken, result: JSON.parse(recorded.resultJson ?? "null") ?? result, summary: JSON.parse(recorded.summaryJson ?? "null") ?? summary, summarySource: recorded.summarySource ?? source, discoveryCallUrl: ENV.discoveryCallUrl, emailStatus: recorded.notificationStatus };
    }

    const office = officeEmail({ contact, answers, summary, source, result });
    const owner = ownerEmail({ contact, summary, result, answers, fullReportPay: onlinePaymentOffer(check.publicToken, "full_report") });
    // A delivery problem never undoes the check: the result is already saved and the page says whether email went out.
    const failed = { status: "Failed" as const };
    const [officeDelivery, ownerDelivery] = await Promise.all([
      deliverEmail({ to: BUSINESS_SUPPORT_MAILBOX, subject: office.subject, body: office.body, sender: "business_support", idempotencyKey: `business_checks:${check.id}:summary:office` }).catch(() => failed),
      deliverEmail({ to: check.email, subject: owner.subject, body: owner.body, sender: "business_support", idempotencyKey: `business_checks:${check.id}:summary:owner` }).catch(() => failed),
    ]);
    await db.update(businessChecks)
      .set({ notificationStatus: officeDelivery.status === "Failed" ? "Failed" : officeDelivery.status === "Simulated" ? "Simulated" : "Sent" })
      .where(eq(businessChecks.id, check.id));

    return { token: check.publicToken, result, summary, summarySource: source, discoveryCallUrl: ENV.discoveryCallUrl, emailStatus: ownerDelivery.status === "Sent" ? "Sent" : ownerDelivery.status === "Failed" ? "Failed" : "Simulated" };
  }),

  /** The owner asks for the free call or the full report from the result screen. */
  requestNext: publicProcedure
    .input(z.object({
      token: tokenInput,
      choice: z.enum(["call", "report"]),
      note: z.string().trim().max(500).optional(),
      /** Sent when Calendly confirms a booking; the time itself is read from Calendly on the server. */
      calendlyEventUri: z.string().regex(CALENDLY_EVENT_URI).optional(),
    }))
    .mutation(async ({ input }) => {
      // Each request can email the office and look up Calendly: a handful a day per check is plenty.
      if (!(await consumeLimit(LIMITS.checkNext, input.token))) throw tooMany("Your request has been recorded. Kindly wait before sending another.");
      const db = await database("record your request");
      const check = await findCheck(db, input.token);
      if (!check.completedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Kindly finish the Business Check first." });
      // The Full Report: the same step as paying from the link in the summary email.
      if (input.choice === "report") {
        await askForFullReport(db, check, { source: "result_page", note: input.note });
        return { success: true, choice: input.choice };
      }

      // A Calendly booking: record when the call is, so the admin console shows it as booked.
      // If the booking itself cannot be read, look for the owner's booking by email instead.
      const bookedFor = input.choice === "call" && input.calendlyEventUri
        ? (await bookedCallTime(input.calendlyEventUri, check.email)) ?? (await findBookedCall(check.email))
        : null;
      if (bookedFor) {
        await db.update(businessChecks)
          // The stage moves with the call request below, as for any call request.
          .set({ callScheduledFor: bookedFor })
          .where(eq(businessChecks.id, check.id));
        await recordAudit(db, { action: "business_check_call_booked", targetEmail: check.email, details: { businessCheckId: check.id, scheduledFor: bookedFor.toISOString(), source: "calendly" } });
      }

      const already = check.callRequestedAt;
      if (!already) {
        await db.update(businessChecks)
          .set({ callRequestedAt: databaseNow(), pipelineStage: advancePipeline(check.pipelineStage, "call_booked") })
          .where(eq(businessChecks.id, check.id));
        const what = "a free Debrief";
        await deliverEmail({
          sender: "business_support",
          idempotencyKey: `business_checks:${check.id}:${input.choice}:office`,
          to: BUSINESS_SUPPORT_MAILBOX,
          subject: `Business Check: ${check.businessName || check.fullName} asked for ${what}`,
          body: [
            `${check.fullName} asked for ${what}.`,
            "",
            `Email: ${check.email}`,
            `WhatsApp: ${check.whatsapp || "Not given"}`,
            `Business: ${check.businessName || "Not given"}`,
            `Note: ${input.note || "None"}`,
            ...(bookedFor ? [`Booked on Calendly for: ${lagosTime(bookedFor)} (Lagos time)`] : []),
            "",
            `Business Check #${check.id}, completed ${lagosTime(check.completedAt)} (Lagos time).`,
          ].join("\n"),
        });
      }
      return { success: true, choice: input.choice };
    }),
});
