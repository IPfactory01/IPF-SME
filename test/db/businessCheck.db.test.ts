/**
 * Free Business Health Check persistence on PostgreSQL: PGlite on every run, plus TEST_DATABASE_URL when set.
 * The language model and email delivery are stubbed; everything else is the production router and schema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles, profileContact } from "../fixtures/businessCheckProfiles";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({ deliverEmail: vi.fn(), bookedCallTime: vi.fn() }));

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
vi.mock("@server/_core/llm", () => ({ invokeLLM: () => Promise.reject(new Error("offline")) }));
// Calendly is a third-party API: the booking lookup is stubbed; its own rules are tested in test/server/calendly.test.ts.
vi.mock("@server/calendly", async importOriginal => ({ ...(await importOriginal<typeof import("@server/calendly")>()), bookedCallTime: mocked.bookedCallTime }));
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key" } }));

import { businessCheckRouter, resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { BUSINESS_SUPPORT_MAILBOX } from "@server/email";
import { cleanAnswers, evaluate, founderRead } from "@shared/businessCheck/engine";
import type { TrpcContext } from "@server/_core/context";

const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  // One network round trip per statement on a real database; local targets keep the default 5 s ceiling.
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: 30_000, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

const caller = () =>
  businessCheckRouter.createCaller({ req: { ip: "203.0.113.9", protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Free Business Health Check persistence on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
    }, 60_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      // Each test gets a fresh allowance; the limiter is module-level and shared by every target in this process.
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    const started = async (email: string) => {
      const contact = { ...profileContact("Lead"), email };
      const { token } = await caller().start({ fullName: contact.fullName, email: contact.email, whatsapp: "+2348000000000", heardFrom: "LinkedIn" });
      return token;
    };
    const rowFor = async (token: string) => (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0];

    describe("start and saveProgress", () => {
      it("records the owner as a lead before any question, with no result yet", async () => {
        const token = await started("lead-start@example.test");
        const row = await rowFor(token);
        expect(row).toMatchObject({ pipelineStage: "lead", fullName: "Profile Lead", whatsapp: "+2348000000000", heardFrom: "LinkedIn", stage: "unknown", answersJson: "{}", route: null, resultJson: null, summaryJson: null, completedAt: null });
        expect(row.updatedAt).toBeInstanceOf(Date);
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
      });

      it("saves cleaned answers as the owner goes, with the business name and description typed in the check", async () => {
        const token = await started("lead-progress@example.test");
        await caller().saveProgress({ token, answers: { p_stage: "operating", p_name: "  Ada   Foods ", p_description: "Snacks in Lagos", s9_status: "not-on-path" } });
        const row = await rowFor(token);
        expect(row).toMatchObject({ pipelineStage: "lead", stage: "operating", businessName: "Ada Foods", description: "Snacks in Lagos" });
        expect(JSON.parse(row.answersJson)).toEqual({ p_stage: "operating", p_name: "Ada Foods", p_description: "Snacks in Lagos" });
      });

      it("rejects an unknown token", async () => {
        await expect(caller().saveProgress({ token: "x".repeat(24), answers: {} })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("limits how many checks one address can start, whatever email is used", async () => {
        const flood = businessCheckRouter.createCaller({ req: { ip: "198.51.100.77", protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);
        for (let index = 0; index < 20; index++) await flood.start({ fullName: "Flood Test", email: `flood-${target.name}-${index}@example.test` });
        await expect(flood.start({ fullName: "Flood Test", email: `flood-${target.name}-final@example.test` })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      });
    });

    describe.each(Object.entries(businessCheckProfiles))("submit: %s", (name, rawAnswers) => {
      it("completes the lead's row with answers, result and summary, and marks it a qualified lead", async () => {
        const contact = profileContact(name);
        const { token } = await caller().start({ fullName: contact.fullName, email: contact.email });
        const answers = cleanAnswers({ ...rawAnswers, p_name: contact.businessName, p_description: contact.description });
        const response = await caller().submit({ token, answers });

        const rows = await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.email, contact.email));
        expect(rows).toHaveLength(1);
        const row = rows[0];
        const result = evaluate(answers);

        expect(row.publicToken).toBe(response.token);
        expect(row).toMatchObject({
          pipelineStage: "qualified_lead",
          fullName: contact.fullName,
          businessName: contact.businessName,
          description: contact.description,
          route: result.route,
          readiness: founderRead(answers).level,
          primaryArea: result.primaryArea?.area ?? null,
          summarySource: "Rules",
          notificationStatus: "Simulated",
          callRequestedAt: null,
          reportRequestedAt: null,
        });
        expect(JSON.parse(row.answersJson)).toEqual(answers);
        expect(JSON.parse(row.resultJson)).toEqual(JSON.parse(JSON.stringify(result)));
        expect(JSON.parse(row.summaryJson)).toEqual(JSON.parse(JSON.stringify(response.summary)));
        expect(row.completedAt).toBeInstanceOf(Date);
        expect(response.result).toEqual(result);
        // One email to the office and one to the owner.
        expect(mocked.deliverEmail.mock.calls.map(([message]) => message.to).sort()).toEqual([contact.email, BUSINESS_SUPPORT_MAILBOX].sort());
      });
    });

    describe("submit, once", () => {
      it("returns the recorded result on a repeat submit without emailing again, and ignores later saves", async () => {
        const token = await started("submit-once@example.test");
        const first = await caller().submit({ token, answers: businessCheckProfiles.growingMaker });
        mocked.deliverEmail.mockClear();
        const again = await caller().submit({ token, answers: businessCheckProfiles.smallOperatingTrader });
        expect(again.result).toEqual(JSON.parse(JSON.stringify(first.result)));
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
        expect(await caller().saveProgress({ token, answers: { p_stage: "idea" } })).toEqual({ saved: false });
        expect((await rowFor(token)).stage).toBe("operating");
      });

      it("records one result and emails once when the same check is sent twice at once", async () => {
        const token = await started("submit-race@example.test");
        mocked.deliverEmail.mockClear();
        const [first, second] = await Promise.all([
          caller().submit({ token, answers: businessCheckProfiles.growingMaker }),
          caller().submit({ token, answers: businessCheckProfiles.growingMaker }),
        ]);
        expect(first.result).toEqual(second.result);
        expect(mocked.deliverEmail.mock.calls.filter(call => (call[0] as { to: string }).to === "submit-race@example.test")).toHaveLength(1);
        expect((await rowFor(token)).completedAt).toBeInstanceOf(Date);
      });

      it("lets a check be sent a few times an hour (a retry included), then asks the owner to wait", async () => {
        const token = await started("submit-limit@example.test");
        await caller().submit({ token, answers: businessCheckProfiles.growingMaker });
        await caller().submit({ token, answers: businessCheckProfiles.growingMaker });
        await caller().submit({ token, answers: businessCheckProfiles.growingMaker });
        await expect(caller().submit({ token, answers: businessCheckProfiles.growingMaker })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      });

      it("refuses an incomplete check", async () => {
        const token = await started("submit-incomplete@example.test");
        await expect(caller().submit({ token, answers: { p_stage: "operating" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect((await rowFor(token)).pipelineStage).toBe("lead");
      });
    });

    describe("requestNext", () => {
      async function submitted(email: string) {
        const token = await started(email);
        await caller().submit({ token, answers: businessCheckProfiles.growingMaker });
        mocked.deliverEmail.mockClear();
        return token;
      }

      it("call sets callRequestedAt only, once, and notifies the Business Support inbox", async () => {
        const token = await submitted("next-call@example.test");
        await caller().requestNext({ token, choice: "call", note: "Please phone me." });
        const first = await rowFor(token);
        expect(first.callRequestedAt).toBeInstanceOf(Date);
        expect(first.pipelineStage).toBe("call_booked");
        expect(first.reportRequestedAt).toBeNull();
        expect(mocked.deliverEmail).toHaveBeenCalledTimes(1);
        expect(mocked.deliverEmail.mock.calls[0][0].to).toBe(BUSINESS_SUPPORT_MAILBOX);

        await caller().requestNext({ token, choice: "call" });
        expect((await rowFor(token)).callRequestedAt!.getTime()).toBe(first.callRequestedAt!.getTime());
        expect(mocked.deliverEmail).toHaveBeenCalledTimes(1);
      });

      it("report sets reportRequestedAt only", async () => {
        const token = await submitted("next-report@example.test");
        await caller().requestNext({ token, choice: "report" });
        const row = await rowFor(token);
        expect(row.reportRequestedAt).toBeInstanceOf(Date);
        expect(row.callRequestedAt).toBeNull();
        // The full report is independent of the call: it does not move the pipeline.
        expect(row.pipelineStage).toBe("qualified_lead");
      });

      it("rejects an unknown token", async () => {
        await expect(caller().requestNext({ token: "x".repeat(24), choice: "call" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("takes a handful of requests a day per check, then asks the owner to wait", async () => {
        const token = await submitted("next-limit@example.test");
        for (let attempt = 0; attempt < 5; attempt += 1) await caller().requestNext({ token, choice: "call" });
        await expect(caller().requestNext({ token, choice: "call" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
      });

      it("refuses a request before the check is finished", async () => {
        const token = await started("next-early@example.test");
        await expect(caller().requestNext({ token, choice: "call" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("records the call time from a Calendly booking, so the admin console shows it as booked, and audits it", async () => {
        const token = await submitted("next-calendly@example.test");
        const when = new Date("2026-10-14T09:00:00Z");
        mocked.bookedCallTime.mockResolvedValueOnce(when);
        const uri = "https://api.calendly.com/scheduled_events/ABCDEF12-3456-7890";
        await caller().requestNext({ token, choice: "call", calendlyEventUri: uri });
        const row = await rowFor(token);
        expect(mocked.bookedCallTime).toHaveBeenCalledWith(uri, "next-calendly@example.test");
        expect(row).toMatchObject({ pipelineStage: "call_booked" });
        expect(row.callScheduledFor.getTime()).toBe(when.getTime());
        expect(row.callRequestedAt).toBeInstanceOf(Date);
        expect(mocked.deliverEmail.mock.calls[0][0].body).toContain("Booked on Calendly for: Wed, 14 Oct 2026, 10:00 am (Lagos time)");
        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "business_check_call_booked"));
        expect(events.some((event: { details: string }) => event.details.includes(`"businessCheckId":${row.id}`) && event.details.includes("2026-10-14T09:00:00.000Z"))).toBe(true);
      });

      it("keeps a call as requested when Calendly cannot confirm the booking, and refuses an address that is not a Calendly booking", async () => {
        const token = await submitted("next-unconfirmed@example.test");
        mocked.bookedCallTime.mockResolvedValueOnce(null);
        await caller().requestNext({ token, choice: "call", calendlyEventUri: "https://api.calendly.com/scheduled_events/ABCDEF12-3456-7890" });
        const row = await rowFor(token);
        expect(row.callScheduledFor).toBeNull();
        expect(row.callRequestedAt).toBeInstanceOf(Date);
        await expect(caller().requestNext({ token, choice: "call", calendlyEventUri: "https://evil.example/booking" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("never moves a stage the team has set", async () => {
        const token = await submitted("next-manual@example.test");
        await db.update(schema.businessChecks).set({ pipelineStage: "opportunity" }).where(eq(schema.businessChecks.publicToken, token));
        await caller().requestNext({ token, choice: "call" });
        expect((await rowFor(token)).pipelineStage).toBe("opportunity");
      });
    });
  });
}

describe("migration 0001: business check pipeline", () => {
  const statementsOf = (tag: string) =>
    readFileSync(resolve(process.cwd(), "drizzle/migrations", `${tag}.sql`), "utf8").split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

  it("marks checks saved before it as finished: qualified lead, or call booked when a call was asked for", async () => {
    const pg = new PGlite();
    try {
      for (const statement of statementsOf("0000_postgres_baseline")) await pg.exec(statement);
      const base = `INSERT INTO "business_checks" ("publicToken","fullName","email","stage","route","readiness","answersJson","resultJson","summaryJson","summarySource","createdAt"`;
      await pg.exec(`${base}) VALUES ('${"a".repeat(32)}','Before One','before-one@example.test','operating','programme','intermediate','{}','{}','{}','Rules','2026-10-01T09:00:00Z')`);
      await pg.exec(`${base},"callRequestedAt") VALUES ('${"b".repeat(32)}','Before Two','before-two@example.test','operating','programme','intermediate','{}','{}','{}','Rules','2026-10-02T09:00:00Z','2026-10-02T10:00:00Z')`);
      for (const statement of statementsOf("0001_business_check_pipeline")) await pg.exec(statement);

      const { rows } = await pg.query<{ email: string; pipelineStage: string; completedAt: Date; createdAt: Date; updatedAt: Date }>(
        `SELECT "email", "pipelineStage", "completedAt", "createdAt", "updatedAt" FROM "business_checks" ORDER BY "email"`,
      );
      expect(rows.map((row) => [row.email, row.pipelineStage])).toEqual([["before-one@example.test", "qualified_lead"], ["before-two@example.test", "call_booked"]]);
      for (const row of rows) {
        expect(row.completedAt.getTime()).toBe(row.createdAt.getTime());
        expect(row.updatedAt.getTime()).toBe(row.createdAt.getTime());
      }
      // New rows start as leads with no result.
      await pg.exec(`INSERT INTO "business_checks" ("publicToken","fullName","email","stage","answersJson") VALUES ('${"c".repeat(32)}','New Lead','new-lead@example.test','unknown','{}')`);
      const { rows: [lead] } = await pg.query<{ pipelineStage: string; completedAt: Date | null }>(`SELECT "pipelineStage", "completedAt" FROM "business_checks" WHERE "email" = 'new-lead@example.test'`);
      expect(lead).toEqual({ pipelineStage: "lead", completedAt: null });
    } finally {
      await pg.close();
    }
  });
});
