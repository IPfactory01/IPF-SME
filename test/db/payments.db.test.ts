/**
 * Paying for The Shift by bank transfer until online payment is ready: the full report's payment details go out when
 * the owner asks for it; the team sends Current State Assessment payment details after the call, notes proof and confirms the
 * money; confirming Current State Assessment wins the business and sends the client account invitation. Real application code on
 * PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`). Email and the language model are stubbed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles, profileContact } from "../fixtures/businessCheckProfiles";

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
import { ACCOUNT_SESSION_COOKIE, type PlatformRole } from "@shared/auth";
import { cleanAnswers } from "@shared/businessCheck/engine";
import { sampleIntake } from "../fixtures/reportIntake";
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
type EmailCall = { to: string; subject: string; body: string; sender?: string; attachments?: { filename: string; content: Buffer; contentType: string }[] };

const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Payment on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    const passwordHash = hashAdminPassword(PASSWORD);

    async function person(overrides: Record<string, unknown> = {}, roles: PlatformRole[] = []) {
      const [user] = await db.insert(schema.users).values({ openId: unique("u"), email: uniqueEmail("person"), name: "Test Person", role: "user", status: "active", ...overrides }).returning();
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      return user as { id: number; email: string };
    }
    async function signInStaff(user: { email: string }) {
      const b = browser();
      await (await b.call()).account.signInInternal({ email: user.email, password: PASSWORD });
      return b;
    }
    const rowFor = async (token: string) => (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0];
    const paymentsOf = async (businessCheckId: number) => db.select().from(schema.paymentRequests).where(eq(schema.paymentRequests.businessCheckId, businessCheckId)).orderBy(schema.paymentRequests.id);
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const auditsFor = async (action: string, businessCheckId: number) =>
      db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, action), sql`${schema.adminAccessAuditEvents.details}::jsonb ->> 'businessCheckId' = ${String(businessCheckId)}`));

    async function finishedCheck(label = "payer") {
      const visitor = browser();
      const email = uniqueEmail(label);
      const contact = profileContact("Payer");
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `${contact.businessName} ${label}` } });
      const id = (await rowFor(token)).id as number;
      return { token, email, visitor, id };
    }

    /**
     * Holds every transaction until released, so two calls both read the payment before either writes: the race two
     * operators (or a double click) cause on Vercel, which the serialised test database would otherwise never show.
     */
    function holdTransactions() {
      const real = harness.db as unknown as Record<string, unknown> & { transaction: (fn: unknown) => Promise<unknown> };
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      holder.current = new Proxy(real, { get: (target, property) => (property === "transaction" ? (fn: unknown) => gate.then(() => real.transaction.call(target, fn)) : Reflect.get(target, property)) });
      return { release: () => { holder.current = real; release(); } };
    }
    /** Runs the calls together, lets both read, then lets the transactions through. */
    async function together<T>(calls: Array<() => Promise<T>>) {
      const hold = holdTransactions();
      const pending = Promise.all(calls.map(call => call()));
      await new Promise(resolve => setTimeout(resolve, 50));
      hold.release();
      return pending;
    }

    beforeAll(async () => {
      harness = await target.make();
      db = harness.db;
      holder.current = harness.db as unknown as Record<string, unknown>;
      await db.insert(schema.users).values({ openId: unique("owner"), email: OWNER_ADMIN_EMAIL, role: "admin", name: "Owner" }).onConflictDoNothing();
      const owner = (await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${OWNER_ADMIN_EMAIL.toLowerCase()}`))[0];
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = await signInStaff(owner);
    }, 120_000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
    });

    describe("the full report", () => {
      it("emails the owner the payment link as soon as they ask for the report, and tells the office", async () => {
        const { token, email, visitor, id } = await finishedCheck("report");
        mocked.deliverEmail.mockClear();
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });

        const [payment] = await paymentsOf(id);
        const reference = `TS-R-${String(id).padStart(6, "0")}`;
        expect(payment).toMatchObject({ item: "full_report", amountNaira: 100_000, reference, status: "requested", requestedByUserId: null, deliveryStatus: "Simulated" });

        const toOwner = emails().find(sent => sent.to === email)!;
        expect(toOwner).toMatchObject({ subject: "Payment details for your Full Report", sender: "business_support" });
        expect(toOwner.body).toContain("Amount: ₦100,000");
        expect(toOwner.body).toContain(`Reference: ${reference}`);
        // Paystack is the only way to pay: no bank details and no proof of payment. Paystack is off in these tests.
        expect(toOwner.body).not.toMatch(/Bank:|Account number|proof of payment|DO NOT PAY/);
        expect(toOwner.body).toContain("Online payment is not open yet. We will email you a link to pay as soon as it is.");
        const toOffice = emails().find(sent => sent.to === "info@ipfactory.co")!;
        expect(toOffice.body).toContain(`Payment details sent: ${reference}`);
        expect(await auditsFor("payment_details_sent", id)).toHaveLength(1);
        // The report is independent of the journey: asking for it does not move the stage.
        expect((await rowFor(token)).pipelineStage).toBe("qualified_lead");
      });

      it("tells the office why the owner's payment email failed", async () => {
        const { token, email, visitor } = await finishedCheck("report-failed-email");
        mocked.deliverEmail.mockImplementation(async (input: EmailCall) => input.to === email
          ? { status: "Failed", reason: "You can only send testing emails to your own email address" }
          : { status: "Simulated", reason: "test_sender" });
        mocked.deliverEmail.mockClear();
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const toOffice = emails().find(sent => sent.to === "info@ipfactory.co" && /asked for the Full Report/.test(sent.subject))!;
        expect(toOffice.body).toMatch(/Payment details: TS-R-\d{6}, but the email to the owner failed \(You can only send testing emails to your own email address\)\. Send them again from admin once that is fixed\./);
      });

      it("confirms by hand once, as the fallback for Paystack, emails the owner and never reopens a confirmed payment", async () => {
        const { token, email, visitor, id } = await finishedCheck("report-paid");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const [payment] = await paymentsOf(id);

        mocked.deliverEmail.mockClear();
        const note = `${payment.reference}-1a2b3c4d`;
        const confirmed = await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: payment.id, note });
        expect(confirmed).toMatchObject({ changed: true, invitation: null });
        expect((await paymentsOf(id))[0]).toMatchObject({ status: "confirmed", note });
        const receipt = emails().find(sent => sent.to === email)!;
        expect(receipt.subject).toBe("Payment received: your Full Report");
        expect(receipt.body).toMatch(/Complete your Report Intake: https?:\/\/\S+\/report\/\S+/);
        expect((await rowFor(token)).pipelineStage).toBe("qualified_lead");

        // Confirming again changes nothing and sends nothing; the details cannot be re-sent for a paid item.
        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: payment.id })).toMatchObject({ changed: false });
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
        await expect((await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "full_report" })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("has no proof-of-payment step: Paystack confirms the money, so there is nothing for an owner to send", async () => {
        const procedures = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
        expect(procedures).not.toContain("businessSupport.markProofReceived");
        expect(procedures).toContain("businessSupport.confirmPayment");
      });

      it("confirms once, with one email, one link and one audit row, when two people confirm together", async () => {
        const { token, email, visitor, id } = await finishedCheck("confirm-twice");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const [payment] = await paymentsOf(id);
        mocked.deliverEmail.mockClear();
        const [first, second] = await Promise.all([superAdmin.call(), superAdmin.call()]);
        const results = await together([
          () => first.businessSupport.confirmPayment({ paymentRequestId: payment.id, note: "first" }),
          () => second.businessSupport.confirmPayment({ paymentRequestId: payment.id, note: "second" }),
        ]);
        expect(results.filter(result => result.changed)).toHaveLength(1);
        expect(emails().filter(sent => sent.to === email)).toHaveLength(1);
        // The provider is told which message this is, so a retry on its side cannot send it twice either.
        expect(mocked.deliverEmail.mock.calls[0][0]).toMatchObject({ idempotencyKey: `payment_requests:${payment.id}:confirmed` });
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(1);
        expect(await db.select().from(schema.fullReports).where(eq(schema.fullReports.businessCheckId, id))).toHaveLength(1);
      });

      it("confirms nothing when the Report Intake link cannot be issued, and confirms once the fault is gone", async () => {
        const { token, visitor, id } = await finishedCheck("confirm-fault");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const [payment] = await paymentsOf(id);
        mocked.deliverEmail.mockClear();
        await db.execute(sql.raw(`create or replace function ipf_force_failure() returns trigger language plpgsql as $$ begin raise exception 'forced failure'; end $$`));
        await db.execute(sql.raw(`create trigger ipf_force_failure before insert on full_reports for each row execute function ipf_force_failure()`));
        try {
          await expect((await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: payment.id })).rejects.toThrow();
        } finally {
          await db.execute(sql.raw(`drop trigger ipf_force_failure on full_reports`));
        }
        // Nothing half done: the payment is still open, nothing was emailed and nothing was recorded.
        expect((await paymentsOf(id))[0]).toMatchObject({ status: "requested", confirmedAt: null });
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(0);
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: payment.id })).toMatchObject({ changed: true });
        expect((await paymentsOf(id))[0].status).toBe("confirmed");
      });
    });

    describe("Current State Assessment", () => {
      it("is requested by the team after the call, moving the business to Opportunity, and re-sending keeps one request", async () => {
        const { token, email, visitor, id } = await finishedCheck("current-state");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "call" });
        mocked.deliverEmail.mockClear();

        const sent = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect(sent).toMatchObject({ reference: `TS-CS-${String(id).padStart(6, "0")}`, pipelineStage: "opportunity" });
        expect((await rowFor(token)).pipelineStage).toBe("opportunity");
        const details = emails().find(sent => sent.to === email)!;
        expect(details.subject).toBe("Payment details for your Current State Assessment");
        expect(details.body).toContain("Amount: ₦500,000");

        await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        const rows = await paymentsOf(id);
        expect(rows).toHaveLength(1);
        expect(rows[0].requestedByUserId).not.toBeNull();
        const audits = await auditsFor("payment_details_sent", id);
        expect(audits.map((event: { details: string }) => JSON.parse(event.details))).toEqual(expect.arrayContaining([
          expect.objectContaining({ item: "current_state", again: false, from: "call_booked", to: "opportunity" }),
          expect.objectContaining({ item: "current_state", again: true }),
        ]));
      });

      it("once paid, wins the business and sends the client account invitation, which is where the Current State Assessment starts", async () => {
        const { token, email, id } = await finishedCheck("current-state-paid");
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        mocked.deliverEmail.mockClear();

        const confirmed = await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId });
        expect(confirmed).toMatchObject({ changed: true, invitation: "sent" });
        expect((await rowFor(token)).pipelineStage).toBe("won");
        const invitations = await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, id));
        expect(invitations).toHaveLength(1);
        expect(invitations[0].status).toBe("pending");
        const subjects = emails().filter(sent => sent.to === email).map(sent => sent.subject);
        expect(subjects).toEqual(["Payment received: your Current State Assessment starts", "Set up your client account on The Shift"]);
        const confirmation = emails().find(sent => sent.subject === "Payment received: your Current State Assessment starts")!;
        expect(confirmation.body).toContain("Three working days to get set up, then we start.");
        const audit = (await auditsFor("payment_confirmed", id)).map((event: { details: string }) => JSON.parse(event.details));
        expect(audit).toEqual([expect.objectContaining({ item: "current_state", amountNaira: 500_000, from: "opportunity", to: "won" })]);
      });

      it("holds the link for 48 hours; after that the team sees it and can send a fresh link, and a late payment can still be confirmed by hand", async () => {
        const { token, email, id } = await finishedCheck("window");
        mocked.deliverEmail.mockClear();
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        const details = emails().find(sent => sent.to === email)!;
        expect(details.body).toMatch(/Pay by: .+ \(Lagos time\)/);
        expect(details.body).toContain("If you need more than 48 hours, reply to this email and we will send you a new link.");
        const detailOf = async () => (await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id })).payments![0];
        const listedOf = async () => (await (await superAdmin.call()).businessSupport.checks()).find((row: { id: number }) => row.id === id)!.payments;
        expect(await detailOf()).toMatchObject({ status: "requested", displayStatus: "requested" });

        const age = async (hours: number) => db.update(schema.paymentRequests).set({ requestedAt: new Date(Date.now() - hours * 3_600_000) }).where(eq(schema.paymentRequests.id, paymentRequestId));
        await age(49);
        expect(await detailOf()).toMatchObject({ status: "requested", displayStatus: "expired" });
        expect(await listedOf()).toEqual({ current_state: "expired" });
        // The stage is the team's call: it does not move to Lost on its own.
        expect((await rowFor(token)).pipelineStage).toBe("opportunity");

        // Sending the details again starts a new window.
        await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect(await detailOf()).toMatchObject({ displayStatus: "requested" });

        // Money that arrives after the window can still be confirmed.
        await age(72);
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId })).toMatchObject({ changed: true, invitation: "sent" });
        expect(await detailOf()).toMatchObject({ status: "confirmed", displayStatus: "confirmed" });
        expect((await rowFor(token)).pipelineStage).toBe("won");
      });

      it("records what happened to the confirmation email, and sends it again on request", async () => {
        const { email, id } = await finishedCheck("confirmation-again");
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        await expect((await superAdmin.call()).businessSupport.resendPaymentConfirmation({ paymentRequestId })).rejects.toMatchObject({ code: "CONFLICT" });
        mocked.deliverEmail.mockResolvedValueOnce({ status: "Failed", reason: "mailbox unavailable" });
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId });
        const history = () => (async () => (await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id })).stageHistory.filter(event => event.action === "payment_confirmation_sent"))();
        expect(await history()).toEqual([expect.objectContaining({ item: "current_state", delivery: "Failed" })]);

        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).businessSupport.resendPaymentConfirmation({ paymentRequestId })).toEqual({ success: true, deliveryStatus: "Simulated" });
        const again = emails().find(sent => sent.to === email)!;
        expect(again.subject).toBe("Payment received: your Current State Assessment starts");
        expect(await history()).toEqual([expect.objectContaining({ delivery: "Simulated" }), expect.objectContaining({ delivery: "Failed" })]);
        const audit = (await auditsFor("payment_confirmation_sent", id)).map((event: { details: string }) => JSON.parse(event.details).again);
        expect(audit).toEqual([false, true]);
      });

      it("sends one invitation and one confirmation when two people confirm together", async () => {
        const { email, id } = await finishedCheck("invite-twice");
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        mocked.deliverEmail.mockClear();
        const [first, second] = await Promise.all([superAdmin.call(), superAdmin.call()]);
        const results = await together([
          () => first.businessSupport.confirmPayment({ paymentRequestId }),
          () => second.businessSupport.confirmPayment({ paymentRequestId }),
        ]);
        expect(results.filter(result => result.changed)).toEqual([expect.objectContaining({ invitation: "sent" })]);
        const invitations = await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, id));
        expect(invitations.map((invitation: { status: string }) => invitation.status)).toEqual(["pending"]);
        expect(emails().filter(sent => sent.to === email).map(sent => sent.subject)).toEqual(["Payment received: your Current State Assessment starts", "Set up your client account on The Shift"]);
      });

      it("does not send a second invitation when one is already out", async () => {
        const { id } = await finishedCheck("already-invited");
        await (await superAdmin.call()).onboarding.invite({ businessCheckId: id, overrideReason: "Invited early by agreement" });
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId })).toMatchObject({ invitation: "already_invited" });
        const invitations = await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, id));
        expect(invitations).toHaveLength(1);
      });
    });

    describe("the whole journey up to Current State Assessment", () => {
      it("takes an owner from the free check to a client account with Current State Assessment started", async () => {
        // 1. The owner takes the free check and asks for the call and the full report.
        const { token, email, visitor, id } = await finishedCheck("journey");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "call" });
        expect((await rowFor(token)).pipelineStage).toBe("call_booked");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const report = (await paymentsOf(id)).find((row: { item: string }) => row.item === "full_report");
        expect(emails().some(sent => sent.to === email && sent.subject === "Payment details for your Full Report")).toBe(true);

        // 2. They pay for the report (the Paystack path is covered in onlinePayment.db.test.ts; the team's fallback stands in
        //    here); they answer the form and get the report.
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: report.id });
        const formLink = emails().find(sent => sent.to === email && sent.subject === "Payment received: your Full Report")!.body.match(/Complete your Report Intake: (\S+)/)![1];
        await (await browser().call()).fullReport.submit({ token: decodeURIComponent(formLink.split("/report/")[1]), intake: sampleIntake });
        expect(emails().some(sent => sent.to === email && sent.subject.startsWith("Your Full Report") && sent.attachments?.length === 1)).toBe(true);

        // 3. After the call, the team sends the Current State Assessment details; the owner pays; the team confirms.
        const { paymentRequestId } = await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect((await rowFor(token)).pipelineStage).toBe("opportunity");
        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId })).toMatchObject({ invitation: "sent" });
        expect((await rowFor(token)).pipelineStage).toBe("won");

        // 4. The owner follows the link in the invitation email and creates their client account.
        const invitation = emails().find(sent => sent.to === email && sent.subject === "Set up your client account on The Shift")!;
        const link = invitation.body.match(/Create your account: (\S+)/)![1];
        const inviteToken = decodeURIComponent(link.split("/onboarding/")[1]);
        const owner = browser();
        await (await owner.call()).onboarding.accept({ token: inviteToken, email, fullName: "Ada Journey", password: PASSWORD, confirmPassword: PASSWORD, businessName: "Journey Traders" });
        const me = await (await owner.call()).account.me();
        expect(me).toMatchObject({ user: { email } });
        const workspace = await (await owner.call()).account.workspace();
        expect(JSON.stringify(workspace)).toContain("Journey Traders");

        // 5. The admin console tells the whole story.
        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id });
        expect(detail.invitationStatus).toBe("accepted");
        expect(detail.payments!.map(payment => [payment.item, payment.status])).toEqual([["full_report", "confirmed"], ["current_state", "confirmed"]]);
        const actions = detail.stageHistory.map(event => event.action);
        expect(actions.filter(action => action === "payment_confirmed")).toHaveLength(2);
        expect(actions.filter(action => action === "payment_details_sent")).toHaveLength(2);
        // There is no proof-of-payment step any more.
        expect(actions).not.toContain("payment_proof_received");
        expect(actions).toContain("full_report_delivered");
        expect(detail.report).toMatchObject({ status: "delivered" });
      });
    });

    describe("the full report, once paid", () => {
      /** A finished check whose report payment is confirmed; returns the form token from the confirmation email. */
      async function paidReport(label: string) {
        const check = await finishedCheck(label);
        await (await check.visitor.call()).businessCheck.requestNext({ token: check.token, choice: "report" });
        const [payment] = await paymentsOf(check.id);
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: payment.id });
        const confirmation = emails().find(sent => sent.to === check.email && sent.subject === "Payment received: your Full Report")!;
        const link = confirmation.body.match(/Complete your Report Intake: (\S+)/)![1];
        return { ...check, reportToken: decodeURIComponent(link.split("/report/")[1]) };
      }
      const reportRow = async (businessCheckId: number) => (await db.select().from(schema.fullReports).where(eq(schema.fullReports.businessCheckId, businessCheckId)))[0];

      it("sends a single-use form link with the payment confirmation, storing only its hash", async () => {
        const { id, reportToken, email } = await paidReport("report-link");
        const row = await reportRow(id);
        expect(row).toMatchObject({ status: "awaiting_intake", intakeJson: null });
        expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.tokenHash).not.toContain(reportToken);
        expect(await browser().call().then(caller => caller.fullReport.form({ token: reportToken }))).toMatchObject({ status: "awaiting_intake", email });
        await expect((await browser().call()).fullReport.form({ token: "not-a-real-token" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("builds the report from the form and emails the PDF straight away, with nobody in between", async () => {
        const { id, reportToken, email } = await paidReport("report-sent");
        mocked.deliverEmail.mockClear();
        const sent = await (await browser().call()).fullReport.submit({ token: reportToken, intake: sampleIntake });
        expect(sent).toMatchObject({ delivered: true, deliveryStatus: "Simulated" });
        expect(Buffer.from(sent.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");

        const toOwner = emails().find(item => item.to === email)!;
        expect(toOwner.subject).toMatch(/^Your Full Report: /);
        expect(toOwner.sender).toBe("business_support");
        expect(toOwner.body).toContain("FIX THIS FIRST");
        expect(toOwner.attachments).toEqual([expect.objectContaining({ contentType: "application/pdf", filename: expect.stringMatching(/-full-report\.pdf$/) })]);
        expect(toOwner.attachments![0].content.subarray(0, 5).toString()).toBe("%PDF-");
        expect(emails().find(item => item.to === "info@ipfactory.co")!.subject).toMatch(/^Full Report sent: /);

        const row = await reportRow(id);
        expect(row).toMatchObject({ status: "delivered", reportVersion: 4, deliveryStatus: "Simulated" });
        expect(JSON.parse(row.intakeJson)).toEqual(sampleIntake);
        expect(row.deliveredAt).toBeInstanceOf(Date);
        expect(await auditsFor("full_report_delivered", id)).toHaveLength(1);
      });

      it("accepts the form once, then offers the same report to download", async () => {
        const { reportToken } = await paidReport("report-once");
        await (await browser().call()).fullReport.submit({ token: reportToken, intake: sampleIntake });
        await expect((await browser().call()).fullReport.submit({ token: reportToken, intake: { ...sampleIntake, goal: "Something else" } })).rejects.toMatchObject({ code: "CONFLICT" });
        const again = await (await browser().call()).fullReport.download({ token: reportToken });
        expect(Buffer.from(again.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");
        expect((await (await browser().call()).fullReport.form({ token: reportToken })).status).toBe("delivered");
      });

      it("refuses an incomplete form without using up the link", async () => {
        const { id, reportToken } = await paidReport("report-invalid");
        await expect((await browser().call()).fullReport.submit({ token: reportToken, intake: { ...sampleIntake, products: [] } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Add at least one product or service." });
        await expect((await browser().call()).fullReport.submit({ token: reportToken, intake: { ...sampleIntake, topEarner: 2, products: [sampleIntake.products[0]] } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        await expect((await browser().call()).fullReport.download({ token: reportToken })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect((await reportRow(id)).status).toBe("awaiting_intake");
      });

      it("sends a first Report Intake link to a confirmed report payment that has none (a confirmation that failed halfway)", async () => {
        const { id, email, token, visitor } = await finishedCheck("report-recover");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const [payment] = await paymentsOf(id);
        // The state an earlier version could leave behind: confirmed in the database, no full_reports row.
        await db.update(schema.paymentRequests).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(schema.paymentRequests.id, payment.id));
        expect(await reportRow(id)).toBeUndefined();

        mocked.deliverEmail.mockClear();
        expect(await (await superAdmin.call()).businessSupport.resendReportLink({ businessCheckId: id })).toMatchObject({ success: true });
        const resent = emails().find(item => item.to === email && item.subject === "Your Report Intake")!;
        const reportToken = decodeURIComponent(resent.body.match(/Complete your Report Intake: (\S+)/)![1].split("/report/")[1]);
        expect(await reportRow(id)).toMatchObject({ status: "awaiting_intake", paymentRequestId: payment.id });
        expect(await (await browser().call()).fullReport.form({ token: reportToken })).toMatchObject({ status: "awaiting_intake", email });
      });

      it("sends the Report Intake link, not the confirmation, again for a paid report", async () => {
        const { id } = await paidReport("report-confirmation");
        const [payment] = await paymentsOf(id);
        await expect((await superAdmin.call()).businessSupport.resendPaymentConfirmation({ paymentRequestId: payment.id })).rejects.toMatchObject({ code: "CONFLICT", message: "For the Full Report, send the Report Intake link again instead." });
      });

      it("still refuses a link for a report that was never paid for", async () => {
        const { id, token, visitor } = await finishedCheck("report-unpaid");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        await expect((await superAdmin.call()).businessSupport.resendReportLink({ businessCheckId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("lets the team see, download and resend; a resent link replaces the old one", async () => {
        const { id, reportToken, email } = await paidReport("report-admin");
        expect((await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id })).report).toMatchObject({ status: "awaiting_intake" });
        await expect((await superAdmin.call()).businessSupport.downloadReport({ businessCheckId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });

        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).businessSupport.resendReportLink({ businessCheckId: id });
        const resent = emails().find(item => item.to === email && item.subject === "Your Report Intake")!;
        const newToken = decodeURIComponent(resent.body.match(/Complete your Report Intake: (\S+)/)![1].split("/report/")[1]);
        expect(newToken).not.toBe(reportToken);
        await expect((await browser().call()).fullReport.form({ token: reportToken })).rejects.toMatchObject({ code: "NOT_FOUND" });

        await (await browser().call()).fullReport.submit({ token: newToken, intake: sampleIntake });
        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id });
        expect(detail.report).toMatchObject({ status: "delivered", deliveryStatus: "Simulated" });
        expect(detail.stageHistory.map(event => event.action)).toEqual(expect.arrayContaining(["full_report_link_sent", "full_report_delivered"]));
        const pdf = await (await superAdmin.call()).businessSupport.downloadReport({ businessCheckId: id });
        expect(Buffer.from(pdf.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");
        await expect((await superAdmin.call()).businessSupport.resendReportLink({ businessCheckId: id })).rejects.toMatchObject({ code: "CONFLICT" });
      }, 30_000);

      it("keeps the report's admin actions to the right people", async () => {
        const { id } = await paidReport("report-permissions");
        const analyst = await signInStaff(await person({}, ["analyst"]));
        for (const b of [browser(), analyst]) {
          await expect((await b.call()).businessSupport.downloadReport({ businessCheckId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect((await b.call()).businessSupport.resendReportLink({ businessCheckId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      });
    });

    describe("the admin console", () => {
      it("shows each check's payments in the list, the record and its history", async () => {
        const { token, email, visitor, id } = await finishedCheck("console");
        await (await visitor.call()).businessCheck.requestNext({ token, choice: "report" });
        const listed = (await (await superAdmin.call()).businessSupport.checks()).find((row: { email: string }) => row.email === email)!;
        expect(listed.payments).toEqual({ full_report: "requested" });
        const detail = await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id });
        expect(detail.payments).toEqual([expect.objectContaining({ item: "full_report", status: "requested", amountNaira: 100_000 })]);
        expect(detail.stageHistory).toEqual([expect.objectContaining({ action: "payment_details_sent", item: "full_report", reference: `TS-R-${String(id).padStart(6, "0")}`, by: null })]);
      });

      it("lets finance and the Super Admin handle payments, and refuses everyone else", async () => {
        const { id } = await finishedCheck("permissions");
        const finance = await signInStaff(await person({}, ["finance"]));
        const { paymentRequestId } = await (await finance.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect(paymentRequestId).toBeGreaterThan(0);
        await expect((await finance.call()).businessSupport.setStage({ businessCheckId: id, stage: "lost" })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const client = await person();
        const business = (await db.insert(schema.businesses).values({ name: "Client Co", slug: unique("slug"), createdByUserId: client.id }).returning())[0];
        await db.insert(schema.businessMemberships).values({ businessId: business.id, userId: client.id, role: "owner" });
        const clientSession = browser();
        await (await clientSession.call()).account.signIn({ email: client.email, password: PASSWORD });
        const bareAdmin = await signInStaff(await person({}, ["admin"]));
        const analyst = await signInStaff(await person({}, ["analyst"]));
        for (const b of [clientSession, browser(), bareAdmin, analyst]) {
          await expect((await b.call()).businessSupport.requestPayment({ businessCheckId: id, item: "full_report" })).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect((await b.call()).businessSupport.confirmPayment({ paymentRequestId })).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        expect((await paymentsOf(id))[0]).toMatchObject({ status: "requested" });
      });

      it("refuses an unknown check or payment", async () => {
        await expect((await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: 2_000_000_000, item: "full_report" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: 2_000_000_000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: 1, item: "fix" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      });
    });
  });
}
