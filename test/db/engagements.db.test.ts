/**
 * The engagement room on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`): the engagement
 * starts when the Business Review is paid, joins the owner's business when they create their account, and
 * every read and change is checked on the server: the team by permission and assignment, the client by membership
 * and by what was shared with them. Email and the language model are stubbed.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { legacyBusinessReviewRequest } from "./legacyBusinessReview";
import { businessCheckProfiles } from "../fixtures/businessCheckProfiles";
import { sampleIntake } from "../fixtures/reportIntake";
import { addDays, lagosDay } from "@shared/agreement";

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
vi.mock("@server/_core/llm", () => ({ invokeLLM: () => Promise.reject(new Error("offline")) }));
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key", calendlyApiToken: "" } }));

import { appRouter } from "@server/routers";
import { createContext } from "@server/_core/context";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { hashAdminPassword, OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { addWorkingDays } from "@server/engagements";
import { checkDatabase } from "@server/databaseHealth";
import { ENV } from "@server/_core/env";
import { ACCOUNT_SESSION_COOKIE, type PlatformRole } from "@shared/auth";
import { cleanAnswers } from "@shared/businessCheck/engine";
import { ASSESSMENT_TEMPLATE } from "@shared/engagement";
import type { TrpcContext } from "@server/_core/context";

const REMOTE_TEST_TIMEOUT_MS = 90_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";

function browser() {
  const jar = new Map<string, string>();
  const ip = `198.51.100.${(counter += 1) % 250}`;
  const call = async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
    const res = { cookie: (name: string, value: string) => void jar.set(name, value), clearCookie: (name: string) => void jar.delete(name) };
    const context = await createContext({ req: { ip, protocol: "https", headers: cookie ? { cookie } : {} }, res } as never);
    return appRouter.createCaller(context as TrpcContext);
  };
  return { call, jar, token: () => jar.get(ACCOUNT_SESSION_COOKIE) };
}
type Browser = ReturnType<typeof browser>;
type EmailCall = { to: string; subject: string; body: string };

const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`The engagement room on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(roles: PlatformRole[] = [], name = "Test Person") {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name, role: "user", status: "active" }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signIn(user: { email: string }, internal = false) {
      const b = browser();
      const caller = await b.call();
      if (internal) await caller.account.signInInternal({ email: user.email, password: PASSWORD });
      else await caller.account.signIn({ email: user.email, password: PASSWORD });
      return b;
    }
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const engagementOf = async (businessCheckId: number) => (await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, businessCheckId)))[0];

    async function finishedCheck(label: string) {
      const visitor = browser();
      const email = uniqueEmail(label);
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `Shop ${label}` } });
      const id = (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0].id as number;
      return { token, email, id };
    }
    /** The Business Review paid (F3): its link sent, which opens the engagement, then its first half recorded as Finance would. */
    async function payAssessment(businessCheckId: number) {
      const { feeLineId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId, item: "current_state" });
      const [fee] = await db.select().from(schema.engagementFeeLines).where(eq(schema.engagementFeeLines.id, feeLineId!));
      return (await superAdmin.call()).engagement.finance.recordPayment({ feeLineId: feeLineId!, amount: fee.amount, receivedOn: lagosDay(), method: "bank_transfer", note: "Transfer for the Business Review" });
    }
    async function acceptInvitation(email: string, businessName: string) {
      const invitation = emails().filter(sent => sent.to === email && sent.subject === "Set up your client account on The Shift").at(-1)!;
      const inviteToken = decodeURIComponent(invitation.body.match(/Create your account: (\S+)/)![1].split("/onboarding/")[1]);
      const owner = browser();
      await (await owner.call()).onboarding.accept({ token: inviteToken, email, fullName: `Owner of ${businessName}`, password: PASSWORD, confirmPassword: PASSWORD, businessName });
      return owner;
    }
    /** A paying client with an account: the check, the payment, the invitation accepted. */
    async function client(label: string) {
      const { email, id } = await finishedCheck(label);
      await payAssessment(id);
      const owner = await acceptInvitation(email, `Business ${label}`);
      const engagement = await engagementOf(id);
      return { owner, email, businessCheckId: id, engagementId: engagement.id as number, businessId: engagement.businessId as number };
    }
    /** A client whose Business Review was paid on its payment request before F3: the data the platform still holds. */
    async function legacyClient(label: string) {
      const { email, id } = await finishedCheck(label);
      const request = await legacyBusinessReviewRequest(db, { businessCheckId: id, requestedByUserId: null });
      await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id });
      const owner = await acceptInvitation(email, `Business ${label}`);
      const engagement = await engagementOf(id);
      return { owner, email, businessCheckId: id, engagementId: engagement.id as number, businessId: engagement.businessId as number };
    }
    /** One of the owner's staff, added directly (the seat invitation is a later step). */
    async function member(businessId: number, access: "full" | "contributor" | null) {
      const user = await person([], "Staff Member");
      const [membership] = await db.insert(schema.businessMemberships).values({ businessId, userId: user.id, role: "member", status: "active" }).returning();
      if (access) await db.insert(schema.businessMemberAccess).values({ membershipId: membership.id, access });
      return { user, browser: await signIn(user) };
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = await signIn(owner, true);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("a database behind this build (live, 10 November 2026)", () => {
      // The live database lacked 0022: the list read its write-off column and said "migration 0008 is not applied".
      it.skipIf(target.name !== "PGlite")("names the migration the database lacks, and lists again once it is applied", async () => {
        const { id } = await finishedCheck("behind");
        await payAssessment(id);
        await harness.query(sql`create schema if not exists drizzle`);
        await harness.query(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
        await harness.query(sql`insert into drizzle.__drizzle_migrations (hash, created_at) select 'recorded-' || n, n from generate_series(1, 22) as n`);
        await harness.query(sql`alter table engagement_fee_lines rename column "writtenOffAt" to "writtenOffAtNotYet"`);
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
        try {
          expect(await (await superAdmin.call()).engagement.staff.list()).toEqual({ setUp: false, items: [], missing: "0022" });
          expect(logged).toHaveBeenCalledWith(expect.stringContaining("writtenOffAt"));
          expect(await checkDatabase(db)).toMatchObject({ ok: false, code: "MIGRATION_MISSING", migrations: { applied: 22, missing: "0022" } });
        } finally {
          logged.mockRestore();
          await harness.query(sql`alter table engagement_fee_lines rename column "writtenOffAtNotYet" to "writtenOffAt"`);
          await harness.query(sql`drop schema drizzle cascade`);
        }
        const listed = await (await superAdmin.call()).engagement.staff.list();
        expect(listed.setUp).toBe(true);
        expect(listed.items.some(item => item.businessName === "Shop behind")).toBe(true);
      });
    });

    describe("starting an engagement", () => {
      it("opens the engagement when the Business Review's link is sent, and loads the data requests and both calls from the template when it is paid (F3)", async () => {
        const { id, email } = await finishedCheck("start");
        const { feeLineId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        const waiting = await engagementOf(id);
        expect(waiting).toMatchObject({ stage: "setting_up", businessId: null, type: "business_review", opensOnPayment: true, paymentRequestId: null, contactEmail: email });
        // Nothing is due from the client before they pay, so the plan waits for the payment.
        expect(await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, waiting.id))).toEqual([]);
        expect(await db.select().from(schema.engagementSessions).where(eq(schema.engagementSessions.engagementId, waiting.id))).toEqual([]);
        expect(await (await superAdmin.call()).engagement.finance.recordPayment({ feeLineId: feeLineId!, amount: 300_000, receivedOn: lagosDay(), method: "bank_transfer", note: "Transfer for the Business Review" })).toMatchObject({ opened: true });

        const engagement = await engagementOf(id);
        expect(engagement).toMatchObject({ id: waiting.id, stage: "setting_up", businessId: null, opensOnPayment: false });
        const tasks = await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, engagement.id));
        expect(tasks.map((task: { title: string }) => task.title)).toEqual([...ASSESSMENT_TEMPLATE.dataRequests, ...ASSESSMENT_TEMPLATE.teamActions].map(item => item.title));
        // The Work Plan: week 1 due in three working days, week 2 in eight; the team's actions sit beside the client's requests.
        expect(new Set(tasks.map((task: { kind: string; side: string; status: string; dueOn: string }) => `${task.kind}/${task.side}/${task.status}/${task.dueOn}`))).toEqual(new Set([`data_request/client/open/${addWorkingDays(new Date(), 3)}`, `data_request/client/open/${addWorkingDays(new Date(), 8)}`, `action/ipf/open/${addWorkingDays(new Date(), 3)}`, `action/ipf/open/${addWorkingDays(new Date(), 8)}`]));
        const sessions = await db.select().from(schema.engagementSessions).where(eq(schema.engagementSessions.engagementId, engagement.id));
        expect(sessions.map((item: { title: string; scheduledFor: Date | null }) => [item.title, item.scheduledFor])).toEqual([["Business Review Session 1", null], ["Business Review Session 2", null]]);
        // Each call carries its agenda from the template, so the client sees what the call is for before it is booked.
        expect(sessions.map((item: { agenda: string | null }) => item.agenda)).toEqual(ASSESSMENT_TEMPLATE.sessions.map(item => item.agenda));
      });

      it("joins the owner's business when they create their account", async () => {
        const { email, id } = await finishedCheck("link");
        await payAssessment(id);
        await acceptInvitation(email, "Linked Foods");
        const engagement = await engagementOf(id);
        const business = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, engagement.businessId)))[0];
        expect(business.name).toBe("Linked Foods");
      });

      it("links at once when the owner was invited by hand and has an account before paying", async () => {
        const { email, id } = await finishedCheck("early");
        await (await superAdmin.call()).onboarding.invite({ businessCheckId: id, overrideReason: "Invited early by agreement" });
        await acceptInvitation(email, "Early Bird Ltd");
        await payAssessment(id);
        const engagement = await engagementOf(id);
        expect(engagement.businessId).not.toBeNull();
      });

      it("starts nothing for the full report, and never a second engagement", async () => {
        const { id } = await finishedCheck("once");
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "full_report" });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: paymentRequestId! });
        expect(await engagementOf(id)).toBeUndefined();
        await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        await payAssessment(id);
        await expect((await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" })).rejects.toMatchObject({ code: "CONFLICT", message: "This has already been paid." });
        expect(await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, id))).toHaveLength(1);
      });

      it("lists a paid assessment that has no engagement (paid before migration 0008), and lets the desk lead start it", async () => {
        const { email, id } = await finishedCheck("catch-up");
        const request = await legacyBusinessReviewRequest(db, { businessCheckId: id, requestedByUserId: null });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id });
        await acceptInvitation(email, "Catch Up Ltd");
        // As if the payment had been confirmed while the engagement tables were missing.
        await db.delete(schema.engagements).where(eq(schema.engagements.businessCheckId, id));
        const deskLead = await signIn(await person(["desk_lead"]), true);
        const analyst = await signIn(await person(["analyst"]), true);

        expect((await (await deskLead.call()).engagement.staff.awaitingStart()).map(item => item.businessCheckId)).toContain(id);
        expect(await (await analyst.call()).engagement.staff.awaitingStart()).toEqual([]);
        await expect((await analyst.call()).engagement.staff.start({ businessCheckId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const started = await (await deskLead.call()).engagement.staff.start({ businessCheckId: id });
        expect(started.created).toBe(true);
        const engagement = await engagementOf(id);
        expect(engagement.businessId).not.toBeNull();
        expect(await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, engagement.id))).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);
        expect((await (await deskLead.call()).engagement.staff.awaitingStart()).map(item => item.businessCheckId)).not.toContain(id);
        expect(await (await deskLead.call()).engagement.staff.start({ businessCheckId: id })).toMatchObject({ engagementId: engagement.id, created: false });
      });

      it("refuses to start an engagement for an assessment that is not paid", async () => {
        const { id } = await finishedCheck("unpaid");
        await expect((await superAdmin.call()).engagement.staff.start({ businessCheckId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("works out three working days in Lagos, skipping the weekend", () => {
        expect(addWorkingDays(new Date("2026-10-09T10:00:00Z"), 3)).toBe("2026-10-14"); // Friday to Wednesday
        expect(addWorkingDays(new Date("2026-10-12T23:30:00Z"), 3)).toBe("2026-10-16"); // already Tuesday in Lagos
      });
    });

    describe("paying a service in halves (R36, ET 10 November 2026)", () => {
      const lagosDayPlus = (days: number) => {
        const date = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date())}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
      };

      it("asks the Business Review's first half, starts it with the second, and dates the second seven days after the Findings are shared, emailing its link once", async () => {
        const { email, businessCheckId, engagementId } = await client("halves");
        // Since F3 there is no payment request: both halves are fees from the day the link went, the first now paid.
        expect(await db.select().from(schema.paymentRequests).where(and(eq(schema.paymentRequests.businessCheckId, businessCheckId), eq(schema.paymentRequests.item, "current_state")))).toEqual([]);
        const desk = await superAdmin.call();
        expect((await desk.engagement.staff.fees({ engagementId })).feeLines).toMatchObject([{ label: "Business Review: half to start", amount: 300_000, paidAt: expect.any(Date) }, { label: "Business Review: half on delivery", amount: 300_000, dueOn: null }]);
        // The team is told before a share that bills.
        expect((await desk.engagement.staff.detail({ engagementId })).balanceOnDelivery).toBe(true);

        // A Prescription is not the Business Review's delivery; its Findings are.
        const { deliverableId: prescription } = await desk.engagement.staff.saveDeliverable({ engagementId, kind: "prescription", title: "What to do", summary: "Price first." });
        await desk.engagement.staff.approveDeliverable({ deliverableId: prescription });
        expect(await desk.engagement.staff.shareDeliverable({ deliverableId: prescription, audience: "owner" })).toMatchObject({ balancesDated: 0 });
        expect((await desk.engagement.staff.fees({ engagementId })).feeLines).toMatchObject([{ label: "Business Review: half to start" }, { dueOn: null }]);
        mocked.deliverEmail.mockClear();
        const { deliverableId: findings } = await desk.engagement.staff.saveDeliverable({ engagementId, kind: "findings", title: "What we found", summary: "Cash leaks at the till." });
        expect(await desk.engagement.staff.shareDeliverable({ deliverableId: findings, audience: "owner" })).toMatchObject({ balancesDated: 1 });
        const dueOn = lagosDayPlus(7);
        expect((await desk.engagement.staff.fees({ engagementId })).feeLines).toMatchObject([{ label: "Business Review: half to start" }, { label: "Business Review: half on delivery", dueOn }]);
        expect((await desk.engagement.staff.detail({ engagementId })).balanceOnDelivery).toBe(false);
        const notice = emails().find(sent => sent.to === email && sent.subject.includes("Business Review: half on delivery: ₦300,000 due by"))!;
        expect(notice.body).toContain("We have shared your Findings for your Business Review in your room.");
        expect(notice.body).toContain("The second half, ₦300,000, is due by");
        const dated = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_fees_dated_on_delivery"));
        expect(dated.map((row: { details: string }) => JSON.parse(row.details).engagementId)).toContain(engagementId);

        // Sharing again dates nothing and sends nothing.
        mocked.deliverEmail.mockClear();
        expect(await desk.engagement.staff.shareDeliverable({ deliverableId: findings, audience: "business" })).toMatchObject({ balancesDated: 0 });
        expect(emails().filter(sent => sent.subject.includes("due by"))).toEqual([]);
      });

      it("adds no second half for a Business Review paid in full before the change", async () => {
        const { id } = await finishedCheck("paid-in-full");
        const request = await legacyBusinessReviewRequest(db, { businessCheckId: id, requestedByUserId: null, amountNaira: 600_000 });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id });
        const engagement = await engagementOf(id);
        expect(await db.select().from(schema.engagementFeeLines).where(eq(schema.engagementFeeLines.engagementId, engagement.id))).toEqual([]);
      });

      it("keeps the second half to what the first half was when a token test price is restored before the payment confirms", async () => {
        const { id } = await finishedCheck("token-price");
        // A request sent before F3 at a token test price of ₦100: its first half was ₦50.
        const request = await legacyBusinessReviewRequest(db, { businessCheckId: id, requestedByUserId: null, amountNaira: 50 });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id });
        const engagement = await engagementOf(id);
        expect((await db.select().from(schema.engagementFeeLines).where(eq(schema.engagementFeeLines.engagementId, engagement.id))).map((line: { label: string; amount: number }) => [line.label, line.amount]))
          .toEqual([["Business Review: half on delivery", 50]]);
      });

      it("opens a service agreed on a call with its two halves, the first dated the start day, and dates the second on delivery", async () => {
        const desk = await superAdmin.call();
        const opened = await desk.engagement.staff.createDirect({ type: "done_for_you", service: "business_plan", businessName: "Plan Studio", contactName: "Pat Plan", contactEmail: uniqueEmail("plan-studio"), startedOn: "2026-11-16" });
        expect((await desk.engagement.staff.fees({ engagementId: opened.engagementId })).feeLines.map(line => [line.label, line.amount, line.dueOn])).toEqual([
          ["Business Plan: half to start", 375_000, "2026-11-16"],
          ["Business Plan: half on delivery", 375_000, null],
        ]);
        const { deliverableId } = await desk.engagement.staff.saveDeliverable({ engagementId: opened.engagementId, kind: "other", title: "Your Business Plan", summary: "The plan." });
        expect(await desk.engagement.staff.shareDeliverable({ deliverableId, audience: "owner" })).toMatchObject({ balancesDated: 1 });
        expect((await desk.engagement.staff.fees({ engagementId: opened.engagementId })).feeLines.map(line => line.dueOn)).toEqual(["2026-11-16", lagosDayPlus(7)]);
      });

      it("dates Digital marketing's three months from the kickoff, and no shared piece moves them", async () => {
        const desk = await superAdmin.call();
        const opened = await desk.engagement.staff.createDirect({ type: "digital_marketing", businessName: "Month Studio", contactName: "Mo Month", contactEmail: uniqueEmail("month-studio"), startedOn: "2026-11-02" });
        expect((await desk.engagement.staff.fees({ engagementId: opened.engagementId })).feeLines.map(line => line.dueOn)).toEqual(["2026-11-02", "2026-12-02", "2027-01-01"]);
        const { deliverableId } = await desk.engagement.staff.saveDeliverable({ engagementId: opened.engagementId, kind: "tools", title: "Content calendar", summary: "Month 1." });
        expect(await desk.engagement.staff.shareDeliverable({ deliverableId, audience: "owner" })).toMatchObject({ balancesDated: 0 });
      });
    });

    describe("fees (there are no proposals)", () => {
      it("starts a Business Review paid before F3 with its second half, saves the schedule, records payments, and shows the client nothing to sign", async () => {
        const { owner, email: ownerEmail, engagementId } = await legacyClient("fees");
        const desk = await superAdmin.call();
        // A Business Review paid its first half on the check's request (R36): it starts with the second half as a fee,
        // dated when the Findings are shared, and the room lists both halves.
        const fresh = await desk.engagement.staff.fees({ engagementId });
        expect(fresh).toMatchObject({ feeLines: [{ label: "Business Review: half on delivery", amount: 300000, dueOn: null, paidAt: null }], suggested: null, can: { edit: true } });
        expect((await (await owner.call()).engagement.client.room())!.fees.map(fee => [fee.label, fee.amount, fee.paid])).toEqual([["Business Review: half to start", 300000, true], ["Business Review: half on delivery", 300000, false]]);
        await expect(desk.engagement.staff.saveFees({ engagementId, feeLines: [{ label: " ", amount: 1000, dueOn: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        mocked.deliverEmail.mockClear();
        await expect(desk.engagement.staff.saveFees({ engagementId, feeLines: [{ label: "To start", amount: 300000, dueOn: "2026-11-10" }, { label: "With the Findings", amount: 300000, dueOn: null }] })).resolves.toEqual({ success: true, notified: true });
        // The owner is told the schedule as it now stands (R47); saving it again unchanged tells nobody.
        const notice = emails().find(sent => sent.subject === "Your fees have changed: Business Review")!;
        expect(notice.to).toBe(ownerEmail);
        expect(notice.body).toContain("• To start: ₦300,000, due Tue 10 Nov 2026");
        expect(notice.body).toContain("Total: ₦600,000");
        expect(notice.body).toContain("/dashboard#payments");
        mocked.deliverEmail.mockClear();
        await expect(desk.engagement.staff.saveFees({ engagementId, feeLines: [{ label: "To start ", amount: 300000, dueOn: "2026-11-10" }, { label: "With the Findings", amount: 300000, dueOn: null }] })).resolves.toEqual({ success: true, notified: false });
        expect(emails()).toEqual([]);
        const saved = await desk.engagement.staff.fees({ engagementId });
        expect(saved).toMatchObject({ total: 600000, suggested: null, feeLines: [{ label: "To start", paidAt: null }, { label: "With the Findings" }] });

        // Only Finance and the Super Admin record money (ET, 10 November 2026): an analyst on the team cannot. A payment
        // Finance records survives a later change to another line, because saving keeps each fee's id.
        const analystUser = await person(["analyst"]);
        await desk.engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        const analyst = await signIn(analystUser, true);
        const payment = { feeLineId: saved.feeLines[0]!.id, amount: 300000, receivedOn: lagosDay(), method: "bank_transfer" as const, note: "Transfer 4471" };
        await expect((await analyst.call()).engagement.finance.recordPayment(payment)).rejects.toMatchObject({ code: "FORBIDDEN" });
        const finance = await signIn(await person(["finance"]), true);
        await expect((await finance.call()).engagement.finance.recordPayment(payment)).resolves.toMatchObject({ success: true, left: 0, receipt: expect.stringMatching(/^TS-RC-\d{6}$/) });
        await desk.engagement.staff.saveFees({ engagementId, feeLines: [{ id: saved.feeLines[0]!.id, label: "To start", amount: 300000, dueOn: "2026-11-10" }, { id: saved.feeLines[1]!.id, label: "With the Findings", amount: 350000, dueOn: null }] });
        const changed = await desk.engagement.staff.fees({ engagementId });
        expect(changed.feeLines.map(line => [line.id, line.label, line.amount, line.paidAt !== null])).toEqual([[saved.feeLines[0]!.id, "To start", 300000, true], [saved.feeLines[1]!.id, "With the Findings", 350000, false]]);
        // A paid fee has been billed: it cannot be removed, and it cannot be made less than what is paid on it.
        await expect(desk.engagement.staff.saveFees({ engagementId, feeLines: [{ id: saved.feeLines[1]!.id, label: "With the Findings", amount: 350000, dueOn: null }] })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(desk.engagement.staff.saveFees({ engagementId, feeLines: [{ id: saved.feeLines[0]!.id, label: "To start", amount: 200000, dueOn: "2026-11-10" }, { id: saved.feeLines[1]!.id, label: "With the Findings", amount: 350000, dueOn: null }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

        // The client sees the fees on the room's Payments tab, with the paid one marked, and has nothing to sign; the
        // team's fee screen stays the team's.
        const ownerRoom = (await (await owner.call()).engagement.client.room())!;
        expect(ownerRoom.fees.map(fee => [fee.label, fee.amount, fee.paid])).toEqual([["To start", 300000, true], ["With the Findings", 350000, false]]);
        expect(ownerRoom.awaitingPayment).toBe(false);
        await expect((await owner.call()).engagement.staff.fees({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // Another engagement's team cannot read them.
        const outsider = await signIn(await person(["analyst"]), true);
        await expect((await outsider.call()).engagement.staff.fees({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("fills in a new Digital marketing engagement's fees at ₦470,000 for each of three months", async () => {
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Fee Studio", contactName: "Funmi Fee", contactEmail: uniqueEmail("fee-studio"), startedOn: "2026-11-09" });
        const fees = await (await superAdmin.call()).engagement.staff.fees({ engagementId: opened.engagementId });
        expect(fees).toMatchObject({ total: 1410000, suggested: null });
        expect(fees.feeLines.map(line => [line.label, line.amount])).toEqual([["Month 1 service fee, payable on starting", 470000], ["Month 2 service fee, payable before day 31", 470000], ["Month 3 service fee, payable before day 61", 470000]]);
      });
    });

    describe("WhatsApp for the team (R44, migration 0021)", () => {
      it("shows a team member's number to their clients only once they agree, never to another client, and logs no number", async () => {
        const a = await client("wa-a");
        const b = await client("wa-b");
        const desk = await superAdmin.call();
        const femiUser = await person(["analyst"], "Femi Adebayo");
        await desk.engagement.staff.assign({ engagementId: a.engagementId, userId: femiUser.id, role: "analyst" });
        const femi = await signIn(femiUser, true);
        await expect((await a.owner.call()).account.setWhatsapp({ whatsapp: "+2348031234567", agree: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await (await a.owner.call()).account.whatsapp()).toMatchObject({ staff: false });
        await expect((await femi.call()).account.setWhatsapp({ whatsapp: "0803", agree: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });

        // Saved without agreeing: not shown to the client.
        await (await femi.call()).account.setWhatsapp({ whatsapp: "+234 803 123 4567", agree: false });
        expect(await (await femi.call()).account.whatsapp()).toMatchObject({ staff: true, whatsapp: "+2348031234567", agreedAt: null });
        const femiIn = async (owner: typeof a.owner) => (await (await owner.call()).engagement.client.room())!.team.find(member => member.name === "Femi Adebayo");
        expect((await femiIn(a.owner))!.whatsapp).toBeNull();

        // Agreed: shown to this client only.
        await (await femi.call()).account.setWhatsapp({ whatsapp: "+2348031234567", agree: true });
        expect((await femiIn(a.owner))!.whatsapp).toBe("+2348031234567");
        expect(JSON.stringify(await (await b.owner.call()).engagement.client.room())).not.toContain("2348031234567");

        // A manager correcting it puts it back to waiting for Femi's own agreement.
        await desk.people.setWhatsapp({ userId: femiUser.id, whatsapp: "+2348099999999" });
        expect((await femiIn(a.owner))!.whatsapp).toBeNull();
        expect((await desk.people.list()).find(row => row.id === femiUser.id)).toMatchObject({ whatsapp: "+2348099999999", whatsappAgreedAt: null });

        const events = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "staff_whatsapp_set"));
        expect(events.length).toBeGreaterThanOrEqual(3);
        for (const event of events) expect(event.details).not.toMatch(/\d{7,}/);
      });

      it("sends a client item on WhatsApp to the team member who asked for it, or else the engagement's main contact", async () => {
        const a = await client("wa-items");
        const desk = await superAdmin.call();
        const leadUser = await person(["desk_lead"], "Tola Lead");
        const analystUser = await person(["analyst"], "Ngozi Analyst");
        await desk.engagement.staff.assign({ engagementId: a.engagementId, userId: leadUser.id, role: "lead" });
        await desk.engagement.staff.assign({ engagementId: a.engagementId, userId: analystUser.id, role: "analyst" });
        const lead = await signIn(leadUser, true);
        const analyst = await signIn(analystUser, true);
        await (await lead.call()).account.setWhatsapp({ whatsapp: "+2348030000001", agree: true });
        await (await analyst.call()).account.setWhatsapp({ whatsapp: "+2348030000002", agree: true });
        await (await analyst.call()).engagement.staff.saveTask({ engagementId: a.engagementId, kind: "data_request", side: "client", title: "Your shop's opening hours", detail: null, assigneeUserId: null, dueOn: null, status: "open", statusNote: null, sessionId: null, weekNumber: 1, sortOrder: 99, factor: null });
        const tasks = (await (await a.owner.call()).engagement.client.room())!.tasks;
        expect(tasks.find(task => task.title === "Your shop's opening hours")!.sendTo).toEqual({ name: "Ngozi Analyst", whatsapp: "+2348030000002" });
        // An item from the standard Work Plan (asked by nobody in particular) goes to the lead.
        expect(tasks.find(task => task.side === "client" && task.title !== "Your shop's opening hours")!.sendTo).toEqual({ name: "Tola Lead", whatsapp: "+2348030000001" });
      });
    });

    describe("the Digital marketing roles (R45, migration 0021)", () => {
      it("puts a Digital Marketer and a Content Producer on a Digital marketing engagement, and on no other kind", async () => {
        const desk = await superAdmin.call();
        const opened = await desk.engagement.staff.createDirect({ type: "digital_marketing", businessName: "Reel Studio", contactName: "Remi Reel", contactEmail: uniqueEmail("reel-studio"), startedOn: "2026-11-09" });
        const marketer = await person(["analyst"], "Dami Marketer");
        const producer = await person(["subject_matter_expert"], "Kunle Producer");
        await desk.engagement.staff.assign({ engagementId: opened.engagementId, userId: marketer.id, role: "digital_marketer" });
        await desk.engagement.staff.assign({ engagementId: opened.engagementId, userId: producer.id, role: "content_producer" });
        const team = (await desk.engagement.staff.detail({ engagementId: opened.engagementId })).team;
        expect(team.map(member => [member.name, member.roleLabel])).toEqual(expect.arrayContaining([["Dami Marketer", "Digital Marketer"], ["Kunle Producer", "Content Producer"]]));

        const { engagementId } = await client("not-marketing");
        await expect(desk.engagement.staff.assign({ engagementId, userId: marketer.id, role: "digital_marketer" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "The Digital Marketer and Content Producer roles are for Digital Marketing engagements." });
      });
    });

    describe("loading a Data Request in one step", () => {
      it("adds every item after the existing ones, dates them by priority, skips what is already there, and is the team's alone", async () => {
        const { owner, engagementId } = await client("load-data-request");
        const desk = await superAdmin.call();
        const before = (await desk.engagement.staff.detail({ engagementId })).tasks.length;
        const items = [
          { section: "1 Sales", ref: "1.1", title: "Sales by month", detail: "Last 12 months.", informs: "How the business is doing", format: "Excel", priority: "high" as const, dueOn: null },
          { section: "1 Sales", ref: "1.2", title: "Top customers", detail: null, informs: null, format: null, priority: null, dueOn: "2026-12-01" },
          { section: "2 Costs", ref: "2.1", title: "What you spend each month", detail: null, informs: null, format: null, priority: "low" as const, dueOn: null },
        ];
        // "What you spend each month" is already on a Business Review, so it is skipped.
        expect(await desk.engagement.staff.loadDataRequest({ engagementId, items })).toEqual({ added: 2, skipped: 1 });
        const tasks = (await desk.engagement.staff.detail({ engagementId })).tasks;
        expect(tasks.length).toBe(before + 2);
        const sales = tasks.find(task => task.title === "Sales by month")!;
        expect(sales).toMatchObject({ kind: "data_request", side: "client", status: "open", section: "1 Sales", ref: "1.1", priority: "high", informs: "How the business is doing", format: "Excel" });
        expect(sales.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(tasks.find(task => task.title === "Top customers")!.dueOn).toBe("2026-12-01");
        // Loading again adds nothing.
        expect(await desk.engagement.staff.loadDataRequest({ engagementId, items })).toEqual({ added: 0, skipped: 3 });
        // The client sees the new items in their Data Request; a client cannot load anything.
        expect((await (await owner.call()).engagement.client.room())!.tasks.some(task => task.title === "Sales by month")).toBe(true);
        await expect((await owner.call()).engagement.staff.loadDataRequest({ engagementId, items })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("Finance: money across every client", () => {
      it("lists payment requests and engagement fees, counts a fee as owed once set and late once its date passes, and is for finance only", async () => {
        const { engagementId } = await legacyClient("finance");
        const desk = await superAdmin.call();
        await desk.engagement.staff.saveFees({ engagementId, feeLines: [{ label: "To start", amount: 300000, dueOn: "2026-01-05" }, { label: "With the Findings", amount: 300000, dueOn: null }] });
        const finance = await desk.engagement.finance.list();
        // The Business Review was paid through a payment request when the client was set up (before F3).
        expect(finance.requests.some(row => row.title === "Business Review" && row.paid)).toBe(true);
        const mine = finance.fees.filter(row => row.engagementId === engagementId);
        expect(mine.map(row => [row.label, row.paid, row.late, row.engagement])).toEqual([["To start", false, true, "Business Review"], ["With the Findings", false, false, "Business Review"]]);
        expect(finance.totals.owed).toBeGreaterThanOrEqual(600000);
        expect(finance.totals.late).toBeGreaterThanOrEqual(300000);
        // Finance sees it, and so do the desk (Senior Associate, Vice President) and partners; an analyst does not.
        for (const roles of [["finance"], ["desk_lead"], ["partner"], ["desk_lead", "partner"]] as const) {
          const viewer = await signIn(await person([...roles]), true);
          expect((await (await viewer.call()).engagement.finance.list()).fees.some(row => row.engagementId === engagementId), roles.join("+")).toBe(true);
        }
        const analyst = await signIn(await person(["analyst"]), true);
        await expect((await analyst.call()).engagement.finance.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("one client, many projects, and the next problem", () => {
      it("adds a Pitch Deck for an existing client: no new invitation, its Data Request from the service, both projects in the room", async () => {
        const { owner, engagementId: review, businessId } = await client("two-projects");
        mocked.deliverEmail.mockClear();
        // A service type needs its service; the Business Review's own type does not take one.
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", startedOn: "2026-11-09", businessId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", service: "six_week_fix", startedOn: "2026-11-09", businessId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const deck = await (await superAdmin.call()).engagement.staff.createDirect({ type: "done_for_you", service: "pitch_deck", startedOn: "2026-11-09", businessId });
        expect(deck).toMatchObject({ hasAccount: true, invitationUrl: null });
        expect(emails()).toEqual([]);
        expect((await (await superAdmin.call()).engagement.staff.clientBusinesses()).map(item => item.id)).toContain(businessId);

        // The room opens on the newest open project, lists both, and opens either by id.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ engagementId: deck.engagementId, type: "done_for_you", service: "pitch_deck", title: "Pitch Deck", serviceStep: 1 });
        expect(room.projects.map(item => [item.title, item.current])).toEqual([["Pitch Deck", true], ["Business Review", false]]);
        expect(room.tasks.filter(task => task.kind === "data_request").map(task => task.title)).toEqual(["Sales records", "Your main costs", "Any plan, deck or notes", "What do you want this work to help you decide or do?", "Who will you present to, and what do you want them to do?", "What are you asking for, and what will you do with it?"]);
        expect(room.sessions.map(item => item.title)).toEqual(["Kick-off", "Handover"]);
        // A later project still shows what the Business Health Check found.
        expect(room.check).not.toBeNull();
        const back = (await (await owner.call()).engagement.client.room({ engagementId: review }))!;
        expect(back).toMatchObject({ engagementId: review, type: "business_review", serviceStep: null });

        // The desk's list names the service; the stage is open or closed.
        const listed = (await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === deck.engagementId)!;
        expect(listed).toMatchObject({ typeLabel: "Pitch Deck", stageLabel: "Open" });

        // Another business's project is never reachable by changing the id, for the room or the drop box.
        const other = await client("two-projects-other");
        await expect((await other.owner.call()).engagement.client.room({ engagementId: deck.engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("takes a client's request for another service to the desk, who open it from the request; others cannot see or handle it", async () => {
        const { owner, engagementId, businessId } = await client("next-problem");
        mocked.deliverEmail.mockClear();
        const asked = await (await owner.call()).engagement.client.requestService({ service: "pitch_deck", note: "Meeting an investor in December.", engagementId });
        expect(asked).toMatchObject({ success: true, already: false });
        expect(emails()).toEqual([expect.objectContaining({ to: "info@ipfactory.co", subject: expect.stringContaining("asked for the Pitch Deck") })]);
        // Asking twice keeps one request.
        expect(await (await owner.call()).engagement.client.requestService({ service: "pitch_deck", note: null })).toMatchObject({ already: true });
        await expect((await owner.call()).engagement.client.requestService({ service: "not_a_service", note: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect((await (await owner.call()).engagement.client.room())!.requests.map(item => item.serviceName)).toEqual(["Pitch Deck"]);

        const requests = await (await superAdmin.call()).engagement.staff.serviceRequests();
        const request = requests.find(item => item.businessId === businessId)!;
        expect(request).toMatchObject({ service: "pitch_deck", serviceName: "Pitch Deck", type: "done_for_you", note: "Meeting an investor in December." });

        // An analyst sees no requests and cannot handle one.
        const analyst = await signIn(await person(["analyst"]), true);
        expect(await (await analyst.call()).engagement.staff.serviceRequests()).toEqual([]);
        await expect((await analyst.call()).engagement.staff.handleRequest({ requestId: request.id, status: "done" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        await (await superAdmin.call()).engagement.staff.createDirect({ type: request.type, service: request.service, startedOn: "2026-11-09", businessId });
        expect(await (await superAdmin.call()).engagement.staff.handleRequest({ requestId: request.id, status: "done" })).toEqual({ success: true });
        expect((await (await superAdmin.call()).engagement.staff.serviceRequests()).some(item => item.id === request.id)).toBe(false);
        expect((await (await owner.call()).engagement.client.room())!.requests).toEqual([]);
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "service_requested"));
        expect(audits.length).toBeGreaterThan(0);
      });
    });

    describe("the pause, seven days after a missed fee date (D6, E5)", () => {
      it("shows the client and the team Late, then Paused; paying the fee, or a new date, lifts it", async () => {
        const today = lagosDay();
        const email = uniqueEmail("late-studio");
        const { engagementId, invitationUrl } = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Late Studio", contactName: "Lara Late", contactEmail: email, startedOn: addDays(today, -10) });
        const owner = browser();
        await (await owner.call()).invitations.accept({ token: decodeURIComponent(invitationUrl!.split("/join/")[1]), email, fullName: "Lara Late", password: PASSWORD, confirmPassword: PASSWORD });
        // Waiting for its first payment, the room shows the fee to pay, not a pause.
        expect((await (await owner.call()).engagement.client.room())!).toMatchObject({ awaitingPayment: true, hold: null });
        const desk = await superAdmin.call();
        await desk.engagement.staff.openRoomNow({ engagementId });

        // Month 1 was due ten days ago: work is paused, and the room says what to pay, with its link.
        let room = (await (await owner.call()).engagement.client.room())!;
        expect(room.hold).toMatchObject({ state: "paused", dueOn: addDays(today, -10), pausesOn: addDays(today, -3), label: "Month 1 service fee, payable on starting", amount: 470_000 });
        expect((await desk.engagement.staff.list()).items.find(item => item.id === engagementId)!.hold).toEqual({ state: "paused", pausesOn: addDays(today, -3) });
        expect((await desk.engagement.staff.detail({ engagementId })).hold).toMatchObject({ state: "paused", dueOn: addDays(today, -10) });

        // Part of it paid by hand: still paused, and the room asks for what is left. Paying the rest lifts the pause at once.
        const lines = (await desk.engagement.staff.fees({ engagementId })).feeLines;
        await desk.engagement.finance.recordPayment({ feeLineId: lines[0]!.id, amount: 200_000, receivedOn: today, method: "bank_transfer", note: "Transfer 1" });
        expect((await (await owner.call()).engagement.client.room())!.hold).toMatchObject({ state: "paused", amount: 270_000 });
        await desk.engagement.finance.recordPayment({ feeLineId: lines[0]!.id, amount: 270_000, receivedOn: today, method: "cash", note: "Cash at the office" });
        room = (await (await owner.call()).engagement.client.room())!;
        expect(room.hold).toBeNull();

        // Month 2 three days late: Late, pausing four days on; a new date gives more time and lifts it.
        const draft = (month2: string) => lines.map((line: { id: number; label: string; amount: number; dueOn: string | null }, index: number) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: index === 1 ? month2 : line.dueOn }));
        await desk.engagement.staff.saveFees({ engagementId, feeLines: draft(addDays(today, -3)) });
        expect((await (await owner.call()).engagement.client.room())!.hold).toMatchObject({ state: "late", pausesOn: addDays(today, 4), label: "Month 2 service fee, payable before day 31" });
        expect((await desk.engagement.staff.list()).items.find(item => item.id === engagementId)!.hold).toEqual({ state: "late", pausesOn: addDays(today, 4) });
        await desk.engagement.staff.saveFees({ engagementId, feeLines: draft(addDays(today, 5)) });
        expect((await (await owner.call()).engagement.client.room())!.hold).toBeNull();
        expect((await desk.engagement.staff.detail({ engagementId })).hold).toBeNull();
      });
    });

    describe("work before the first payment: Partners and the Super Admin only (ET, 10 November 2026)", () => {
      const schedule = (first: string | null) => [
        { label: "Month 1 service fee, payable on starting", amount: 470_000, dueOn: first },
        { label: "Month 2 service fee, payable before day 31", amount: 470_000, dueOn: "2026-12-16" },
        { label: "Month 3 service fee, payable before day 61", amount: 470_000, dueOn: "2027-01-15" },
      ];

      it("lets only a Partner or the Super Admin open a room before payment, or move the first fee past the start date", async () => {
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Early Studio", contactName: "Efe Early", contactEmail: uniqueEmail("early-studio"), startedOn: "2026-11-16" });
        const engagementId = opened.engagementId;
        // A Senior Associate (the desk-lead bundle) runs engagements but does not decide to work before being paid.
        const associate = await signIn(await person(["desk_lead"]), true);
        await expect((await associate.call()).engagement.staff.openRoomNow({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only a Partner or the Super Admin can open a client's room before the first payment." });
        await expect((await associate.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule("2026-12-16") })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only a Partner or the Super Admin can move the first fee past the start date before it is paid." });
        await expect((await associate.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule(null) })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await (await associate.call()).engagement.staff.fees({ engagementId })).can).toMatchObject({ edit: true, approveUnpaidWork: false });
        // Other changes, with the first fee on the start date, are theirs to make.
        expect(await (await associate.call()).engagement.staff.saveFees({ engagementId, feeLines: [...schedule("2026-11-16").slice(0, 2), { label: "Month 3 service fee, payable before day 61", amount: 450_000, dueOn: "2027-01-15" }] })).toMatchObject({ success: true });

        // A Partner (both bundles) may, and the change is on the record.
        const partner = await signIn(await person(["desk_lead", "partner"]), true);
        expect((await (await partner.call()).engagement.staff.fees({ engagementId })).can).toMatchObject({ approveUnpaidWork: true });
        expect(await (await partner.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule("2026-12-01") })).toMatchObject({ success: true });
        const saved = (await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_fees_saved"))).map((row: { details: string }) => JSON.parse(row.details));
        expect(saved).toContainEqual(expect.objectContaining({ engagementId, firstFeeMovedTo: "2026-12-01", startedOn: "2026-11-16" }));
        // A first fee a Partner moved stays as it is when someone else edits the rest.
        expect(await (await associate.call()).engagement.staff.saveFees({ engagementId, feeLines: [schedule("2026-12-01")[0]!, { label: "Month 2 service fee, payable before day 31", amount: 470_000, dueOn: "2026-12-20" }, schedule("2026-12-01")[2]!] })).toMatchObject({ success: true });
        expect(await (await partner.call()).engagement.staff.openRoomNow({ engagementId })).toMatchObject({ opened: true });
      });

      it("leaves a Business Review paid through the check, or an engagement already paid, to the team", async () => {
        const { engagementId } = await client("paid-first");
        const associate = await signIn(await person(["desk_lead"]), true);
        const fees = (await (await associate.call()).engagement.staff.fees({ engagementId })).feeLines;
        // Its first half is paid on its fee (F3); the second half has no date until delivery.
        expect(await (await associate.call()).engagement.staff.saveFees({ engagementId, feeLines: [...fees.map((line: { id: number; label: string; amount: number; dueOn: string | null }) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn })), { label: "Travel to Abuja", amount: 50_000, dueOn: null }] })).toMatchObject({ success: true });
      });
    });

    describe("Digital Marketing from the menu (R35)", () => {
      it("opens a client's request for Digital Marketing as its own programme, with its three months' fees, not as a Monthly Service", async () => {
        const { owner, businessId } = await client("wants-reels");
        await (await owner.call()).engagement.client.requestService({ service: "digital_marketing", note: "More bookings from Instagram." });
        const request = (await (await superAdmin.call()).engagement.staff.serviceRequests()).find(item => item.businessId === businessId)!;
        expect(request).toMatchObject({ service: "digital_marketing", serviceName: "Digital Marketing", type: "digital_marketing" });

        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: request.type, service: request.service, startedOn: "2026-11-16", businessId });
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId: opened.engagementId });
        expect(detail.engagement).toMatchObject({ type: "digital_marketing", typeLabel: "Digital Marketing" });
        expect((await (await superAdmin.call()).engagement.staff.fees({ engagementId: opened.engagementId })).feeLines.map(line => [line.label, line.amount, line.dueOn])).toEqual([
          ["Month 1 service fee, payable on starting", 470_000, "2026-11-16"],
          ["Month 2 service fee, payable before day 31", 470_000, "2026-12-16"],
          ["Month 3 service fee, payable before day 61", 470_000, "2027-01-15"],
        ]);
        // A Monthly Service engagement cannot be opened for it: it has its own type.
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "monthly_service", service: "digital_marketing", startedOn: "2026-11-16", businessId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });
    });

    describe("engagements opened directly, by type", () => {
      it("opens a Digital marketing engagement: the business, the type's starting content, and the owner's invitation", async () => {
        const email = uniqueEmail("crown");
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Crown Studio", contactName: "Marie Tiogo", contactEmail: email, startedOn: "2026-11-02" });
        expect(opened).toMatchObject({ hasAccount: false, invitationUrl: expect.stringContaining("/join/") });
        const welcome = emails().find(sent => sent.to === email)!;
        expect(welcome.subject).toBe("Your The Shift room for Crown Studio");
        // The welcome says what we will do, when it starts and each fee, before the link (R47).
        expect(welcome.body).toContain("WHAT WE WILL DO\nThree months of content for your business");
        expect(welcome.body).toContain("Starts: Mon 2 Nov 2026");
        expect(welcome.body).toContain("• Month 1 service fee, payable on starting: ₦470,000");
        expect(welcome.body.indexOf("WHAT WE WILL DO")).toBeLessThan(welcome.body.indexOf("Create your account:"));

        const listed = (await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === opened.engagementId)!;
        expect(listed).toMatchObject({ businessName: "Crown Studio", ownerName: "Marie Tiogo", ownerEmail: email, type: "digital_marketing", typeLabel: "Digital Marketing", hasAccount: true });

        // The client accepts and lands in the room as its owner, with the type's starting content.
        const token = decodeURIComponent(emails().filter(sent => sent.to === email).at(-1)!.body.match(/Create your account: (\S+)/)![1].split("/join/")[1]);
        const owner = browser();
        await (await owner.call()).invitations.accept({ token, email, fullName: "Marie Tiogo", password: PASSWORD, confirmPassword: PASSWORD });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ type: "digital_marketing", typeLabel: "Digital Marketing", startedOn: "2026-11-02", businessName: "Crown Studio", viewer: { kind: "owner" }, check: null, insight: null });
        expect(room.tasks.filter(task => task.kind === "data_request").map(task => task.ref)).toEqual(["A1", "A2", "B1", "C1", "C2"]);
        expect(room.tasks.find(task => task.ref === "B1")).toMatchObject({ section: "B Accounts", priority: "high", dueOn: "2026-11-05" });
        expect(room.sessions.map(item => item.title)).toEqual(["Kick-off", "Weekly check-in", "Month 1 review"]);
        expect(room.people).toEqual([expect.objectContaining({ name: "Marie Tiogo", label: "Owner", you: true })]);

        // The team's record has no Business Health Check behind it, and names the contact.
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId: opened.engagementId });
        expect(detail.engagement).toMatchObject({ businessCheckId: null, typeLabel: "Digital Marketing" });
        expect(detail.owner).toMatchObject({ name: "Marie Tiogo", email });
      });

      it("runs the content board: the team plans and sends for approval, the owner approves or asks for changes, others cannot", async () => {
        const email = uniqueEmail("board");
        const { engagementId, invitationUrl } = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Board Studio", contactName: "Bola Board", contactEmail: email, startedOn: "2026-11-02" });
        const owner = browser();
        await (await owner.call()).invitations.accept({ token: decodeURIComponent(invitationUrl!.split("/join/")[1]), email, fullName: "Bola Board", password: PASSWORD, confirmPassword: PASSWORD });
        const admin = await superAdmin.call();
        const { itemId: reel } = await admin.engagement.staff.saveContent({ engagementId, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "planned", dueOn: "2026-11-12", link: null });
        await admin.engagement.staff.saveContent({ engagementId, kind: "post", title: "December offer", month: 1, status: "planned", dueOn: null, link: null });
        // Not waiting for approval yet: the owner cannot approve it.
        await expect((await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        await admin.engagement.staff.saveContent({ engagementId, itemId: reel, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "for_approval", dueOn: "2026-11-12", link: "https://example.com/draft/reel" });

        let room = (await (await owner.call()).engagement.client.room())!;
        expect(room.contentTargets).toEqual([{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }]);
        expect(room.content.map(item => [item.title, item.statusLabel])).toEqual([["Knotless braids, before and after", "For your approval"], ["December offer", "Planned"]]);

        // Changes need a note; then the team sends it again and the owner approves.
        await expect((await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: false, note: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await (await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: false, note: "Shorter intro, please" });
        expect((await admin.engagement.staff.detail({ engagementId })).content.find(item => item.id === reel)).toMatchObject({ status: "changes_requested", clientNote: "Shorter intro, please" });
        await admin.engagement.staff.saveContent({ engagementId, itemId: reel, kind: "reel", title: "Knotless braids, before and after", month: 1, status: "for_approval", dueOn: "2026-11-12", link: "https://example.com/draft/reel-2" });
        expect(await (await owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).toMatchObject({ status: "approved" });
        room = (await (await owner.call()).engagement.client.room())!;
        expect(room.content.find(item => item.id === reel)).toMatchObject({ status: "approved", clientNote: null, approvedAt: expect.any(Date) });

        // Another business never reaches it; a Business Review room has no board.
        const other = await client("board-other");
        await expect((await other.owner.call()).engagement.client.respondToContent({ itemId: reel, approve: true, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const otherRoom = (await (await other.owner.call()).engagement.client.room())!;
        expect(otherRoom).toMatchObject({ content: [], contentTargets: [] });
        // An analyst not on the engagement cannot touch it.
        const analyst = await signIn(await person(["analyst"]), true);
        await expect((await analyst.call()).engagement.staff.saveContent({ engagementId, kind: "story", title: "Nope", month: 1, status: "planned", dueOn: null, link: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("puts an existing client account straight in as owner, refuses a staff email, and is the desk's call only", async () => {
        const { email } = await client("direct-existing");
        const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "business_review", businessName: "Second Venture", contactName: "Existing Owner", contactEmail: email, startedOn: "2026-11-09" });
        expect(opened).toMatchObject({ hasAccount: true, invitationUrl: null });
        const staffUser = await person(["analyst"]);
        await expect((await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Nope", contactName: "Staff", contactEmail: staffUser.email, startedOn: "2026-11-09" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const analyst = await signIn(staffUser, true);
        await expect((await analyst.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: "Nope", contactName: "Someone", contactEmail: uniqueEmail("nope"), startedOn: "2026-11-09" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // A direct Business Review starts with the standard Work Plan.
        const tasks = await db.select().from(schema.engagementTasks).where(eq(schema.engagementTasks.engagementId, opened.engagementId));
        expect(tasks.filter((task: { kind: string }) => task.kind === "data_request").length).toBeGreaterThan(5);
      });
    });

    describe("the team's side: permission and assignment", () => {
      it("shows the desk lead every engagement, an analyst only the ones they are on, and finance none", async () => {
        const { engagementId } = await client("scope");
        const deskLead = await signIn(await person(["desk_lead"]), true);
        const analystUser = await person(["analyst"], "Ola Analyst");
        const analyst = await signIn(analystUser, true);
        const finance = await signIn(await person(["finance"]), true);
        const partner = await signIn(await person(["partner"]), true);
        const expert = await signIn(await person(["subject_matter_expert"]), true);

        expect((await (await deskLead.call()).engagement.staff.list()).items.map(item => item.id)).toContain(engagementId);
        expect((await (await analyst.call()).engagement.staff.list())).toMatchObject({ items: [], canStart: false, seesAll: false });
        expect((await (await deskLead.call()).engagement.staff.list())).toMatchObject({ seesAll: true });
        await expect((await analyst.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await partner.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await expert.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await finance.call()).engagement.staff.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

        await (await deskLead.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        expect((await (await analyst.call()).engagement.staff.list()).items.map(item => item.id)).toEqual([engagementId]);
        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId });
        expect(detail.team).toEqual([expect.objectContaining({ name: "Ola Analyst", role: "analyst", roleLabel: "Analyst" })]);
        expect(detail.can).toEqual({ manage: true, assign: false, review: false, sendSignIn: false, contribute: true, seeInternal: true, seeFees: true });
      });

      it("lets only people with assign_engagements change the team, and only to IP Factory staff", async () => {
        const { engagementId, owner } = await client("assign");
        const analystUser = await person(["analyst"]);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        const analyst = await signIn(analystUser, true);
        await expect((await analyst.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "lead" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const ownerId = (await (await owner.call()).account.me())!.user.id;
        await expect((await superAdmin.call()).engagement.staff.assign({ engagementId, userId: ownerId, role: "expert" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("keeps several people on one engagement, changes a role without replacing anyone, and emails each person", async () => {
        const { engagementId, owner } = await client("team-of-three");
        const lead = await person(["analyst"], "Lena Lead");
        const analyst = await person(["analyst"], "Ade Analyst");
        const specialist = await person(["subject_matter_expert"], "Sola Specialist");
        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: lead.id, role: "lead" })).toEqual({ success: true, added: true, notified: true });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "analyst" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: specialist.id, role: "expert" });
        // Changing a role keeps everyone else, and tells the person.
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "manager" })).toEqual({ success: true, added: false, notified: true });
        const team = (await (await superAdmin.call()).engagement.staff.detail({ engagementId })).team;
        expect(team.map(member => [member.name, member.role])).toEqual([["Lena Lead", "lead"], ["Ade Analyst", "manager"], ["Sola Specialist", "expert"]]);
        const sent = emails();
        expect(sent.map(email => email.to)).toEqual([lead.email, analyst.email, specialist.email, analyst.email]);
        expect(sent[0]).toMatchObject({ subject: expect.stringContaining("as Lead Consultant"), body: expect.stringContaining("/admin") });
        expect(sent[3].subject).toContain("Engagement Manager");
        // The same role again changes nothing and sends nothing.
        expect(await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analyst.id, role: "manager" })).toMatchObject({ added: false, notified: false });
        expect(emails()).toHaveLength(4);
        // Each person sees the engagement under My projects with their own role; the desk's view shows no role for others.
        const leadList = await (await signIn(lead, true)).call().then(api => api.engagement.staff.list());
        expect(leadList.items.find(item => item.id === engagementId)).toMatchObject({ myRole: "Lead Consultant", unsortedFiles: 0 });
        expect((await (await superAdmin.call()).engagement.staff.list()).items.find(item => item.id === engagementId)!.myRole).toBeNull();
        // The client sees the three, in role order, and their own people with what each can see.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.team.map(member => member.roleLabel)).toEqual(["Engagement Manager", "Lead Consultant", "Specialist"]);
        expect(room.people).toEqual([expect.objectContaining({ label: "Owner", you: true })]);
      });

      it("previews the client's room exactly as the owner sees it, for staff in scope only, and logs each preview", async () => {
        const { owner, engagementId } = await client("preview");
        const ownerRoom = await (await owner.call()).engagement.client.room();
        const preview = await (await superAdmin.call()).engagement.staff.previewRoom({ engagementId });
        expect(preview).toEqual(ownerRoom);
        expect(preview.viewer.kind).toBe("owner");
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_room_previewed"));
        expect(audits.map((row: { details: string | null }) => JSON.parse(row.details ?? "{}").engagementId)).toContain(engagementId);
        // An analyst not on the engagement cannot open it, and a client cannot use the team's side.
        const analyst = await signIn(await person(["analyst"]), true);
        await expect((await analyst.call()).engagement.staff.previewRoom({ engagementId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await owner.call()).engagement.staff.previewRoom({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("keeps clients out of the team's side", async () => {
        const { owner, engagementId } = await client("no-staff");
        await expect((await owner.call()).engagement.staff.detail({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });
    });

    describe("the client's side: membership and what was shared", () => {
      it("opens the room warm: the check's main finding and readiness, the Work Plan by week, and the Discovery Call once the team shares it", async () => {
        const { owner, businessCheckId, businessId } = await client("warm");
        const admin = await superAdmin.call();
        const before = (await (await owner.call()).engagement.client.room())!;
        expect(before.check).toMatchObject({ readiness: expect.any(String) });
        expect(before.check!.primaryArea).not.toBeNull();
        expect(before.debrief).toBeNull();
        // The template placed every item in a week, in order, tagged internal or external; the team's two actions sit beside the client's requests.
        expect(before.tasks.filter(task => task.weekNumber === 1).map(task => task.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(before.tasks.filter(task => task.weekNumber === 2)).toHaveLength(5);
        expect(before.tasks.filter(task => task.factor === "external").map(task => task.side).sort()).toEqual(["client", "ipf"]);
        expect(before.sessions.map(session => session.weekNumber)).toEqual([1, 2]);

        expect((await admin.businessSupport.debrief({ businessCheckId })).debrief).toBeNull();
        await expect(admin.businessSupport.shareDebrief({ businessCheckId, shared: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const saved = await admin.businessSupport.saveDebrief({ businessCheckId, heldAt: new Date("2026-10-13T13:00:00Z"), heard: "Two outlets and a van.", problemInOwnerWords: "Cash runs out in week three.", successLooksLike: "Pay salaries on the 25th.", tried: "A bookkeeper, for three months.", nextSteps: "The report, then the assessment." });
        expect(saved).toMatchObject({ shared: false });
        expect((await admin.businessSupport.debrief({ businessCheckId })).debrief).toMatchObject({ heard: "Two outlets and a van.", sharedAt: null });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toBeNull();

        await admin.businessSupport.shareDebrief({ businessCheckId, shared: true });
        const shared = (await (await owner.call()).engagement.client.room())!;
        expect(shared.debrief).toMatchObject({ problemInOwnerWords: "Cash runs out in week three.", successLooksLike: "Pay salaries on the 25th.", sharedAt: expect.any(Date) });
        expect(shared.debrief).not.toHaveProperty("capturedByUserId");
        // Rewriting keeps it shared; a contributor never sees it; taking it back hides it again.
        await admin.businessSupport.saveDebrief({ businessCheckId, heldAt: null, heard: "Two outlets, a kitchen and a van.", problemInOwnerWords: null, successLooksLike: null, tried: null, nextSteps: null });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toMatchObject({ heard: "Two outlets, a kitchen and a van.", problemInOwnerWords: null });
        const contributor = await member(businessId, "contributor");
        expect((await (await contributor.browser.call()).engagement.client.room())!.debrief).toBeNull();
        await admin.businessSupport.shareDebrief({ businessCheckId, shared: false });
        expect((await (await owner.call()).engagement.client.room())!.debrief).toBeNull();
      });

      it("shows the owner their journey, what we need from them and their team, and lets them say they sent something", async () => {
        const { owner, engagementId } = await client("room");
        const lead = await person(["desk_lead"], "Lewis Lead");
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: lead.id, role: "lead" });

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room).toMatchObject({ engagementId, stage: "setting_up", stageLabel: "Getting set up", viewer: { kind: "owner" }, team: [{ name: "Lewis Lead", roleLabel: "Lead Consultant" }] });
        expect(room.journey.map(step => [step.label, step.state])).toEqual([["Getting set up", "current"], ["Business Review", "next"], ["Six-Week Fix", "next"], ["Your Plan", "next"]]);
        expect(room.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);

        const first = room.tasks[0];
        expect(await (await owner.call()).engagement.client.respondToTask({ taskId: first.id, note: "Sent on WhatsApp" })).toMatchObject({ status: "received" });
        await expect((await owner.call()).engagement.client.respondToTask({ taskId: first.id, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        const after = (await (await owner.call()).engagement.client.room())!;
        expect(after.tasks.find(task => task.id === first.id)).toMatchObject({ status: "received", statusLabel: "Sent, we are checking", statusNote: "Sent on WhatsApp" });
      });

      it("never shows one client another client's engagement, whatever id they send", async () => {
        const a = await client("iso-a");
        const b = await client("iso-b");
        const roomB = (await (await b.owner.call()).engagement.client.room())!;
        expect(roomB.engagementId).toBe(b.engagementId);
        const bTask = roomB.tasks[0].id;
        await expect((await a.owner.call()).engagement.client.respondToTask({ taskId: bTask, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(JSON.stringify(await (await a.owner.call()).engagement.client.room())).not.toContain(`Business iso-b`);
      });

      it("keeps notes from the client until shared, and internal notes always", async () => {
        const { owner, engagementId } = await client("notes");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId });
        const sessionId = detail.sessions[0].id;
        await (await superAdmin.call()).engagement.staff.saveNotes({ sessionId, clientNotes: "We agreed to look at pricing first.", internalNotes: "Owner may be under-reporting cash sales." });
        const before = (await (await owner.call()).engagement.client.room())!;
        expect(before.sessions[0].notes).toBeNull();

        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareNotes({ sessionId, audience: "owner" });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.sessions[0]).toMatchObject({ notes: "We agreed to look at pricing first.", notesAudience: "owner" });
        // The owner is told by email: the title and a link, never the notes themselves.
        const notice = emails().find(sent => sent.subject === "Engagement update: Business Review Session 1")!;
        expect(notice.body).toContain("/dashboard");
        expect(notice.body).not.toContain("pricing");
        expect(JSON.stringify(room)).not.toContain("under-reporting");
      });

      it("gives the owner and full-access staff the Founder and Business tabs, from the Business Health Check and then the Full Report; contributors get neither", async () => {
        const { owner, businessCheckId, businessId } = await client("insight");
        const full = await member(businessId, null);
        const contributor = await member(businessId, "contributor");

        const fromCheck = (await (await owner.call()).engagement.client.room())!.insight!;
        expect(fromCheck.source).toBe("Business Health Check");
        expect(fromCheck.founder.sections).toEqual([]);
        expect(fromCheck.areas.length).toBeGreaterThan(0);
        expect(fromCheck.areas.map(area => area.area)).not.toContain("Founder readiness");
        expect((await (await full.browser.call()).engagement.client.room())!.insight).toEqual(fromCheck);
        expect((await (await contributor.browser.call()).engagement.client.room())!.insight).toBeNull();

        // A delivered Full Report replaces the check: the same report the owner was emailed, rebuilt from the stored intake.
        const { paymentRequestId: reportRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId, item: "full_report" });
        const payment = { id: reportRequestId! };
        await db.insert(schema.fullReports).values({ businessCheckId, paymentRequestId: payment.id, tokenHash: unique("hash").padEnd(64, "0").slice(0, 64), status: "delivered", intakeJson: JSON.stringify({ ...sampleIntake, revenueTarget: 4_000_000 }), intakeSubmittedAt: new Date("2026-10-14T09:00:00Z"), reportVersion: 4, deliveredAt: new Date("2026-10-14T09:00:00Z") });
        const fromReport = (await (await owner.call()).engagement.client.room())!.insight!;
        expect(fromReport.source).toBe("Full Report");
        expect(fromReport.founder.sections.map(section => section.title)).toEqual(["Founder readiness", "Strategic intent"]);
        expect(fromReport.founder.question?.bridge?.steps.at(-1)).toMatchObject({ label: "Target", total: true });
        expect(fromReport.areas.some(area => area.reading?.code)).toBe(true);
        expect((await (await contributor.browser.call()).engagement.client.room())!.insight).toBeNull();

        // A stored intake that no longer reads falls back to the check rather than closing the room.
        await db.update(schema.fullReports).set({ intakeJson: "{not json" }).where(eq(schema.fullReports.businessCheckId, businessCheckId));
        expect((await (await owner.call()).engagement.client.room())!.insight!.source).toBe("Business Health Check");
      });

      it("shows the owner's staff only what the owner shares with them, and contributors only their own requests", async () => {
        const { owner, engagementId, businessId } = await client("staff");
        const full = await member(businessId, null);
        const contributor = await member(businessId, "contributor");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId });
        const sessionId = detail.sessions[0].id;
        await (await superAdmin.call()).engagement.staff.saveNotes({ sessionId, clientNotes: "Frank notes for the owner.", internalNotes: null });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareNotes({ sessionId, audience: "owner" });
        // Owner-only: the owner's staff are not emailed about something they cannot see.
        expect(emails().map(sent => sent.to)).not.toContain(full.user.email);
        expect(emails().map(sent => sent.to)).not.toContain(contributor.user.email);
        const task = detail.tasks[1];
        await (await superAdmin.call()).engagement.staff.saveTask({ ...task, engagementId, taskId: task.id, assigneeUserId: contributor.user.id, sessionId: null });

        const fullRoom = (await (await full.browser.call()).engagement.client.room())!;
        expect(fullRoom.viewer).toEqual({ kind: "member", access: "full" });
        expect(fullRoom.sessions[0].notes).toBeNull();
        expect(fullRoom.tasks).toHaveLength(ASSESSMENT_TEMPLATE.dataRequests.length + ASSESSMENT_TEMPLATE.teamActions.length);
        const contributorRoom = (await (await contributor.browser.call()).engagement.client.room())!;
        expect(contributorRoom.tasks.map(item => item.id)).toEqual([task.id]);
        expect(contributorRoom.tasks[0].mine).toBe(true);
        await expect((await contributor.browser.call()).engagement.client.respondToTask({ taskId: detail.tasks[0].id, note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });

        // Only the owner decides: a full member cannot widen it, the owner can.
        await expect((await full.browser.call()).engagement.client.setAudience({ item: "notes", id: sessionId, audience: "business" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await owner.call()).engagement.client.setAudience({ item: "notes", id: sessionId, audience: "business" });
        expect((await (await full.browser.call()).engagement.client.room())!.sessions[0].notes).toBe("Frank notes for the owner.");
        expect((await (await contributor.browser.call()).engagement.client.room())!.sessions[0].notes).toBeNull();
      });
    });

    describe("files (a private bucket, reached only through the server)", () => {
      const saved = { url: ENV.supabaseUrl, key: ENV.supabaseServiceRoleKey, bucket: ENV.supabaseStorageBucket };
      /** Stands in for Supabase Storage: a signed upload "arrives" the object, info and sign answer for what arrived. */
      const storage = (options: { failDelete?: boolean } = {}) => {
        const objects = new Set<string>();
        const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
          const path = new URL(url).pathname;
          const key = decodeURIComponent(path.split("/engagement-files/")[1] ?? "");
          const has = objects.has(key);
          if (init?.method === "DELETE") {
            if (options.failDelete) return { ok: false, status: 500, json: async () => ({}) };
            objects.delete(key);
            return { ok: has, status: has ? 200 : 404, json: async () => ({}) };
          }
          if (path.includes("/object/upload/sign/")) { objects.add(key); return { ok: true, status: 200, json: async () => ({ url: `/object/upload/sign/engagement-files/${key}?token=up` }) }; }
          if (path.includes("/object/info/") || path.includes("/object/authenticated/")) return { ok: has, status: has ? 200 : 404, json: async () => ({}) };
          if (path.includes("/object/sign/") && (init?.method ?? "GET") === "POST") return { ok: true, status: 200, json: async () => ({ signedURL: `/object/sign/engagement-files/${key}?token=down` }) };
          return { ok: false, status: 404, json: async () => ({}) };
        });
        vi.stubGlobal("fetch", fetchMock);
        return { fetchMock, objects };
      };
      const configure = () => { ENV.supabaseUrl = "https://example-project.supabase.co"; ENV.supabaseServiceRoleKey = "service-key-for-tests"; ENV.supabaseStorageBucket = "engagement-files"; };
      afterEach(() => { ENV.supabaseUrl = saved.url; ENV.supabaseServiceRoleKey = saved.key; ENV.supabaseStorageBucket = saved.bucket; vi.unstubAllGlobals(); });
      const pdf = (fileName: string) => ({ fileName, contentType: "application/pdf", sizeBytes: 120_000 });

      it("says uploads are off, and what to do instead, until the bucket is set up", async () => {
        const { owner } = await client("no-storage");
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.uploadsEnabled).toBe(false);
        await expect((await owner.call()).engagement.client.requestUpload({ taskId: room.tasks[0].id, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("WhatsApp") });
      });

      it("lets the owner upload against a request: the file is recorded, the request is received, and only they and the team can open it", async () => {
        configure();
        storage();
        const a = await client("files-a");
        const b = await client("files-b");
        const room = (await (await a.owner.call()).engagement.client.room())!;
        expect(room.uploadsEnabled).toBe(true);
        const task = room.tasks[1];
        const ticket = await (await a.owner.call()).engagement.client.requestUpload({ taskId: task.id, ...pdf("sales.pdf") });
        expect(ticket.storageKey).toMatch(new RegExp(`^engagements/${a.engagementId}/tasks/${task.id}/[0-9a-f-]+-sales\\.pdf$`));
        expect(ticket.uploadUrl).toContain("https://example-project.supabase.co/storage/v1/object/upload/sign/engagement-files/");
        expect(ticket.headers).toEqual({ "content-type": "application/pdf", "x-upsert": "false" });

        // A key that belongs to another engagement or task is refused, however it was obtained.
        await expect((await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: `engagements/${b.engagementId}/tasks/1/x-sales.pdf`, note: null, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: `engagements/${a.engagementId}/tasks/${task.id}/../../engagements/${b.engagementId}/tasks/1/x-sales.pdf`, note: null, ...pdf("sales.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const confirmed = await (await a.owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: ticket.storageKey, note: null, ...pdf("sales.pdf") });
        expect(confirmed).toMatchObject({ status: "received" });

        const after = (await (await a.owner.call()).engagement.client.room())!;
        const updated = after.tasks.find(item => item.id === task.id)!;
        expect(updated).toMatchObject({ status: "received", statusNote: "Uploaded to the room" });
        expect(updated.files).toEqual([expect.objectContaining({ fileName: "sales.pdf", sizeBytes: 120_000, mine: true, fromTeam: false })]);
        const link = await (await a.owner.call()).engagement.client.fileLink({ fileId: updated.files[0].id });
        expect(link.url).toBe(`https://example-project.supabase.co/storage/v1/object/sign/engagement-files/${ticket.storageKey}?token=down&download=sales.pdf`);

        await expect((await b.owner.call()).engagement.client.fileLink({ fileId: updated.files[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const analystUser = await person(["analyst"]);
        const analyst = await signIn(analystUser, true);
        await expect((await analyst.call()).engagement.staff.fileLink({ fileId: updated.files[0].id })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId: a.engagementId, userId: analystUser.id, role: "analyst" });
        expect((await (await analyst.call()).engagement.staff.fileLink({ fileId: updated.files[0].id })).url).toContain("download=sales.pdf");
        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId: a.engagementId });
        expect(detail.uploadsEnabled).toBe(true);
        expect(detail.tasks.find(item => item.id === task.id)!.files[0]).toMatchObject({ fileName: "sales.pdf", audience: "owner" });
      });

      it("refuses the wrong kind of file, a file that is too big, and an upload that never arrived", async () => {
        configure();
        const { objects } = storage();
        const { owner } = await client("files-rules");
        const taskId = (await (await owner.call()).engagement.client.room())!.tasks[2].id;
        await expect((await owner.call()).engagement.client.requestUpload({ taskId, fileName: "virus.exe", contentType: "application/octet-stream", sizeBytes: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await owner.call()).engagement.client.requestUpload({ taskId, fileName: "big.pdf", contentType: "application/pdf", sizeBytes: 26 * 1024 * 1024 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const ticket = await (await owner.call()).engagement.client.requestUpload({ taskId, ...pdf("costs.pdf") });
        objects.delete(ticket.storageKey);
        await expect((await owner.call()).engagement.client.confirmUpload({ taskId, storageKey: ticket.storageKey, note: null, ...pdf("costs.pdf") })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "The upload did not finish. Try again." });
        expect((await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === taskId)!.status).toBe("open");
      });

      it("takes a voice note, refuses a video with where to send it instead, and takes a link to a folder as the answer (R43)", async () => {
        configure();
        storage();
        const a = await client("footage-a");
        const b = await client("footage-b");
        const task = (await (await a.owner.call()).engagement.client.room())!.tasks.find(item => item.kind === "data_request" && item.status === "open")!;
        await (await a.owner.call()).engagement.client.requestUpload({ taskId: task.id, fileName: "about-our-prices.m4a", contentType: "audio/mp4", sizeBytes: 3_000_000 });
        await expect((await a.owner.call()).engagement.client.requestUpload({ taskId: task.id, fileName: "shop-tour.mp4", contentType: "video/mp4", sizeBytes: 9_000_000 }))
          .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Paste a link to the folder") });

        await expect((await a.owner.call()).engagement.client.answerWithLink({ taskId: task.id, url: "http://drive.google.com/x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await b.owner.call()).engagement.client.answerWithLink({ taskId: task.id, url: "https://drive.google.com/drive/folders/abc" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await (await a.owner.call()).engagement.client.answerWithLink({ taskId: task.id, url: "https://drive.google.com/drive/folders/abc" })).toEqual({ success: true, status: "received" });
        const answered = (await (await a.owner.call()).engagement.client.room())!.tasks.find(item => item.id === task.id)!;
        expect(answered).toMatchObject({ status: "received", statusNote: "Sent a link to a folder", responseLink: "https://drive.google.com/drive/folders/abc" });
        expect((await (await superAdmin.call()).engagement.staff.detail({ engagementId: a.engagementId })).tasks.find(item => item.id === task.id)!.responseLink).toBe("https://drive.google.com/drive/folders/abc");
        await expect((await a.owner.call()).engagement.client.answerWithLink({ taskId: task.id, url: "https://www.dropbox.com/s/x" })).rejects.toMatchObject({ code: "CONFLICT" });
        const [event] = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_task_answered")).orderBy(desc(schema.adminAccessAuditEvents.id)).limit(1);
        expect(JSON.parse(event!.details!)).toMatchObject({ taskId: task.id, via: "link" });
      });

      it("lets the client take back a file until the team has taken it in, and the team remove any file with a reason; the stored file is deleted (R61)", async () => {
        configure();
        const { objects } = storage();
        const a = await client("remove-a");
        const b = await client("remove-b");
        const tasks = (await (await a.owner.call()).engagement.client.room())!.tasks.filter(item => item.kind === "data_request" && item.status === "open");
        const upload = async (taskId: number, name: string) => {
          const ticket = await (await a.owner.call()).engagement.client.requestUpload({ taskId, ...pdf(name) });
          return { ...(await (await a.owner.call()).engagement.client.confirmUpload({ taskId, storageKey: ticket.storageKey, note: null, ...pdf(name) })), storageKey: ticket.storageKey };
        };
        const wrong = await upload(tasks[0]!.id, "wrong-statement.pdf");
        expect((await (await a.owner.call()).engagement.client.room())!.tasks.find(item => item.id === tasks[0]!.id)!.status).toBe("received");
        // Another client cannot remove it; the owner can, and the item goes back to "To do".
        await expect((await b.owner.call()).engagement.client.removeFile({ fileId: wrong.fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await (await a.owner.call()).engagement.client.removeFile({ fileId: wrong.fileId })).toEqual({ success: true });
        expect(objects.has(wrong.storageKey)).toBe(false);
        const after = (await (await a.owner.call()).engagement.client.room())!.tasks.find(item => item.id === tasks[0]!.id)!;
        expect(after).toMatchObject({ status: "open", files: [] });
        const [removed] = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_file_removed")).orderBy(desc(schema.adminAccessAuditEvents.id)).limit(1);
        expect(JSON.parse(removed!.details!)).toMatchObject({ fileId: wrong.fileId, by: "client" });

        // Once the team has accepted the item, the client asks the team instead.
        const kept = await upload(tasks[1]!.id, "bank-statement.pdf");
        const desk = await superAdmin.call();
        const full = (await desk.engagement.staff.detail({ engagementId: a.engagementId })).tasks.find(item => item.id === tasks[1]!.id)!;
        await desk.engagement.staff.saveTask({ engagementId: a.engagementId, taskId: full.id, kind: full.kind, side: full.side, title: full.title, detail: full.detail, assigneeUserId: full.assigneeUserId, dueOn: full.dueOn, status: "accepted", statusNote: full.statusNote, sessionId: full.sessionId, weekNumber: full.weekNumber, sortOrder: full.sortOrder, factor: full.factor });
        await expect((await a.owner.call()).engagement.client.removeFile({ fileId: kept.fileId })).rejects.toMatchObject({ code: "CONFLICT" });

        // The team removes it, saying why; a Specialist cannot; a storage failure keeps the record.
        await expect(desk.engagement.staff.removeFile({ fileId: kept.fileId, reason: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const specialist = await signIn(await person(["subject_matter_expert"]), true);
        await expect((await specialist.call()).engagement.staff.removeFile({ fileId: kept.fileId, reason: "Wrong client" })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
        expect(await desk.engagement.staff.removeFile({ fileId: kept.fileId, reason: "Holds another customer's details" })).toEqual({ success: true });
        expect(objects.has(kept.storageKey)).toBe(false);
        const [byTeam] = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_file_removed")).orderBy(desc(schema.adminAccessAuditEvents.id)).limit(1);
        expect(JSON.parse(byTeam!.details!)).toMatchObject({ fileId: kept.fileId, by: "team", reason: "Holds another customer's details" });
      });

      it("keeps the record when storage will not delete the file, and says to try again (R61)", async () => {
        configure();
        storage({ failDelete: true });
        const { owner, engagementId } = await client("remove-fails");
        const task = (await (await owner.call()).engagement.client.room())!.tasks.find(item => item.kind === "data_request" && item.status === "open")!;
        const ticket = await (await owner.call()).engagement.client.requestUpload({ taskId: task.id, ...pdf("statement.pdf") });
        const { fileId } = await (await owner.call()).engagement.client.confirmUpload({ taskId: task.id, storageKey: ticket.storageKey, note: null, ...pdf("statement.pdf") });
        await expect((await owner.call()).engagement.client.removeFile({ fileId })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "We could not remove the file just now. Try again in a moment." });
        expect((await (await superAdmin.call()).engagement.staff.detail({ engagementId })).tasks.find(item => item.id === task.id)!.files.map(file => file.id)).toEqual([fileId]);
      });

      it("takes files into the drop box unsorted; the team matches each to Data Requests; only this client and the team see them", async () => {
        configure();
        storage();
        const a = await client("drop-a");
        const b = await client("drop-b");
        const room = (await (await a.owner.call()).engagement.client.room())!;
        const [first, second] = room.tasks.filter(task => task.kind === "data_request");
        const ticket = await (await a.owner.call()).engagement.client.requestDrop(pdf("everything.pdf"));
        expect(ticket.storageKey).toMatch(new RegExp(`^engagements/${a.engagementId}/inbox/[0-9a-f-]+-everything\\.pdf$`));
        // A key outside this engagement's drop box is refused, however it was obtained.
        await expect((await a.owner.call()).engagement.client.confirmDrop({ storageKey: `engagements/${b.engagementId}/inbox/x-everything.pdf`, note: null, ...pdf("everything.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await a.owner.call()).engagement.client.confirmDrop({ storageKey: `engagements/${a.engagementId}/tasks/${first.id}/x-everything.pdf`, note: null, ...pdf("everything.pdf") })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const { fileId } = await (await a.owner.call()).engagement.client.confirmDrop({ storageKey: ticket.storageKey, note: "From our accountant", ...pdf("everything.pdf") });

        let after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.sentFiles).toEqual([expect.objectContaining({ id: fileId, fileName: "everything.pdf", mine: true, note: "From our accountant", matchedTo: [] })]);
        expect(after.tasks.find(task => task.id === first.id)!.status).toBe("open");
        const detail = await (await superAdmin.call()).engagement.staff.detail({ engagementId: a.engagementId });
        expect(detail.inbox).toEqual([expect.objectContaining({ id: fileId, fileName: "everything.pdf", note: "From our accountant", taskIds: [] })]);

        // Another engagement's request cannot be matched; this one's can, and a waiting request moves to "we are checking".
        const otherTask = (await (await b.owner.call()).engagement.client.room())!.tasks[0];
        await expect((await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [otherTask.id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(await (await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [first.id, second.id] })).toMatchObject({ moved: 2 });
        after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.tasks.find(task => task.id === first.id)).toMatchObject({ status: "received", statusNote: "From the files you sent", files: [expect.objectContaining({ id: fileId })] });
        expect(after.sentFiles[0].matchedTo.map(match => match.taskId).sort()).toEqual([first.id, second.id].sort());
        expect((await (await superAdmin.call()).engagement.staff.detail({ engagementId: a.engagementId })).inbox[0].taskIds.sort()).toEqual([first.id, second.id].sort());

        expect((await (await a.owner.call()).engagement.client.fileLink({ fileId })).url).toContain("download=everything.pdf");
        await expect((await b.owner.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect((await (await b.owner.call()).engagement.client.room())!.sentFiles).toEqual([]);

        // Clearing the match keeps the file and takes it off the requests.
        await (await superAdmin.call()).engagement.staff.matchFile({ fileId, taskIds: [] });
        after = (await (await a.owner.call()).engagement.client.room())!;
        expect(after.sentFiles[0].matchedTo).toEqual([]);
        expect(after.tasks.find(task => task.id === first.id)!.files).toEqual([]);
      });

      it("lets the client mark a Data Request not available, and undo it, but not once the team has it", async () => {
        const { owner } = await client("not-available");
        const request = (await (await owner.call()).engagement.client.room())!.tasks.find(task => task.kind === "data_request")!;
        expect(await (await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: "We kept no records before March" })).toMatchObject({ status: "not_available" });
        let task = (await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === request.id)!;
        expect(task).toMatchObject({ status: "not_available", statusLabel: "Not available", statusNote: "We kept no records before March" });
        await expect((await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
        await (await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: false, note: null });
        task = (await (await owner.call()).engagement.client.room())!.tasks.find(item => item.id === request.id)!;
        expect(task).toMatchObject({ status: "open", statusNote: null });
        await (await owner.call()).engagement.client.respondToTask({ taskId: request.id, note: "On WhatsApp" });
        await expect((await owner.call()).engagement.client.setNotAvailable({ taskId: request.id, unavailable: true, note: null })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("takes a Specialist's file on a Deliverable as an IP Factory draft, which reaches the client only when the lead shares it", async () => {
        configure();
        storage();
        const { owner, engagementId } = await client("files-specialist");
        const desk = await superAdmin.call();
        const { deliverableId } = await desk.engagement.staff.saveDeliverable({ engagementId, kind: "tools", title: "Content calendar", summary: "Month 1." });
        const { taskId } = { taskId: (await desk.engagement.staff.detail({ engagementId })).tasks[0].id };
        const specialistUser = await person(["subject_matter_expert"]);
        await desk.engagement.staff.assign({ engagementId, userId: specialistUser.id, role: "expert" });
        const specialist = await (await signIn(specialistUser, true)).call();
        const target = { kind: "deliverable" as const, id: deliverableId };
        const file = pdf("calendar.pdf");
        await expect(specialist.engagement.staff.requestUpload({ engagementId, target: { kind: "task", id: taskId }, ...file })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const ticket = await specialist.engagement.staff.requestUpload({ engagementId, target, ...file });
        await expect(specialist.engagement.staff.confirmUpload({ engagementId, target, storageKey: ticket.storageKey, audience: "owner", ...file })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const { fileId } = await specialist.engagement.staff.confirmUpload({ engagementId, target, storageKey: ticket.storageKey, audience: "team", ...file });

        // Shared deliverable or not, the draft stays with IP Factory until the lead shares the file itself.
        await desk.engagement.staff.shareDeliverable({ deliverableId, audience: "owner" });
        expect((await (await owner.call()).engagement.client.room())!.deliverables[0].files).toEqual([]);
        await expect((await owner.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(specialist.engagement.staff.shareFile({ fileId, audience: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await desk.engagement.staff.shareFile({ fileId, audience: "owner" });
        expect((await (await owner.call()).engagement.client.room())!.deliverables[0].files).toEqual([expect.objectContaining({ fileName: "calendar.pdf", fromTeam: true })]);
        await expect(desk.engagement.staff.shareFile({ fileId, audience: "owner" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });

      it("shows the team's file on a deliverable only once the deliverable is shared, and to the audience chosen", async () => {
        configure();
        storage();
        const { owner, engagementId, businessId } = await client("files-deliverable");
        const full = await member(businessId, "full");
        const contributor = await member(businessId, "contributor");
        const { deliverableId } = await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, kind: "tools", title: "Cash template", summary: "Fill it in every evening." });
        const target = { kind: "deliverable" as const, id: deliverableId };
        const ticket = await (await superAdmin.call()).engagement.staff.requestUpload({ engagementId, target, fileName: "cash-template.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 9_000 });
        const { fileId } = await (await superAdmin.call()).engagement.staff.confirmUpload({ engagementId, target, storageKey: ticket.storageKey, audience: "business", fileName: "cash-template.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sizeBytes: 9_000 });

        await expect((await owner.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await superAdmin.call()).engagement.staff.shareDeliverable({ deliverableId, audience: "business" });
        expect((await (await owner.call()).engagement.client.room())!.deliverables[0].files).toEqual([expect.objectContaining({ fileName: "cash-template.xlsx", fromTeam: true, mine: false })]);
        expect((await (await full.browser.call()).engagement.client.fileLink({ fileId })).url).toContain("download=cash-template.xlsx");
        await expect((await contributor.browser.call()).engagement.client.fileLink({ fileId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });

    describe("Specialists: read less, hand in drafts", () => {
      it("hides internal notes and fees from a Specialist, and lets them add team items only", async () => {
        const { engagementId } = await client("specialist-read");
        const desk = await superAdmin.call();
        const sessionId = (await desk.engagement.staff.detail({ engagementId })).sessions[0].id;
        await desk.engagement.staff.saveNotes({ sessionId, clientNotes: "Pricing first.", internalNotes: "Owner may be under-reporting cash sales." });
        const specialistUser = await person(["subject_matter_expert"], "Sola Specialist");
        const partnerUser = await person(["partner"], "Pat Partner");
        await desk.engagement.staff.assign({ engagementId, userId: specialistUser.id, role: "expert" });
        await desk.engagement.staff.assign({ engagementId, userId: partnerUser.id, role: "partner" });
        const specialist = await (await signIn(specialistUser, true)).call();
        const partner = await (await signIn(partnerUser, true)).call();

        const seen = await specialist.engagement.staff.detail({ engagementId });
        expect(seen.can).toMatchObject({ manage: false, contribute: true, seeInternal: false, seeFees: false });
        expect(seen.sessions.find(item => item.id === sessionId)).toMatchObject({ clientNotes: "Pricing first.", internalNotes: null });
        expect(JSON.stringify(seen)).not.toContain("under-reporting");
        await expect(specialist.engagement.staff.fees({ engagementId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // A partner keeps both.
        expect((await partner.engagement.staff.detail({ engagementId })).sessions.find(item => item.id === sessionId)!.internalNotes).toContain("under-reporting");
        // The partner reads the fees: the Business Review's two halves (R36), on fees since F3.
        expect((await partner.engagement.staff.fees({ engagementId })).feeLines.map(line => line.label)).toEqual(["Business Review: half to start", "Business Review: half on delivery"]);

        const item = { engagementId, kind: "action" as const, title: "Draft the competitor scan", detail: null, assigneeUserId: null, dueOn: null, status: "open" as const, statusNote: null, sessionId: null, weekNumber: 1, sortOrder: 9, factor: null };
        const { taskId } = await specialist.engagement.staff.saveTask({ ...item, side: "ipf" });
        expect((await desk.engagement.staff.detail({ engagementId })).tasks.find(task => task.id === taskId)).toMatchObject({ side: "ipf", title: "Draft the competitor scan" });
        await expect(specialist.engagement.staff.saveTask({ ...item, side: "client", title: "Send your bank statements" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(specialist.engagement.staff.saveTask({ ...item, side: "ipf", taskId, title: "Changed" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(specialist.engagement.staff.saveTask({ ...item, side: "ipf", assigneeUserId: partnerUser.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(specialist.engagement.staff.loadDataRequest({ engagementId, items: [{ section: null, ref: null, title: "Anything", detail: null, informs: null, format: null, priority: null, dueOn: null }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
        // Not on another engagement.
        const other = await client("specialist-other");
        await expect(specialist.engagement.staff.saveTask({ ...item, engagementId: other.engagementId, side: "ipf" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });

    describe("the fix: the one number and the weekly check-in", () => {
      it("lets the team set the number and record the weeks in order; the client sees the reading and the next step, never the hours", async () => {
        const { owner, engagementId, businessId } = await client("fix");
        const contributor = await member(businessId, "contributor");
        const analystUser = await person(["analyst"]);
        const analyst = await signIn(analystUser, true);
        const outsider = await signIn(await person(["analyst"]), true);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });

        const measure = { engagementId, name: "Cash in the bank on Friday", definition: "The business account balance after the week's payments.", unit: "₦", baselineValue: 150000, targetValue: 400000 };
        await expect((await outsider.call()).engagement.staff.saveMeasure(measure)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await (await analyst.call()).engagement.staff.saveMeasure(measure);
        await (await analyst.call()).engagement.staff.saveMeasure({ ...measure, targetValue: 450000 });
        expect(await db.select().from(schema.engagementMeasures).where(eq(schema.engagementMeasures.engagementId, engagementId))).toHaveLength(1);

        const week = (weekNumber: number, reading: number) => ({ engagementId, weekNumber, heldOn: `2026-11-${String(6 + 7 * weekNumber).padStart(2, "0")}`, progress: "Moved.", blockers: "Power cuts.", nextStep: `Step for week ${weekNumber + 1}.`, measureReading: reading, questionsAsked: "How do I price delivery?", hoursLead: 0.5, hoursAnalyst: 2.5, hoursPartner: null, aiUsed: true });
        await expect((await analyst.call()).engagement.staff.saveCheckin(week(2, 200000))).rejects.toMatchObject({ code: "CONFLICT", message: "Record week 1 first: a Weekly Check-in cannot start without last week's record." });
        await (await analyst.call()).engagement.staff.saveCheckin(week(1, 160000));
        await (await analyst.call()).engagement.staff.saveCheckin(week(2, 200000));
        await (await analyst.call()).engagement.staff.saveCheckin({ ...week(2, 210000) });

        const detail = await (await analyst.call()).engagement.staff.detail({ engagementId });
        expect(detail.measure).toMatchObject({ name: "Cash in the bank on Friday", baselineValue: 150000, targetValue: 450000 });
        expect(detail.checkins.map(row => [row.weekNumber, row.measureReading, row.hoursAnalyst])).toEqual([[1, 160000, 2.5], [2, 210000, 2.5]]);

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.measure).toMatchObject({ name: "Cash in the bank on Friday", unit: "₦", baselineValue: 150000, targetValue: 450000, latest: { weekNumber: 2, reading: 210000 } });
        expect(room.measure!.readings.map(row => [row.weekNumber, row.reading, row.nextStep])).toEqual([[1, 160000, "Step for week 2."], [2, 210000, "Step for week 3."]]);
        const text = JSON.stringify(room);
        for (const hidden of ["hoursAnalyst", "hoursLead", "questionsAsked", "Power cuts", "aiUsed"]) expect(text).not.toContain(hidden);
        expect((await (await contributor.browser.call()).engagement.client.room())!.measure).toBeNull();
      });
    });

    describe("deliverables", () => {
      it("needs the desk lead's approval before a prescription reaches the client; findings can be shared at once", async () => {
        const { owner, engagementId } = await client("deliverables");
        const analystUser = await person(["analyst"]);
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: analystUser.id, role: "analyst" });
        const analyst = await signIn(analystUser, true);

        const { deliverableId: findings } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId, kind: "findings", title: "What we found", summary: "Cash leaks at the till." });
        await (await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: findings, audience: "owner" });

        const { deliverableId: prescription } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId, kind: "prescription", title: "Daily cash count", summary: "Count and record cash every evening." });
        await expect((await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: prescription, audience: "owner" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect((await analyst.call()).engagement.staff.approveDeliverable({ deliverableId: prescription })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await superAdmin.call()).engagement.staff.approveDeliverable({ deliverableId: prescription });
        await (await analyst.call()).engagement.staff.shareDeliverable({ deliverableId: prescription, audience: "owner" });

        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.deliverables.map(item => [item.kindLabel, item.title])).toEqual([["Findings", "What we found"], ["Prescription", "Daily cash count"]]);
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, "engagement_deliverable_approved"), sql`${schema.adminAccessAuditEvents.details}::jsonb ->> 'deliverableId' = ${String(prescription)}`));
        expect(audits).toHaveLength(1);
      });

      it("lets the engagement's own Engagement Manager or Lead Consultant approve, on that engagement only, but not its analyst", async () => {
        const one = await client("lead-approves");
        const other = await client("lead-elsewhere");
        const managerUser = await person(["analyst"]);
        const analystUser = await person(["analyst"]);
        for (const engagementId of [one.engagementId, other.engagementId]) await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: managerUser.id, role: engagementId === one.engagementId ? "manager" : "analyst" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId: one.engagementId, userId: analystUser.id, role: "analyst" });
        const manager = await signIn(managerUser, true);
        const analyst = await signIn(analystUser, true);
        expect((await (await manager.call()).engagement.staff.detail({ engagementId: one.engagementId })).can.review).toBe(true);
        expect((await (await manager.call()).engagement.staff.detail({ engagementId: other.engagementId })).can.review).toBe(false);
        expect((await (await analyst.call()).engagement.staff.detail({ engagementId: one.engagementId })).can.review).toBe(false);

        const { deliverableId } = await (await analyst.call()).engagement.staff.saveDeliverable({ engagementId: one.engagementId, kind: "prescription", title: "Daily cash count", summary: "Count every evening." });
        await expect((await analyst.call()).engagement.staff.approveDeliverable({ deliverableId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await manager.call()).engagement.staff.approveDeliverable({ deliverableId });
        const { deliverableId: elsewhere } = await (await manager.call()).engagement.staff.saveDeliverable({ engagementId: other.engagementId, kind: "plan", title: "Your Plan", summary: null });
        await expect((await manager.call()).engagement.staff.approveDeliverable({ deliverableId: elsewhere })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("lets the owner comment and sign off, and their staff only comment", async () => {
        const { owner, engagementId, businessId } = await client("signoff");
        const full = await member(businessId, "full");
        const { deliverableId } = await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, kind: "problem_statement", title: "The one problem", summary: "Prices do not cover costs." });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.shareDeliverable({ deliverableId, audience: "business" });
        expect(emails().filter(sent => sent.subject === "Engagement update: The one problem").map(sent => sent.to)).toContain(full.user.email);

        await (await full.browser.call()).engagement.client.comment({ deliverableId, body: "Transport is missing from costs." });
        await expect((await full.browser.call()).engagement.client.accept({ deliverableId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        await (await owner.call()).engagement.client.accept({ deliverableId });
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.deliverables[0]).toMatchObject({ accepted: true, comments: [expect.objectContaining({ body: "Transport is missing from costs.", authorName: "Staff Member" })] });

        // Editing a shared deliverable takes it back to draft, out of the client's view, until it is shared again.
        await (await superAdmin.call()).engagement.staff.saveDeliverable({ engagementId, deliverableId, kind: "problem_statement", title: "The one problem", summary: "Prices do not cover transport." });
        expect((await (await owner.call()).engagement.client.room())!.deliverables).toEqual([]);
      });
    });
  });
}
