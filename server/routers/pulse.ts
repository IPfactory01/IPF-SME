import { TRPCError } from "@trpc/server";
import { randomInt } from "crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { pulseConsents, pulseLeads, pulseResponses, pulseResults, pulseSessions, type PulseSession } from "../../drizzle/schema";
import method from "../../shared/pulse/method-v1.0.0.json";
import type { PulseMethodConfig, PulseResult } from "../../shared/pulse/configTypes";
import { buildAnswers, collectUnknownOptionIds, evaluate } from "../../shared/pulse/scoringEngine";
import { buildPathwayResult, type PathwayResult } from "../../shared/pulse/pathwayEngine";
import { QUESTION_GUIDANCE } from "../../shared/pulse/questionGuidance";
import { resolveGuidance } from "../../shared/pulse/guidanceResolver";
import { BRAND } from "../../shared/brand";
import { validateMethodConfig } from "../pulse/configValidation";
import { getDb } from "../db";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "../email";
import { recordAudit } from "../audit";
import { consumeLimit, LIMITS } from "../rateLimit";
import { publicProcedure, router } from "../_core/trpc";

/**
 * The AI & Workflow Readiness Pulse (R107), moved from its Manus site to ipfactory.co/pulse. Every procedure is public:
 * the respondent holds their session id (32 letters and digits, in their link), as with the Business Check's token.
 * Ported from the Manus router with three deliberate changes: the organisation profile lives on the session (Manus let
 * the browser name any profile id when saving a draft), the method version is the bundled file until the Pulse admin
 * can publish versions, and the premium and checkout procedures are left out until the admin and Paystack follow.
 */

/** The method the Pulse scores against. Validated once, when the server starts: a broken file must never score anyone. */
export const PULSE_METHOD = method as unknown as PulseMethodConfig;
const methodErrors = validateMethodConfig(PULSE_METHOD);
if (methodErrors.length > 0) throw new Error(`The Pulse method file is invalid: ${methodErrors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join("; ")}`);

export const PULSE_PRIVACY_NOTICE_VERSION = "v1";
const DRAFT_HOURS = 24;
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const SHORT_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERRAL = /^[A-Za-z0-9_-]{20,32}$/;

const pick = (alphabet: string, length: number) => Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
/** A new respondent key: 32 letters and digits (about 190 bits), the same shape as the Manus site's, so old links keep working. */
export const newPulseSessionId = () => pick(ALPHANUMERIC, 32);
const draftExpiryFromNow = () => new Date(Date.now() + DRAFT_HOURS * 3600 * 1000);

const tooMany = (message: string) => new TRPCError({ code: "TOO_MANY_REQUESTS", message });
const noMarkup = (value: string) => !/<|>|&lt;|&gt;/.test(value);
const sessionIdInput = z.string().min(16).max(32);
const answersInput = z.array(z.object({
  questionId: z.string().min(3).max(16),
  selectedOptionId: z.string().max(32).nullable(),
  isUnknown: z.boolean(),
})).max(80);
type AnswerInput = z.infer<typeof answersInput>;

async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not reach the Pulse just now. Kindly try again shortly." });
  return db;
}
type Db = Awaited<ReturnType<typeof database>>;

async function findSession(db: Db, sessionId: string) {
  const [session] = await db.select().from(pulseSessions).where(eq(pulseSessions.sessionId, sessionId)).limit(1);
  if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "We could not find that Pulse. Kindly start again." });
  return session;
}

const pastExpiry = (session: PulseSession) => Boolean(session.draftExpiry && session.draftExpiry.getTime() < Date.now());
const expiredMessage = "This draft has expired. Kindly start a fresh Pulse.";

/** A draft the respondent may still write to. Marks a draft past its 24 hours as expired, and refuses it. */
async function liveDraft(db: Db, sessionId: string) {
  const session = await findSession(db, sessionId);
  if (session.status === "completed") throw new TRPCError({ code: "FORBIDDEN", message: "This Pulse is already complete." });
  if (session.status !== "draft") throw new TRPCError({ code: "PRECONDITION_FAILED", message: expiredMessage });
  if (pastExpiry(session)) {
    await db.update(pulseSessions).set({ status: "expired" }).where(eq(pulseSessions.id, session.id));
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: expiredMessage });
  }
  return session;
}

/** Replaces the session's saved answers with these, one row per question. */
async function saveAnswers(db: Db, pulseSessionId: number, answers: AnswerInput) {
  const latest = new Map(answers.map((a) => [a.questionId, a]));
  for (const answer of Array.from(latest.values())) {
    await db.insert(pulseResponses)
      .values({ pulseSessionId, questionId: answer.questionId, selectedOptionId: answer.selectedOptionId, isUnknown: answer.isUnknown })
      .onConflictDoUpdate({
        target: [pulseResponses.pulseSessionId, pulseResponses.questionId],
        set: { selectedOptionId: answer.selectedOptionId, isUnknown: answer.isUnknown, updatedAt: sql`now()` },
      });
  }
}

/** A unique invite code; collisions are rare, so a few tries are plenty. */
async function uniqueShortCode(db: Db) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = pick(SHORT_CODE_LETTERS, 7);
    const [taken] = await db.select({ id: pulseSessions.id }).from(pulseSessions).where(eq(pulseSessions.shortCode, code)).limit(1);
    if (!taken) return code;
  }
  return `X${pick(SHORT_CODE_LETTERS, 6)}`;
}

/** The organisation's staff range, as the pathway and guidance engines name sizes. */
export function sizeIdOf(range: string | null | undefined): string | undefined {
  if (!range) return undefined;
  if (/\b1\s*(–|-|to)\s*10\b/.test(range)) return "micro";
  if (/\b11\s*(–|-|to)\s*50\b/.test(range)) return "small";
  if (/\b51\s*(–|-|to)\s*200\b/.test(range)) return "medium";
  if (/201|500\+/.test(range)) return "large";
  return undefined;
}

function segmentOf(session: Pick<PulseSession, "industry" | "employeeRange">) {
  const sizeId = sizeIdOf(session.employeeRange);
  return { ...(session.industry ? { industryId: session.industry } : {}), ...(sizeId ? { sizeId } : {}) };
}

/**
 * What the browser may see of the method: questions, options, help, guidance and labels. Never the raw scores,
 * weights, gate rules or route rules (the Manus FR-017 rule). Guidance is tailored to the respondent's industry and
 * size on the server when a session is given.
 */
export function renderProjection(config: PulseMethodConfig, persona?: { industry: string | null; employeeRange: string | null }) {
  const personalised = Boolean(persona?.industry);
  return {
    assessment_version: config.assessment_version,
    questions: config.questions.map((q) => ({
      question_id: q.question_id,
      section: q.section,
      text: q.text,
      help_text: q.help_text,
      guidance: personalised
        ? resolveGuidance(q.question_id, persona!.industry, persona!.employeeRange)
        : { plainLanguage: QUESTION_GUIDANCE[q.question_id]?.plainLanguage ?? "", example: QUESTION_GUIDANCE[q.question_id]?.example ?? "", sizeFraming: "", isPersonalised: false },
      required: q.required,
      display_order: q.display_order,
      options: q.options.map((o) => ({ option_id: o.option_id, label: o.label, unknown_flag: o.unknown_flag ?? false })),
    })),
    classification_labels: config.classifications.map((c) => ({ minimum_score: c.minimum_score, maximum_score: c.maximum_score, label: c.label, interpretation: c.interpretation })),
    dimensions: config.dimensions.map((d) => ({ dimension_id: d.dimension_id, name: d.name, explanation: d.explanation })),
    routes: config.routes.map((r) => ({ route_id: r.route_id, label: r.label, priority: r.priority })),
    recommendations: config.recommendations.filter((r) => r.status === "active").map((r) => ({ recommendation_id: r.recommendation_id, title: r.title, action: r.action, timeframe: r.timeframe })),
    controlled_lists: config.controlled_lists,
    section_order: ["strategy", "process", "data", "technology", "people", "governance", "opportunity"] as const,
  };
}

/** Checks every answer against the method: unknown questions or options are refused, never silently dropped. */
export function invalidAnswers(config: PulseMethodConfig, answers: AnswerInput) {
  const questions = new Map(config.questions.map((q) => [q.question_id, q]));
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const a of answers) {
    const question = questions.get(a.questionId);
    if (!question) { problems.push(`unknown question "${a.questionId}"`); continue; }
    seen.add(a.questionId);
    if (!a.selectedOptionId) continue;
    const option = question.options.find((o) => o.option_id === a.selectedOptionId);
    if (!option) problems.push(`question "${a.questionId}": unknown option "${a.selectedOptionId}"`);
    else if (a.isUnknown && !option.unknown_flag) problems.push(`question "${a.questionId}": option "${a.selectedOptionId}" is not an "I don't know" option`);
  }
  const missing = config.questions.filter((q) => q.required && !seen.has(q.question_id)).map((q) => q.question_id);
  return { problems, missing };
}

/** Scores a complete set of answers. "I don't know" answers score nothing, so the evidence warning counts them. */
export function scoreAnswers(config: PulseMethodConfig, answers: AnswerInput): PulseResult {
  const scored = buildAnswers(config, Object.fromEntries(answers.map((a) => [a.questionId, a.selectedOptionId ?? ""])), collectUnknownOptionIds(config));
  for (const a of answers) if (a.isUnknown && a.selectedOptionId) scored[a.questionId] = { optionId: a.selectedOptionId, rawScore: null, unknown: true };
  return evaluate(config, { answers: scored });
}

function pathwayOf(config: PulseMethodConfig, result: PulseResult, session: Pick<PulseSession, "industry" | "employeeRange">): PathwayResult {
  const labels = new Map(config.routes.map((r) => [r.route_id, r.label]));
  return buildPathwayResult(
    {
      gates: result.gates,
      routes: result.routes.map((r) => ({ ...r, label: labels.get(r.routeId) ?? r.routeId })),
      showEvidenceWarning: result.showEvidenceWarning,
      unknownCount: result.unknownCount,
    },
    result.questionScores ?? {},
    config,
    segmentOf(session),
  );
}

/** The live site: emailed links must open for the respondent wherever the email was sent from. */
export const PULSE_SITE = "https://www.ipfactory.co";
const resultsLink = (sessionId: string) => `${PULSE_SITE}/pulse/results/${encodeURIComponent(sessionId)}`;

export const pulseRouter = router({
  /** The method as the browser may see it, with guidance tailored to the session's business when one is given. */
  getActiveVersion: publicProcedure
    .input(z.object({ sessionId: sessionIdInput.optional() }).optional())
    .query(async ({ input }) => {
      if (!input?.sessionId) return renderProjection(PULSE_METHOD);
      const db = await getDb();
      const [session] = db ? await db.select().from(pulseSessions).where(eq(pulseSessions.sessionId, input.sessionId)).limit(1) : [];
      // An unknown session falls back to the general guidance; it never steers the content.
      return renderProjection(PULSE_METHOD, session ? { industry: session.industry, employeeRange: session.employeeRange } : undefined);
    }),

  /** The first screen: who is answering, with the privacy notice acknowledged, before the first question. */
  createSession: publicProcedure
    .input(z.object({
      respondentName: z.string().trim().min(2).max(255).refine(noMarkup, "Names must not contain < or >."),
      companyName: z.string().trim().min(2).max(255).refine(noMarkup, "Company names must not contain < or >."),
      email: z.string().trim().toLowerCase().min(6).max(320).pipe(z.string().email("Kindly enter a valid email address.")),
      privacyNoticeVersion: z.literal(PULSE_PRIVACY_NOTICE_VERSION),
      privacyAcknowledged: z.literal(true),
      country: z.string().trim().min(1).max(64).optional(),
      industry: z.string().trim().max(128).optional(),
      employeeRange: z.string().trim().max(32).optional(),
      otherIndustry: z.string().trim().max(128).optional(),
      /** The session id of the respondent whose invite link brought this one. */
      referredBy: z.string().max(32).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = (ctx.req.ip || "unknown").toLowerCase();
      if (!(await consumeLimit(LIMITS.pulseStartIp, ip)) || !(await consumeLimit(LIMITS.pulseStartEmail, `${ip}:${input.email}`))) {
        throw tooMany("Kindly wait a few minutes before starting another Pulse.");
      }
      const db = await database();
      const sessionId = newPulseSessionId();
      const draftExpiry = draftExpiryFromNow();
      const [session] = await db.insert(pulseSessions).values({
        sessionId,
        shortCode: await uniqueShortCode(db),
        assessmentVersion: PULSE_METHOD.assessment_version,
        respondentName: input.respondentName,
        companyName: input.companyName,
        email: input.email,
        country: input.country || null,
        industry: input.industry || null,
        otherIndustry: /\bother\b/i.test(input.industry ?? "") ? input.otherIndustry || null : null,
        employeeRange: input.employeeRange || null,
        referredBy: input.referredBy && REFERRAL.test(input.referredBy) ? input.referredBy : null,
        draftExpiry,
      }).returning();
      await db.insert(pulseConsents).values({ pulseSessionId: session.id, privacyNoticeVersion: input.privacyNoticeVersion });
      await recordAudit(db, { action: "pulse_started", targetEmail: input.email, details: { pulseSessionId: session.id, assessmentVersion: session.assessmentVersion } });
      return { sessionId, assessmentVersion: session.assessmentVersion, draftExpiry };
    }),

  /** An invite code from a shared link (?ic=CODE) to the session id of the person who shared it. */
  resolveInviteCode: publicProcedure
    .input(z.object({ code: z.string().trim().min(5).max(12) }))
    .query(async ({ input, ctx }) => {
      if (!(await consumeLimit(LIMITS.publicLookup, (ctx.req.ip || "unknown").toLowerCase()))) throw tooMany("Too many lookups. Kindly try again later.");
      const db = await database();
      const [session] = await db.select({ sessionId: pulseSessions.sessionId }).from(pulseSessions).where(eq(pulseSessions.shortCode, input.code.toUpperCase())).limit(1);
      return { sessionId: session?.sessionId ?? null };
    }),

  /** A session with its saved answers, so the respondent can carry on where they stopped. */
  getSession: publicProcedure
    .input(z.object({ sessionId: sessionIdInput }))
    .query(async ({ input }) => {
      const db = await database();
      const session = await findSession(db, input.sessionId);
      if (session.status === "draft" && pastExpiry(session)) {
        await db.update(pulseSessions).set({ status: "expired" }).where(eq(pulseSessions.id, session.id));
        return { sessionId: session.sessionId, assessmentVersion: session.assessmentVersion, status: "expired" as const, expired: true, answers: [] };
      }
      const responses = await db.select().from(pulseResponses).where(eq(pulseResponses.pulseSessionId, session.id));
      return {
        sessionId: session.sessionId,
        assessmentVersion: session.assessmentVersion,
        status: session.status,
        expired: session.status === "expired",
        draftExpiry: session.draftExpiry,
        completedAt: session.completedAt,
        respondentName: session.respondentName,
        companyName: session.companyName,
        answers: responses.map((r) => ({ questionId: r.questionId, selectedOptionId: r.selectedOptionId, isUnknown: r.isUnknown })),
      };
    }),

  /** Saves the answers so far. Only the answers: the business's profile was set on the first screen and stays there. */
  saveDraft: publicProcedure
    .input(z.object({ sessionId: sessionIdInput, answers: answersInput }))
    .mutation(async ({ input }) => {
      if (!(await consumeLimit(LIMITS.pulseSave, input.sessionId))) throw tooMany("Too many updates. Your answers are still on this page.");
      const db = await database();
      const session = await liveDraft(db, input.sessionId);
      await saveAnswers(db, session.id, input.answers);
      return { success: true };
    }),

  /** Scores the finished Pulse against the method and keeps the result. */
  submitAssessment: publicProcedure
    .input(z.object({ sessionId: sessionIdInput, answers: answersInput }))
    .mutation(async ({ input }) => {
      if (!(await consumeLimit(LIMITS.pulseSubmit, input.sessionId))) throw tooMany("Kindly wait a moment before submitting again.");
      const db = await database();
      const session = await liveDraft(db, input.sessionId);
      const { problems, missing } = invalidAnswers(PULSE_METHOD, input.answers);
      if (problems.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${problems.length} answer${problems.length > 1 ? "s do" : " does"} not match the Pulse: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? "; …" : ""}. Kindly start again.` });
      }
      if (missing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${missing.length} required question${missing.length > 1 ? "s are" : " is"} unanswered: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}.` });
      }
      await saveAnswers(db, session.id, input.answers);
      const result = scoreAnswers(PULSE_METHOD, input.answers);
      await db.insert(pulseResults).values({
        pulseSessionId: session.id,
        assessmentVersion: session.assessmentVersion,
        overallScore: result.overallScore,
        classification: result.classification.label,
        result,
      });
      await db.update(pulseSessions).set({ status: "completed", completedAt: new Date() }).where(eq(pulseSessions.id, session.id));
      await recordAudit(db, { action: "pulse_completed", targetEmail: session.email, details: { pulseSessionId: session.id, overallScore: result.overallScore, classification: result.classification.label } });

      const pathway = pathwayOf(PULSE_METHOD, result, session);
      await deliverEmail({
        to: BUSINESS_SUPPORT_MAILBOX,
        sender: "business_support",
        idempotencyKey: `pulse_sessions:${session.id}:completed:office`,
        subject: `Pulse: ${session.companyName} scored ${result.overallScore} (${result.classification.label})`,
        body: [
          `${session.respondentName} finished the AI & Workflow Readiness Pulse.`,
          "",
          `Company: ${session.companyName}`,
          `Email: ${session.email}`,
          `Industry: ${session.industry || "Not given"}${session.otherIndustry ? ` (${session.otherIndustry})` : ""}`,
          `Staff: ${session.employeeRange || "Not given"}`,
          `Score: ${result.overallScore} of 100, ${result.classification.label}`,
          `Recommended next step: ${pathway.paidNextStep?.productName ?? pathway.primary?.label ?? "None"}`,
          `First prerequisite: ${pathway.prerequisites[0]?.riskText ?? "None"}`,
          "",
          `Results: ${resultsLink(session.sessionId)}`,
        ].join("\n"),
      }).catch(() => undefined);
      return { success: true, sessionId: session.sessionId };
    }),

  /** The scored result. Anyone with the link may read it, as with a shared Business Check result. */
  getResults: publicProcedure
    .input(z.object({ sessionId: sessionIdInput }))
    .query(async ({ input }) => {
      const db = await database();
      const session = await findSession(db, input.sessionId);
      if (session.status !== "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Pulse is not finished yet." });
      const [stored] = await db.select().from(pulseResults).where(eq(pulseResults.pulseSessionId, session.id)).limit(1);
      if (!stored) throw new TRPCError({ code: "NOT_FOUND", message: "We could not find this result." });
      const result = stored.result as PulseResult;
      const labels = new Map(PULSE_METHOD.routes.map((r) => [r.route_id, r.label]));
      const dimensionMeta = new Map(PULSE_METHOD.dimensions.map((d) => [d.dimension_id, d]));
      return {
        sessionId: session.sessionId,
        assessmentVersion: stored.assessmentVersion,
        companyName: session.companyName,
        shortCode: session.shortCode,
        classification: stored.classification,
        overallScore: stored.overallScore,
        dimensions: Object.entries(result.dimensions ?? {}).map(([dimensionId, score]) => ({
          dimension_id: dimensionId,
          name: dimensionMeta.get(dimensionId)?.name ?? dimensionId,
          explanation: dimensionMeta.get(dimensionId)?.explanation ?? "",
          score: score as number,
        })),
        gates: result.gates ?? [],
        routes: (result.routes ?? []).map((r) => ({ ...r, label: labels.get(r.routeId) ?? r.routeId })),
        recommendations: result.recommendations ?? [],
        showEvidenceWarning: Boolean(result.showEvidenceWarning),
        unknownCount: result.unknownCount ?? 0,
        answeredCount: result.answeredCount ?? 0,
        pathwayResult: pathwayOf(PULSE_METHOD, result, session),
      };
    }),

  /** Emails the respondent a link to their result, and records their marketing choice. */
  requestEmailedReport: publicProcedure
    .input(z.object({ sessionId: sessionIdInput, marketingConsent: z.boolean() }))
    .mutation(async ({ input }) => {
      if (!(await consumeLimit(LIMITS.pulseReportEmail, input.sessionId))) throw tooMany("You have asked for several copies already. Kindly try again tomorrow.");
      const db = await database();
      const session = await findSession(db, input.sessionId);
      if (session.status !== "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Pulse is not finished yet." });
      const [stored] = await db.select().from(pulseResults).where(eq(pulseResults.pulseSessionId, session.id)).limit(1);
      await db.insert(pulseConsents).values({ pulseSessionId: session.id, privacyNoticeVersion: PULSE_PRIVACY_NOTICE_VERSION, marketingConsent: input.marketingConsent });
      const delivery = await deliverEmail({
        to: session.email,
        sender: "business_support",
        subject: "Your AI & Workflow Readiness Pulse result",
        body: [
          `Dear ${session.respondentName},`,
          "",
          `Thank you for taking the AI & Workflow Readiness Pulse for ${session.companyName}.`,
          stored ? `Your score is ${stored.overallScore} of 100: ${stored.classification}.` : "",
          "",
          "Your full result, with the 90-day action plan, is here:",
          resultsLink(session.sessionId),
          "",
          "Keep this link private: anyone who has it can read your result.",
          `To talk it through with us, book a free Discovery Call: ${BRAND.discoveryCallUrl}`,
          "",
          BRAND.organisationName,
        ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n"),
      }).catch(() => ({ status: "Failed" as const }));
      await recordAudit(db, { action: "pulse_report_emailed", targetEmail: session.email, details: { pulseSessionId: session.id, marketingConsent: input.marketingConsent, status: delivery.status } });
      return { success: true, delivered: delivery.status === "Sent" };
    }),

  /** The respondent asks for the scope and fee of the next step the Pulse recommended. */
  requestScope: publicProcedure
    .input(z.object({ sessionId: sessionIdInput }))
    .mutation(async ({ input }) => {
      if (!(await consumeLimit(LIMITS.pulseLead, input.sessionId))) throw tooMany("Your request is already with us. The team will reply by email.");
      const db = await database();
      const session = await findSession(db, input.sessionId);
      if (session.status !== "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This Pulse is not finished yet." });
      const [stored] = await db.select().from(pulseResults).where(eq(pulseResults.pulseSessionId, session.id)).limit(1);
      const pathway = stored ? pathwayOf(PULSE_METHOD, stored.result as PulseResult, session) : null;
      const recommended = pathway?.paidNextStep?.productName ?? pathway?.primary?.label ?? null;
      const [lead] = await db.insert(pulseLeads).values({
        pulseSessionId: session.id,
        kind: "scope",
        name: session.respondentName,
        company: session.companyName,
        email: session.email,
        recommended: recommended?.slice(0, 192) ?? null,
      }).returning();
      await recordAudit(db, { action: "pulse_scope_requested", targetEmail: session.email, details: { pulseSessionId: session.id, pulseLeadId: lead.id } });
      await deliverEmail({
        to: BUSINESS_SUPPORT_MAILBOX,
        sender: "business_support",
        idempotencyKey: `pulse_leads:${lead.id}:office`,
        subject: `Pulse: ${session.companyName} asked for the scope and fee`,
        body: [
          `${session.respondentName} asked for the scope and fee of the next step their Pulse recommended.`,
          "",
          `Company: ${session.companyName}`,
          `Email: ${session.email}`,
          `Recommended: ${recommended ?? "None"}`,
          stored ? `Score: ${stored.overallScore} of 100, ${stored.classification}` : "",
          "",
          `Results: ${resultsLink(session.sessionId)}`,
        ].join("\n"),
      }).catch(() => undefined);
      return { success: true };
    }),

  /** A draft past its 24 hours starts again with a new session, keeping the respondent and their business. */
  restartExpiredSession: publicProcedure
    .input(z.object({ expiredSessionId: sessionIdInput }))
    .mutation(async ({ input, ctx }) => {
      if (!(await consumeLimit(LIMITS.pulseStartIp, (ctx.req.ip || "unknown").toLowerCase()))) throw tooMany("Kindly wait a few minutes before starting another Pulse.");
      const db = await database();
      const old = await findSession(db, input.expiredSessionId);
      if (old.status === "completed" || !(old.status === "expired" || pastExpiry(old))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only an expired draft can be started again." });
      }
      if (old.status !== "expired") await db.update(pulseSessions).set({ status: "expired" }).where(eq(pulseSessions.id, old.id));
      const newSessionId = newPulseSessionId();
      const draftExpiry = draftExpiryFromNow();
      const [session] = await db.insert(pulseSessions).values({
        sessionId: newSessionId,
        shortCode: await uniqueShortCode(db),
        assessmentVersion: PULSE_METHOD.assessment_version,
        respondentName: old.respondentName,
        companyName: old.companyName,
        email: old.email,
        country: old.country,
        industry: old.industry,
        otherIndustry: old.otherIndustry,
        employeeRange: old.employeeRange,
        referredBy: old.referredBy,
        draftExpiry,
      }).returning();
      // The privacy acknowledgement given on the first session covers the same person carrying on.
      await recordAudit(db, { action: "pulse_restarted", targetEmail: old.email, details: { pulseSessionId: session.id, expiredPulseSessionId: old.id } });
      return { newSessionId, assessmentVersion: session.assessmentVersion, draftExpiry };
    }),
});
