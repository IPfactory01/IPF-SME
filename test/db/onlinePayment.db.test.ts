/**
 * Paying online with Paystack: the pay page, opening a transaction, and confirming it from Paystack's signed webhook
 * or the owner's return page through the same path the team uses for bank transfers. Real application code on
 * PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`). Paystack is a fake behind a stubbed
 * `fetch`: nothing leaves the process. Email and the language model are stubbed.
 */
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { createPgliteHarness, createRemoteHarness, type DbHarness } from "./harness";
import { businessCheckProfiles, profileContact } from "../fixtures/businessCheckProfiles";

/** Fixture keys: shaped like Paystack's, never real. */
const TEST_KEY = "sk_test_fixture_not_a_real_key";
const LIVE_KEY = "sk_live_fixture_not_a_real_key";

const holder = vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://contract:contract@localhost:5432/contract";
  return { current: null as unknown as Record<string, unknown> };
});
const mocked = vi.hoisted(() => ({ deliverEmail: vi.fn() }));
type FakeTransaction = { reference: string; status: string; amount: number; currency: string };
const paystack = vi.hoisted(() => ({
  initialized: [] as Array<Record<string, unknown>>,
  transactions: new Map<string, FakeTransaction>(),
  verifications: 0,
  down: false,
}));

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
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key", calendlyApiToken: "", paystackSecretKey: "sk_test_fixture_not_a_real_key" } }));

import { appRouter } from "@server/routers";
import { createContext } from "@server/_core/context";
import { ENV } from "@server/_core/env";
import { resetBusinessCheckRateLimitsForTests } from "@server/routers/businessCheck";
import { hashAdminPassword, OWNER_ADMIN_EMAIL } from "@server/adminSecurity";
import { handlePaystackWebhook } from "@server/onlinePayment";
import { EMAIL_TEST_NOTICE } from "@server/payments";
import { ACCOUNT_SESSION_COOKIE } from "@shared/auth";
import { cleanAnswers } from "@shared/businessCheck/engine";
import type { TrpcContext } from "@server/_core/context";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Paystack as far as the server uses it: open a transaction, verify one. Anything else is a test failure. */
async function fakePaystack(input: string | URL | Request, init?: RequestInit) {
  const url = String(input);
  if (paystack.down) throw new TypeError("fetch failed");
  const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
  if (!/^Bearer sk_(test|live)_/.test(auth)) return json(401, { status: false, message: "Invalid key" });
  if (url === "https://api.paystack.co/transaction/initialize" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown> & { reference: string; amount: number; currency: string };
    paystack.initialized.push(body);
    paystack.transactions.set(body.reference, { reference: body.reference, status: "abandoned", amount: body.amount, currency: body.currency });
    return json(200, { status: true, message: "Authorization URL created", data: { authorization_url: `https://checkout.paystack.com/${body.reference}`, access_code: "fixture", reference: body.reference } });
  }
  const verify = /^https:\/\/api\.paystack\.co\/transaction\/verify\/(.+)$/.exec(url);
  if (verify && init?.method === "GET") {
    paystack.verifications += 1;
    const transaction = paystack.transactions.get(decodeURIComponent(verify[1]));
    return transaction
      ? json(200, { status: true, message: "Verification successful", data: { ...transaction, domain: "test", customer: { email: "someone@example.com" } } })
      : json(400, { status: false, message: "Transaction reference not found" });
  }
  throw new Error(`A test made an unexpected request: ${url}`);
}

const REMOTE_TEST_TIMEOUT_MS = 90_000;
const targets = [
  { name: "PGlite", enabled: true, timeout: undefined, make: () => createPgliteHarness() },
  { name: "TEST_DATABASE_URL", enabled: Boolean(process.env.TEST_DATABASE_URL), timeout: REMOTE_TEST_TIMEOUT_MS, make: () => createRemoteHarness(process.env.TEST_DATABASE_URL!) },
];

let counter = 0;
const unique = (label: string) => `${label}-${(counter += 1)}-${Math.random().toString(36).slice(2, 8)}`;
const uniqueEmail = (label: string) => `${unique(label)}@example.test`;
const PASSWORD = "correct horse 42";
const OFFICE = "info@ipfactory.co";

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
type EmailCall = { to: string; subject: string; body: string; idempotencyKey?: string };

const completeAnswers = cleanAnswers(businessCheckProfiles.growingMaker);
const sign = (raw: Buffer, key: string) => createHmac("sha512", key).update(raw).digest("hex");

for (const target of targets) {
  describe.skipIf(!target.enabled)(`Paying online with Paystack on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
    let harness: DbHarness;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any;
    let superAdmin: Browser;
    let ownerId: number;
    const passwordHash = hashAdminPassword(PASSWORD);

    const rowFor = async (token: string) => (await db.select().from(schema.businessChecks).where(eq(schema.businessChecks.publicToken, token)))[0];
    const paymentOf = async (businessCheckId: number, item: "full_report" | "current_state") =>
      (await db.select().from(schema.paymentRequests).where(and(eq(schema.paymentRequests.businessCheckId, businessCheckId), eq(schema.paymentRequests.item, item))))[0];
    const emails = (): EmailCall[] => mocked.deliverEmail.mock.calls.map(call => call[0] as EmailCall);
    const auditsFor = async (action: string, businessCheckId: number) =>
      db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, action), sql`${schema.adminAccessAuditEvents.details}::jsonb ->> 'businessCheckId' = ${String(businessCheckId)}`));
    const details = (rows: Array<{ details: string }>) => rows.map(row => JSON.parse(row.details));

    async function finishedCheck(label: string) {
      const visitor = browser();
      const email = uniqueEmail(label);
      const contact = profileContact("Payer");
      const { token } = await (await visitor.call()).businessCheck.start({ fullName: `Ada ${label}`, email, whatsapp: "+2348000000001" });
      await (await visitor.call()).businessCheck.submit({ token, answers: { ...completeAnswers, p_name: `${contact.businessName} ${label}` } });
      const id = (await rowFor(token)).id as number;
      return { token, email, visitor, id };
    }
    /** A finished check whose owner asked for the Full Report: the payment details have gone out. */
    async function reportAskedFor(label: string) {
      const check = await finishedCheck(label);
      await (await check.visitor.call()).businessCheck.requestNext({ token: check.token, choice: "report" });
      return check;
    }
    /** A finished check the team sent the Current State Assessment payment details to. */
    async function assessmentAskedFor(label: string) {
      const check = await finishedCheck(label);
      await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: check.id, item: "current_state" });
      return check;
    }
    /** The owner presses the pay button; returns the attempt's Paystack reference. */
    async function start(token: string, item: "full_report" | "current_state") {
      const result = await (await browser().call()).onlinePayment.start({ token, item });
      if (result.alreadyPaid) throw new Error("Already paid");
      return paystack.initialized.at(-1)!.reference as string;
    }
    /** The owner completes the payment on Paystack's page. */
    const pay = (reference: string, overrides: Partial<FakeTransaction> = {}) => {
      paystack.transactions.set(reference, { ...paystack.transactions.get(reference)!, status: "success", ...overrides });
    };
    /** Paystack posts a signed event to the webhook; returns the HTTP status the handler answered. */
    async function webhook(payload: unknown, signWith: string = ENV.paystackSecretKey) {
      const raw = Buffer.from(JSON.stringify(payload));
      const res = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, json() { return this; } };
      await handlePaystackWebhook({ body: raw, headers: { "x-paystack-signature": sign(raw, signWith) } } as never, res as never);
      return res.statusCode;
    }
    const charged = (reference: string) => ({ event: "charge.success", data: { reference, status: "success", amount: 1, currency: "NGN" } });
    const returnPage = async (reference: string) => (await browser().call()).onlinePayment.status({ reference });

    /** Holds every transaction until released, so two confirmations both read the payment before either writes. */
    function holdTransactions() {
      const real = harness.db as unknown as Record<string, unknown> & { transaction: (fn: unknown) => Promise<unknown> };
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      holder.current = new Proxy(real, { get: (targetDb, property) => (property === "transaction" ? (fn: unknown) => gate.then(() => real.transaction.call(targetDb, fn)) : Reflect.get(targetDb, property)) });
      return { release: () => { holder.current = real; release(); } };
    }
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
      ownerId = owner.id;
      await db.insert(schema.userCredentials).values({ userId: owner.id, passwordHash }).onConflictDoNothing();
      superAdmin = browser();
      await (await superAdmin.call()).account.signInInternal({ email: owner.email, password: PASSWORD });
      vi.stubGlobal("fetch", fakePaystack);
    }, 120_000);
    afterAll(async () => {
      vi.unstubAllGlobals();
      await harness?.close();
    });
    beforeEach(() => {
      ENV.paystackSecretKey = TEST_KEY;
      paystack.initialized.length = 0;
      paystack.verifications = 0;
      paystack.down = false;
      resetBusinessCheckRateLimitsForTests();
      mocked.deliverEmail.mockReset();
      mocked.deliverEmail.mockResolvedValue({ status: "Simulated", reason: "test_sender" });
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    describe("the payment details email and the pay page", () => {
      it("emails a Pay online button to the pay page, keyed by the check's token, with the test-mode line", async () => {
        const { token, email } = await reportAskedFor("email-link");
        const details = emails().find(sent => sent.to === email && sent.subject === "Payment details for your Full Report")!;
        expect(details.body).toContain(`Pay online: http://localhost:3000/pay/${encodeURIComponent(token)}/full_report`);
        expect(details.body).toContain(EMAIL_TEST_NOTICE);
        // Paystack is the only way to pay: no bank details, nothing to send back.
        expect(details.body).not.toMatch(/BANK TRANSFER|Bank:|Account number|proof of payment/);
      });

      it("shows the item, the amount on the payment request, the mode and where it stands, and nothing else", async () => {
        const { token, id } = await reportAskedFor("page");
        expect(await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).toEqual({ item: "full_report", name: "Full Report", amountNaira: 100_000, mode: "test", state: "open" });
        await db.update(schema.paymentRequests).set({ status: "proof_received" }).where(eq(schema.paymentRequests.id, (await paymentOf(id, "full_report")).id));
        // An old record that noted proof of a bank transfer can still be paid online.
        expect((await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).state).toBe("open");
        ENV.paystackSecretKey = "";
        expect((await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).mode).toBe("off");
      });

      it("answers NOT_FOUND for an unknown token, or an item with no payment details sent", async () => {
        const { token } = await reportAskedFor("not-found");
        await expect((await browser().call()).onlinePayment.page({ token: "x".repeat(32), item: "full_report" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await browser().call()).onlinePayment.page({ token, item: "current_state" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await browser().call()).onlinePayment.start({ token: "x".repeat(32), item: "full_report" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(paystack.initialized).toHaveLength(0);
      });
    });

    describe("paying from the summary email", () => {
      const summaryOf = (email: string) => emails().find(sent => sent.to === email && sent.subject === "Your Business Check: Findings")!;

      it("links the Full Report in the summary email straight to the pay page while Paystack is on", async () => {
        const { token, email } = await finishedCheck("summary-link");
        const body = summaryOf(email).body;
        expect(body).toContain(`Pay for your Full Report: http://localhost:3000/pay/${encodeURIComponent(token)}/full_report`);
        expect(body).not.toContain('Reply "report"');
        expect(body).toContain("Online payment is in Paystack's test mode while we test it, so paying online moves no real money.");
      });

      it("promises a link, and offers no bank details, while Paystack is off", async () => {
        ENV.paystackSecretKey = "";
        const { email } = await finishedCheck("summary-off");
        const body = summaryOf(email).body;
        expect(body).toContain('Online payment opens soon: reply "report" and we will email you a link to pay when it does.');
        expect(body).not.toContain("/pay/");
        expect(body).not.toMatch(/bank/i);
      });

      it("works before the owner has asked: the page offers ₦100,000, and paying files the request as the result page does, once", async () => {
        const { token, email, id } = await finishedCheck("self-serve");
        expect(await paymentOf(id, "full_report")).toBeUndefined();
        expect(await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).toEqual({ item: "full_report", name: "Full Report", amountNaira: 100_000, mode: "test", state: "open" });
        mocked.deliverEmail.mockClear();

        const reference = await start(token, "full_report");
        const request = await paymentOf(id, "full_report");
        expect(request).toMatchObject({ status: "requested", amountNaira: 100_000, requestedByUserId: null });
        expect(reference).toMatch(new RegExp(`^${request.reference}-[0-9a-f]{8}$`));
        expect(paystack.initialized.at(-1)).toMatchObject({ email, amount: 10_000_000, currency: "NGN" });
        expect((await rowFor(token)).reportRequestedAt).toBeInstanceOf(Date);
        // The same as "Get my Full Report" on the result page: the details by email (the reference and the bank
        // transfer fallback), and one notice to the office.
        expect(emails().filter(sent => sent.to === email).map(sent => sent.subject)).toEqual(["Payment details for your Full Report"]);
        const office = emails().filter(sent => sent.to === OFFICE);
        expect(office).toHaveLength(1);
        expect(office[0].subject).toMatch(/asked for the Full Report$/);
        expect(office[0].body).toContain("Note: Started paying online from the link in their Business Check summary email.");
        expect(office[0].body).toContain(`Payment details sent: ${request.reference}`);

        // A second try opens Paystack again without filing or emailing anything new.
        mocked.deliverEmail.mockClear();
        await start(token, "full_report");
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
        expect(await auditsFor("payment_details_sent", id)).toHaveLength(1);
      });

      it("never starts the Current State Assessment from the owner's side, nor a report for an unfinished check", async () => {
        const { token } = await finishedCheck("no-self-assessment");
        await expect((await browser().call()).onlinePayment.page({ token, item: "current_state" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await browser().call()).onlinePayment.start({ token, item: "current_state" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        const visitor = browser();
        const { token: unfinished } = await (await visitor.call()).businessCheck.start({ fullName: "Ada Unfinished", email: uniqueEmail("unfinished"), whatsapp: "+2348000000001" });
        await expect((await browser().call()).onlinePayment.page({ token: unfinished, item: "full_report" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await browser().call()).onlinePayment.start({ token: unfinished, item: "full_report" })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(paystack.initialized).toHaveLength(0);
      });
    });

    describe("starting a payment", () => {
      it("opens Paystack for the amount in the database, never one from the browser, with the owner's email and our return page", async () => {
        const { token, email, id } = await reportAskedFor("start");
        const request = await paymentOf(id, "full_report");
        // A stored amount that differs from today's price shows the amount is read from the row.
        await db.update(schema.paymentRequests).set({ amountNaira: 123_456 }).where(eq(schema.paymentRequests.id, request.id));
        const caller = await browser().call();
        const result = await caller.onlinePayment.start({ token, item: "full_report", amount: 1, amountNaira: 1 } as never);
        expect(result).toEqual({ alreadyPaid: false, url: expect.stringMatching(/^https:\/\/checkout\.paystack\.com\/TS-R-\d{6}-[0-9a-f]{8}$/) });
        const [opened] = paystack.initialized;
        expect(opened).toEqual({
          email,
          amount: 12_345_600,
          currency: "NGN",
          reference: expect.stringMatching(new RegExp(`^${request.reference}-[0-9a-f]{8}$`)),
          callback_url: "http://localhost:3000/pay/return",
          metadata: { paymentRequestId: request.id, businessCheckId: id, item: "full_report" },
        });
        // Each attempt has its own reference: Paystack refuses one twice, and an owner may abandon a first try.
        await caller.onlinePayment.start({ token, item: "full_report" });
        expect(paystack.initialized[1].reference).not.toBe(opened.reference);
      });

      it("refuses while online payment is off, without calling Paystack", async () => {
        const { token } = await reportAskedFor("off");
        ENV.paystackSecretKey = "";
        await expect((await browser().call()).onlinePayment.start({ token, item: "full_report" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("Online payment is not open yet") });
        expect(paystack.initialized).toHaveLength(0);
      });

      it("says it is already paid once the payment is confirmed, without calling Paystack", async () => {
        const { token, id } = await reportAskedFor("already");
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: (await paymentOf(id, "full_report")).id });
        expect(await (await browser().call()).onlinePayment.start({ token, item: "full_report" })).toEqual({ alreadyPaid: true });
        expect(paystack.initialized).toHaveLength(0);
        expect((await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).state).toBe("paid");
      });

      it("holds the Current State Assessment link for the same 48 hours as the bank details, and opens again when the team sends them again", async () => {
        const { token, id } = await assessmentAskedFor("expired");
        await db.update(schema.paymentRequests).set({ requestedAt: new Date(Date.now() - 49 * 3_600_000) }).where(eq(schema.paymentRequests.id, (await paymentOf(id, "current_state")).id));
        expect((await (await browser().call()).onlinePayment.page({ token, item: "current_state" })).state).toBe("expired");
        await expect((await browser().call()).onlinePayment.start({ token, item: "current_state" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("48 hours") });
        await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: id, item: "current_state" });
        expect((await (await browser().call()).onlinePayment.start({ token, item: "current_state" })).alreadyPaid).toBe(false);
      });

      it("reopens an expired Full Report link by itself when the owner pays: a new 48 hours and fresh details by email", async () => {
        const { token, email, id } = await reportAskedFor("expired-report");
        const before = await paymentOf(id, "full_report");
        await db.update(schema.paymentRequests).set({ requestedAt: new Date(Date.now() - 49 * 3_600_000) }).where(eq(schema.paymentRequests.id, before.id));
        // The owner chooses the report themselves, so the link in their summary email never dead-ends.
        expect((await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).state).toBe("open");
        mocked.deliverEmail.mockClear();
        expect((await (await browser().call()).onlinePayment.start({ token, item: "full_report" })).alreadyPaid).toBe(false);
        const after = await paymentOf(id, "full_report");
        expect(after.reference).toBe(before.reference);
        expect(after.requestedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
        expect(emails().filter(sent => sent.to === email).map(sent => sent.subject)).toEqual(["Payment details for your Full Report"]);
        expect(paystack.initialized.at(-1)!.reference).toMatch(new RegExp(`^${before.reference}-[0-9a-f]{8}$`));
      });
    });

    describe("confirming a payment", () => {
      it("confirms the Full Report from the webhook with the same effects as the team's confirmation, as the system actor", async () => {
        const { token, email, id } = await reportAskedFor("webhook-report");
        const reference = await start(token, "full_report");
        pay(reference);
        mocked.deliverEmail.mockClear();
        expect(await webhook(charged(reference))).toBe(200);

        const request = await paymentOf(id, "full_report");
        expect(request).toMatchObject({ status: "confirmed", confirmedByUserId: null, note: `TEST: Paid online with Paystack, reference ${reference}` });
        // The same as "Confirm payment": the Report Intake link, issued once, in the owner's confirmation email.
        const receipt = emails().find(sent => sent.to === email)!;
        expect(receipt.subject).toBe("Payment received: your Full Report");
        expect(receipt.body).toMatch(/Complete your Report Intake: https?:\/\/\S+\/report\/\S+/);
        expect(receipt.body).toContain(EMAIL_TEST_NOTICE);
        expect(await db.select().from(schema.fullReports).where(eq(schema.fullReports.businessCheckId, id))).toHaveLength(1);
        // Audited as the system actor, with how the money arrived.
        const [audit] = await auditsFor("payment_confirmed", id);
        expect(audit.actorUserId).toBeNull();
        expect(JSON.parse(audit.details)).toMatchObject({ item: "full_report", reference: request.reference, via: "paystack", paystackReference: reference, mode: "test", note: request.note });
        expect(details(await auditsFor("payment_confirmation_sent", id))).toEqual([expect.objectContaining({ via: "paystack", again: false })]);
        // Nobody pressed a button, so the office is told.
        const office = emails().find(sent => sent.to === OFFICE)!;
        expect(office.subject).toMatch(/^TEST: Paid online: .+, Full Report$/);
        expect(office.body).toContain(`Paystack reference: ${reference}`);
        // The console names Paystack in the history.
        const history = (await (await superAdmin.call()).businessSupport.checkDetail({ businessCheckId: id })).stageHistory;
        expect(history.find(event => event.action === "payment_confirmed")).toMatchObject({ via: "paystack", by: null, note: request.note });
        // The return page then shows it paid, with nothing else.
        expect(await returnPage(reference)).toEqual({ status: "paid", item: "full_report", mode: "test" });
        expect((await (await browser().call()).onlinePayment.page({ token, item: "full_report" })).state).toBe("paid");
      });

      it("confirms the Current State Assessment from the return page in live mode: Won, the engagement and the invitation", async () => {
        ENV.paystackSecretKey = LIVE_KEY;
        const { token, email, id } = await assessmentAskedFor("return-assessment");
        const reference = await start(token, "current_state");
        expect(paystack.initialized[0].amount).toBe(50_000_000);
        pay(reference);
        mocked.deliverEmail.mockClear();

        expect(await returnPage(reference)).toEqual({ status: "paid", item: "current_state", mode: "live" });
        expect(await paymentOf(id, "current_state")).toMatchObject({ status: "confirmed", confirmedByUserId: null, note: `Paid online with Paystack, reference ${reference}` });
        expect((await rowFor(token)).pipelineStage).toBe("won");
        expect(await db.select().from(schema.engagements).where(eq(schema.engagements.businessCheckId, id))).toHaveLength(1);
        const invitations = await db.select().from(schema.clientOnboardingInvitations).where(eq(schema.clientOnboardingInvitations.businessCheckId, id));
        // The invitation row needs a person: it is recorded against whoever sent the payment details.
        expect(invitations).toEqual([expect.objectContaining({ status: "pending", createdByUserId: ownerId })]);
        expect(emails().filter(sent => sent.to === email).map(sent => sent.subject)).toEqual(["Payment received: your Current State Assessment starts", "Set up your client account on The Shift"]);
        expect(emails().find(sent => sent.to === email)!.body).not.toContain("TEST MODE");
        const invited = await db.select().from(schema.adminAccessAuditEvents).where(and(eq(schema.adminAccessAuditEvents.action, "client_onboarding_invitation_created"), sql`${schema.adminAccessAuditEvents.details}::jsonb ->> 'businessCheckId' = ${String(id)}`));
        expect(invited).toEqual([expect.objectContaining({ actorUserId: null })]);
        expect(JSON.parse(invited[0].details)).toMatchObject({ via: "paystack", recordedAgainstUserId: ownerId, paid: true });
        expect(details(await auditsFor("payment_confirmed", id))).toEqual([expect.objectContaining({ via: "paystack", mode: "live", from: "opportunity", to: "won" })]);
        const office = emails().find(sent => sent.to === OFFICE)!;
        expect(office.subject).toMatch(/^Paid online: /);
        expect(office.body).toContain("Client account invitation: sent");
      });

      it("says TEST MODE again when the team re-sends the confirmation of a test payment", async () => {
        const { token, email, id } = await assessmentAskedFor("resend-test");
        const reference = await start(token, "current_state");
        pay(reference);
        expect(await webhook(charged(reference))).toBe(200);
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).businessSupport.resendPaymentConfirmation({ paymentRequestId: (await paymentOf(id, "current_state")).id });
        const again = emails().find(sent => sent.to === email)!;
        expect(again.subject).toBe("Payment received: your Current State Assessment starts");
        expect(again.body).toContain(EMAIL_TEST_NOTICE);
      });

      it("confirms once and sends one email when Paystack sends the same event again", async () => {
        const { token, email, id } = await reportAskedFor("repeat");
        const reference = await start(token, "full_report");
        pay(reference);
        mocked.deliverEmail.mockClear();
        expect(await webhook(charged(reference))).toBe(200);
        const asked = paystack.verifications;
        expect(await webhook(charged(reference))).toBe(200);
        expect(await webhook(charged(reference))).toBe(200);
        // A repeat of a payment already confirmed by it needs no question to Paystack.
        expect(paystack.verifications).toBe(asked);
        expect(emails().filter(sent => sent.to === email)).toHaveLength(1);
        expect(emails().filter(sent => sent.to === OFFICE)).toHaveLength(1);
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(1);
      });

      it("confirms once, with one email, when the webhook and the return page arrive together", async () => {
        const { token, email, id } = await reportAskedFor("race");
        const reference = await start(token, "full_report");
        pay(reference);
        mocked.deliverEmail.mockClear();
        const [status, page] = await together<unknown>([() => webhook(charged(reference)), () => returnPage(reference)]);
        expect(status).toBe(200);
        expect(page).toEqual({ status: "paid", item: "full_report", mode: "test" });
        expect(emails().filter(sent => sent.to === email)).toHaveLength(1);
        expect(emails().filter(sent => sent.to === OFFICE)).toHaveLength(1);
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(1);
        expect(await auditsFor("payment_online_refused", id)).toHaveLength(0);
        expect(await db.select().from(schema.fullReports).where(eq(schema.fullReports.businessCheckId, id))).toHaveLength(1);
      });

      it("leaves a payment the team already confirmed by hand untouched, and tells the office it may have been paid twice", async () => {
        const { token, email, id } = await reportAskedFor("manual-first");
        const reference = await start(token, "full_report");
        pay(reference);
        const request = await paymentOf(id, "full_report");
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id, note: "GTB ref 123456" });
        mocked.deliverEmail.mockClear();

        expect(await webhook(charged(reference))).toBe(200);
        expect(await paymentOf(id, "full_report")).toMatchObject({ status: "confirmed", note: "GTB ref 123456", confirmedByUserId: ownerId });
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(1);
        expect(emails().filter(sent => sent.to === email)).toHaveLength(0);
        const office = emails().find(sent => sent.to === OFFICE)!;
        expect(office.subject).toBe(`Paystack payment needs a look: ${request.reference}`);
        expect(office.body).toContain("This item was already paid, so this may be a second payment for it.");
        expect(details(await auditsFor("payment_online_refused", id))).toEqual([expect.objectContaining({ problem: "paid_twice", paystackReference: reference })]);
        expect(await returnPage(reference)).toMatchObject({ status: "paid" });
      });
    });

    describe("refusing what does not match", () => {
      async function attempt(label: string) {
        const check = await reportAskedFor(label);
        const reference = await start(check.token, "full_report");
        mocked.deliverEmail.mockClear();
        return { ...check, reference };
      }
      const unconfirmed = async (id: number) => {
        expect(await paymentOf(id, "full_report")).toMatchObject({ status: "requested", confirmedAt: null, note: null });
        expect(await auditsFor("payment_confirmed", id)).toHaveLength(0);
        expect(await db.select().from(schema.fullReports).where(eq(schema.fullReports.businessCheckId, id))).toHaveLength(0);
      };

      it("refuses an amount that is not the request's own, tells the office, and shows the owner it is still being checked", async () => {
        const { reference, id, email } = await attempt("amount");
        pay(reference, { amount: 9_999_900 });
        expect(await webhook(charged(reference))).toBe(200);
        await unconfirmed(id);
        expect(emails().filter(sent => sent.to === email)).toHaveLength(0);
        expect(emails().find(sent => sent.to === OFFICE)!.body).toContain("The amount does not match: ₦99,999 paid, ₦100,000 expected.");
        expect(details(await auditsFor("payment_online_refused", id))).toEqual([expect.objectContaining({ problem: "amount", via: "paystack", amountKobo: 9_999_900 })]);
        // Money moved, so the owner is not told to pay again.
        expect(await returnPage(reference)).toEqual({ status: "pending", item: "full_report", mode: "test" });
        await unconfirmed(id);
      });

      it("refuses another currency", async () => {
        const { reference, id } = await attempt("currency");
        pay(reference, { currency: "USD" });
        expect(await webhook(charged(reference))).toBe(200);
        await unconfirmed(id);
        expect(details(await auditsFor("payment_online_refused", id))).toEqual([expect.objectContaining({ problem: "currency" })]);
      });

      it("refuses a reference that is not the request's own: a lookalike, or one Paystack reports differently", async () => {
        const { reference, id } = await attempt("prefix");
        const request = await paymentOf(id, "full_report");
        // A lookalike reference names no payment request: ignored.
        const lookalike = `${request.reference}0-1a2b3c4d`;
        paystack.transactions.set(lookalike, { reference: lookalike, status: "success", amount: 10_000_000, currency: "NGN" });
        expect(await webhook(charged(lookalike))).toBe(200);
        // Paystack answering for a different reference than the one asked about: not believed.
        paystack.transactions.set(reference, { reference: "TS-R-999999-1a2b3c4d", status: "success", amount: 10_000_000, currency: "NGN" });
        expect(await webhook(charged(reference))).toBe(200);
        expect(await returnPage(reference)).toMatchObject({ status: "failed" });
        await unconfirmed(id);
        // It names no payment request, and answers like any reference that did not pay: nothing about what exists.
        expect(await returnPage(lookalike)).toMatchObject({ status: "failed" });
        await unconfirmed(id);
      });

      it("confirms nothing that Paystack has not settled as a success", async () => {
        const { reference, id } = await attempt("not-success");
        pay(reference, { status: "failed" });
        expect(await webhook(charged(reference))).toBe(200);
        expect(await returnPage(reference)).toEqual({ status: "failed", item: "full_report", mode: "test" });
        pay(reference, { status: "ongoing" });
        expect(await returnPage(reference)).toEqual({ status: "pending", item: "full_report", mode: "test" });
        paystack.transactions.set(reference, { ...paystack.transactions.get(reference)!, status: "abandoned" });
        expect(await returnPage(reference)).toMatchObject({ status: "failed" });
        await unconfirmed(id);
        expect(await auditsFor("payment_online_refused", id)).toHaveLength(0);
        expect(mocked.deliverEmail).not.toHaveBeenCalled();
      });

      it("ignores a bad signature, other events and unknown references, and changes nothing", async () => {
        const { reference, id } = await attempt("ignored");
        pay(reference);
        expect(await webhook(charged(reference), "sk_test_another_fixture")).toBe(401);
        expect(await webhook({ event: "transfer.success", data: { reference } })).toBe(200);
        expect(await webhook({ event: "charge.success", data: {} })).toBe(200);
        expect(await webhook(charged("jump_ref_123"))).toBe(200);
        await unconfirmed(id);
        expect(paystack.verifications).toBe(0);
      });

      it("asks Paystack to send it again when Paystack cannot be reached, and confirms on the next delivery", async () => {
        const { reference, id } = await attempt("retry");
        pay(reference);
        paystack.down = true;
        expect(await webhook(charged(reference))).toBe(500);
        await unconfirmed(id);
        // The return page does not fail either: it says it is still confirming.
        expect(await returnPage(reference)).toMatchObject({ status: "pending" });
        paystack.down = false;
        expect(await webhook(charged(reference))).toBe(200);
        expect((await paymentOf(id, "full_report")).status).toBe("confirmed");
      });
    });

    describe("the return page", () => {
      it("answers only paid, pending or failed, the item and the mode: no names, emails or amounts", async () => {
        const { token } = await reportAskedFor("fields");
        const reference = await start(token, "full_report");
        const answer = await returnPage(reference);
        expect(Object.keys(answer).sort()).toEqual(["item", "mode", "status"]);
        expect(answer).toEqual({ status: "failed", item: "full_report", mode: "test" });
      });

      it("never tells a stranger whether a payment was made: a guessed reference answers the same for paid and unpaid", async () => {
        // Request references are sequential (TS-R-000123), so anyone can guess one and invent an attempt suffix.
        const paid = await reportAskedFor("probe-paid");
        const unpaid = await reportAskedFor("probe-unpaid");
        const real = await start(paid.token, "full_report");
        pay(real);
        expect(await returnPage(real)).toMatchObject({ status: "paid" });
        const paidRef = (await paymentOf(paid.id, "full_report")).reference;
        const unpaidRef = (await paymentOf(unpaid.id, "full_report")).reference;

        for (const reference of [paidRef, unpaidRef]) expect(await returnPage(`${reference}-0badc0de`)).toEqual({ status: "failed", item: "full_report", mode: "test" });
        // A request number with no payment request at all answers the same, so existence is not revealed either.
        expect(await returnPage("TS-R-999998-0badc0de")).toEqual({ status: "failed", item: "full_report", mode: "test" });
        paystack.down = true;
        for (const reference of [paidRef, unpaidRef]) expect(await returnPage(`${reference}-0badc0d1`)).toMatchObject({ status: "pending" });
        expect(await returnPage(real)).toMatchObject({ status: "paid" });
        paystack.down = false;
        ENV.paystackSecretKey = "";
        for (const reference of [paidRef, unpaidRef]) expect(await returnPage(`${reference}-0badc0d2`)).toMatchObject({ status: "pending" });
        // The owner's own reference still reads as paid, without asking Paystack.
        expect(await returnPage(real)).toMatchObject({ status: "paid" });
      });

      it("answers NOT_FOUND for a reference that is not shaped like ours, and pending while Paystack is off", async () => {
        await expect(returnPage("not-a-reference")).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(returnPage("TS-X-000001-1a2b3c4d")).rejects.toMatchObject({ code: "NOT_FOUND" });
        const { token } = await reportAskedFor("status-off");
        const reference = await start(token, "full_report");
        pay(reference);
        ENV.paystackSecretKey = "";
        expect(await returnPage(reference)).toEqual({ status: "pending", item: "full_report", mode: "off" });
        expect(paystack.verifications).toBe(0);
      });
    });
  });
}
