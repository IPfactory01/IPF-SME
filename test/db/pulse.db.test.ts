/**
 * The AI & Workflow Readiness Pulse at /pulse (R107): start with consent, save a draft, finish and score it, read the
 * result, email a link, ask for the scope and fee, and start an expired draft again. Real router code on PostgreSQL
 * (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`). Email is stubbed; nothing leaves the process.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({ deliverEmail: vi.fn() }));

vi.mock("pg", () => ({ default: { Pool: class { on() { return this; } } } }));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () =>
    new Proxy({}, {
      get: (_target, property) => {
        const value = holder.current[property as string];
        return typeof value === "function" ? value.bind(holder.current) : value;
      },
    }),
}));
vi.mock("@server/email", async importOriginal => ({ ...(await importOriginal<typeof import("@server/email")>()), deliverEmail: mocked.deliverEmail }));

import { appRouter } from "@server/routers";
import { PULSE_METHOD } from "@server/routers/pulse";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import type { TrpcContext } from "@server/_core/context";

const REMOTE_TEST_TIMEOUT_MS = 90_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const visitor = () => appRouter.createCaller({ user: null, req: { ip: `203.0.113.${(counter += 1) % 250}`, protocol: "https", headers: {} }, res: { clearCookie: () => undefined, cookie: () => undefined } } as unknown as TrpcContext);
const OFFICE = "info@ipfactory.co";

/** The second-best option on every question: a complete, valid set of answers. */
const allAnswers = () => PULSE_METHOD.questions.map((q) => {
  const scored = q.options.filter((o) => !o.unknown_flag);
  return { questionId: q.question_id, selectedOptionId: scored[Math.max(0, scored.length - 2)].option_id, isUnknown: false };
});

for (const target of targets) {
  describe.skipIf(!target.enabled)(`The Pulse on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    const sessionRow = async (sessionId: string) => (await db.select().from(schema.pulseSessions).where(eq(schema.pulseSessions.sessionId, sessionId)))[0];
    const emails = () => mocked.deliverEmail.mock.calls.map((call) => call[0] as { to: string; subject: string; body: string });

    async function started(label: string, extra: Record<string, unknown> = {}) {
      const { sessionId } = await visitor().pulse.createSession({
        respondentName: `Ngozi ${label}`,
        companyName: `Fictional Foods ${label}`,
        email: `ngozi.${label}.${counter}@example.com`,
        privacyNoticeVersion: "v1",
        privacyAcknowledged: true,
        country: "Nigeria",
        industry: "Manufacturing",
        employeeRange: "11 to 50",
        ...extra,
      });
      return sessionId;
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
    }, 120_000);
    afterAll(async () => { await harness?.close(); });
    beforeEach(async () => {
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Sent" });
      await resetBusinessCheckRateLimitsForTests();
    });

    it("starts a Pulse with the contact and business on the session, a consent record and an invite code", async () => {
      const sessionId = await started("start");
      expect(sessionId).toMatch(/^[A-Za-z0-9]{32}$/);
      const row = await sessionRow(sessionId);
      expect(row).toMatchObject({ status: "draft", companyName: "Fictional Foods start", industry: "Manufacturing", employeeRange: "11 to 50", source: "shift", assessmentVersion: PULSE_METHOD.assessment_version });
      expect(row.shortCode).toMatch(/^[A-Z0-9]{7}$/);
      expect(row.draftExpiry.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
      const consents = await db.select().from(schema.pulseConsents).where(eq(schema.pulseConsents.pulseSessionId, row.id));
      expect(consents).toEqual([expect.objectContaining({ privacyNoticeVersion: "v1", marketingConsent: false })]);
      expect((await visitor().pulse.resolveInviteCode({ code: row.shortCode.toLowerCase() })).sessionId).toBe(sessionId);
    });

    it("refuses a start without the privacy notice acknowledged, or with markup in the name", async () => {
      await expect(visitor().pulse.createSession({ respondentName: "Ngozi", companyName: "Fictional Foods", email: "ngozi@example.com", privacyNoticeVersion: "v1", privacyAcknowledged: false as true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(visitor().pulse.createSession({ respondentName: "<b>Ngozi</b>", companyName: "Fictional Foods", email: "ngozi@example.com", privacyNoticeVersion: "v1", privacyAcknowledged: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("keeps only a well-formed referral", async () => {
      const referrer = await started("referrer");
      const referred = await started("referred", { referredBy: referrer });
      const junk = await started("junk", { referredBy: "not a session!" });
      expect((await sessionRow(referred)).referredBy).toBe(referrer);
      expect((await sessionRow(junk)).referredBy).toBeNull();
    });

    it("saves a draft answer by answer, one row per question, and gives it back", async () => {
      const sessionId = await started("draft");
      const [first, second] = allAnswers();
      await visitor().pulse.saveDraft({ sessionId, answers: [first] });
      await visitor().pulse.saveDraft({ sessionId, answers: [{ ...first, selectedOptionId: PULSE_METHOD.questions[0].options[0].option_id }, second] });
      const session = await visitor().pulse.getSession({ sessionId });
      expect(session.status).toBe("draft");
      expect(session.answers).toHaveLength(2);
      expect(session.answers.find((a) => a.questionId === first.questionId)?.selectedOptionId).toBe(PULSE_METHOD.questions[0].options[0].option_id);
    });

    it("never lets a draft save change the business it belongs to", async () => {
      const sessionId = await started("profile");
      // The Manus site took an organisation profile id (and country, industry, staff) from the browser here.
      await visitor().pulse.saveDraft({ sessionId, answers: [], organisationProfileId: 1, industry: "Banking", country: "Ghana" } as never);
      expect(await sessionRow(sessionId)).toMatchObject({ industry: "Manufacturing", country: "Nigeria" });
    });

    it("scores a finished Pulse, keeps the result, emails the office and serves the result by its link", async () => {
      const sessionId = await started("finish");
      const done = await visitor().pulse.submitAssessment({ sessionId, answers: allAnswers() });
      expect(done).toEqual({ success: true, sessionId });
      const row = await sessionRow(sessionId);
      expect(row.status).toBe("completed");
      const [stored] = await db.select().from(schema.pulseResults).where(eq(schema.pulseResults.pulseSessionId, row.id));
      expect(stored.overallScore).toBeGreaterThan(0);
      const results = await visitor().pulse.getResults({ sessionId });
      expect(results).toMatchObject({ overallScore: stored.overallScore, classification: stored.classification, companyName: "Fictional Foods finish" });
      expect(results.dimensions.length).toBe(PULSE_METHOD.dimensions.length);
      expect(results.pathwayResult).toBeTruthy();
      const office = emails().find((email) => email.to === OFFICE)!;
      expect(office.subject).toBe(`Pulse: Fictional Foods finish scored ${stored.overallScore} (${stored.classification})`);
      expect(office.body).toContain(`https://www.ipfactory.co/pulse/results/${sessionId}`);
      // Finished is final: no more saves or submissions.
      await expect(visitor().pulse.saveDraft({ sessionId, answers: [] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(visitor().pulse.submitAssessment({ sessionId, answers: allAnswers() })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses an answer the method does not know, and a Pulse with a required question missing", async () => {
      const sessionId = await started("invalid");
      const answers = allAnswers();
      await expect(visitor().pulse.submitAssessment({ sessionId, answers: [{ ...answers[0], selectedOptionId: "S-01-99" }, ...answers.slice(1)] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(visitor().pulse.submitAssessment({ sessionId, answers: [{ ...answers[0], isUnknown: true }, ...answers.slice(1)] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(visitor().pulse.submitAssessment({ sessionId, answers: answers.slice(1) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await sessionRow(sessionId)).status).toBe("draft");
    });

    it("counts \"I don't know\" answers, and warns once they pass a third of the answers", async () => {
      const few = await started("few-unknown");
      await visitor().pulse.submitAssessment({ sessionId: few, answers: unknownFirst(1) });
      expect(await visitor().pulse.getResults({ sessionId: few })).toMatchObject({ unknownCount: 1, showEvidenceWarning: false });
      const sessionId = await started("unknown");
      const answers = unknownFirst(10);
      await visitor().pulse.submitAssessment({ sessionId, answers });
      const results = await visitor().pulse.getResults({ sessionId });
      expect(results.unknownCount).toBe(10);
      expect(results.showEvidenceWarning).toBe(true);
    });

    /** "I don't know" on the first n questions, the rest answered. */
    function unknownFirst(n: number) {
      return allAnswers().map((a, i) => {
        if (i >= n) return a;
        const unknown = PULSE_METHOD.questions[i].options.find((o) => o.unknown_flag)!;
        return { questionId: a.questionId, selectedOptionId: unknown.option_id, isUnknown: true };
      });
    }

    it("shows no result before the Pulse is finished", async () => {
      const sessionId = await started("early");
      await expect(visitor().pulse.getResults({ sessionId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(visitor().pulse.getResults({ sessionId: "A".repeat(32) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("expires a draft after 24 hours and starts it again with the business kept", async () => {
      const sessionId = await started("expired");
      await db.update(schema.pulseSessions).set({ draftExpiry: new Date(Date.now() - 1000) }).where(eq(schema.pulseSessions.sessionId, sessionId));
      await expect(visitor().pulse.saveDraft({ sessionId, answers: [] })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await visitor().pulse.getSession({ sessionId })).expired).toBe(true);
      const { newSessionId } = await visitor().pulse.restartExpiredSession({ expiredSessionId: sessionId });
      expect(newSessionId).not.toBe(sessionId);
      expect(await sessionRow(newSessionId)).toMatchObject({ status: "draft", companyName: "Fictional Foods expired", industry: "Manufacturing" });
      // A live draft cannot be restarted.
      await expect(visitor().pulse.restartExpiredSession({ expiredSessionId: newSessionId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    });

    it("emails the respondent a link to their result and records the marketing choice", async () => {
      const sessionId = await started("emailed");
      await visitor().pulse.submitAssessment({ sessionId, answers: allAnswers() });
      mocked.deliverEmail.mockClear();
      const sent = await visitor().pulse.requestEmailedReport({ sessionId, marketingConsent: true });
      expect(sent).toEqual({ success: true, delivered: true });
      const row = await sessionRow(sessionId);
      const [email] = emails();
      expect(email.to).toBe(row.email);
      expect(email.subject).toBe("Your AI & Workflow Readiness Pulse result");
      expect(email.body).toContain(`https://www.ipfactory.co/pulse/results/${sessionId}`);
      const consents = await db.select().from(schema.pulseConsents).where(eq(schema.pulseConsents.pulseSessionId, row.id));
      expect(consents.map((c: { marketingConsent: boolean }) => c.marketingConsent)).toEqual([false, true]);
    });

    it("says honestly when the emailed copy did not go", async () => {
      const sessionId = await started("failed");
      await visitor().pulse.submitAssessment({ sessionId, answers: allAnswers() });
      mocked.deliverEmail.mockResolvedValue({ status: "Failed", reason: "refused" });
      expect((await visitor().pulse.requestEmailedReport({ sessionId, marketingConsent: false })).delivered).toBe(false);
    });

    it("records a request for the scope and fee as a lead and tells the office", async () => {
      const sessionId = await started("scope");
      await expect(visitor().pulse.requestScope({ sessionId })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await visitor().pulse.submitAssessment({ sessionId, answers: allAnswers() });
      mocked.deliverEmail.mockClear();
      await visitor().pulse.requestScope({ sessionId });
      const row = await sessionRow(sessionId);
      const [lead] = await db.select().from(schema.pulseLeads).where(eq(schema.pulseLeads.pulseSessionId, row.id));
      expect(lead).toMatchObject({ kind: "scope", company: "Fictional Foods scope", email: row.email });
      expect(emails()).toEqual([expect.objectContaining({ to: OFFICE, subject: "Pulse: Fictional Foods scope asked for the scope and fee" })]);
    });

    it("shows the browser the questions and guidance, never the scores or rules", async () => {
      const general = await visitor().pulse.getActiveVersion();
      expect(general.questions).toHaveLength(PULSE_METHOD.questions.length);
      const text = JSON.stringify(general);
      expect(text).not.toContain("raw_score");
      expect(text).not.toContain("weight");
      expect(text).not.toContain("risk_trigger");
      const sessionId = await started("guidance");
      const tailored = await visitor().pulse.getActiveVersion({ sessionId });
      expect(tailored.questions.some((q) => q.guidance.isPersonalised)).toBe(true);
    });
  });
}
