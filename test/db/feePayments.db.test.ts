/**
 * Paying an engagement fee online (R11): the fee's signed pay link, opening a Paystack transaction for the fee's amount,
 * and confirming it from the signed webhook or the return page; the first payment opens a room that waited for it. Real
 * application code on PostgreSQL (PGlite on every run, plus TEST_DATABASE_URL via `pnpm test:db`). Paystack is a fake
 * behind a stubbed `fetch`: nothing leaves the process. Email and the language model are stubbed.
 */
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@server/_core/env", async importOriginal => ({ ENV: { ...(await importOriginal<typeof import("@server/_core/env")>()).ENV, forgeApiKey: "test-key", calendlyApiToken: "", paystackSecretKey: "sk_test_fixture_not_a_real_key", cookieSecret: "fixture-cookie-secret-for-fee-links" } }));

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
  describe.skipIf(!target.enabled)(`Paying engagement fees online on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
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
    /** A finished check the team sent the Business Review payment details to. */
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

    const feesOf = async (engagementId: number) => db.select().from(schema.engagementFeeLines).where(eq(schema.engagementFeeLines.engagementId, engagementId)).orderBy(schema.engagementFeeLines.sortOrder);
    const engagementRow = async (engagementId: number) => (await db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)))[0];
    /** A Digital marketing client opened by the desk, who has accepted their invitation. */
    async function digitalClient(label: string) {
      const email = uniqueEmail(label);
      const opened = await (await superAdmin.call()).engagement.staff.createDirect({ type: "digital_marketing", businessName: `Studio ${label}`, contactName: `Funmi ${label}`, contactEmail: email, startedOn: "2026-11-09" });
      const owner = browser();
      await (await owner.call()).invitations.accept({ token: decodeURIComponent(opened.invitationUrl!.split("/join/")[1]), email, fullName: `Funmi ${label}`, password: PASSWORD, confirmPassword: PASSWORD });
      return { email, owner, engagementId: opened.engagementId };
    }
    const linkParts = (payPath: string) => { const [, , , id, token] = payPath.split("/"); return { feeLineId: Number(id), token: token! }; };

    describe("the first payment opens the room", () => {
      it("shows the client only the first fee to pay, takes it through Paystack, and opens the room once Paystack confirms it", async () => {
        const { email, owner, engagementId } = await digitalClient("first-pay");
        expect(await engagementRow(engagementId)).toMatchObject({ opensOnPayment: true });
        let room = (await (await owner.call()).engagement.client.room())!;
        expect(room.awaitingPayment).toBe(true);
        expect(room.fees.map(fee => [fee.label, fee.amount, fee.paid])).toEqual([["Month 1 service fee, payable on starting", 470000, false], ["Month 2 service fee, payable before day 31", 470000, false], ["Month 3 service fee, payable before day 61", 470000, false]]);
        const first = room.fees[0]!;
        expect(first.payPath).toMatch(/^\/pay\/fee\/\d+\/[A-Za-z0-9_-]{32}$/);
        const link = linkParts(first.payPath!);

        // The pay page answers only with the right token, and the amount comes from the fee line.
        await expect((await browser().call()).onlinePayment.feePage({ feeLineId: link.feeLineId, token: "x".repeat(32) })).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect((await browser().call()).onlinePayment.feePage({ feeLineId: link.feeLineId + 1, token: link.token })).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ businessName: "Studio first-pay", engagement: "Digital Marketing", amountNaira: 470000, state: "open", mode: "test", reference: first.reference });
        const started = await (await browser().call()).onlinePayment.feeStart(link);
        expect(started).toMatchObject({ alreadyPaid: false, url: expect.stringContaining("https://checkout.paystack.com/") });
        const attempt = paystack.initialized.at(-1)!;
        expect(attempt).toMatchObject({ email, amount: 47000000, currency: "NGN", metadata: { feeLineId: link.feeLineId, engagementId } });
        const reference = attempt.reference as string;
        expect(reference.startsWith(`${first.reference}-`)).toBe(true);

        // Not paid yet: the return page says failed (abandoned), nothing changes.
        expect(await returnPage(reference)).toMatchObject({ status: "failed", item: "fee" });
        // Paid on Paystack: the signed webhook confirms it once; a repeat changes nothing and sends nothing.
        pay(reference);
        mocked.deliverEmail.mockClear();
        expect(await webhook(charged(reference))).toBe(200);
        expect(await webhook(charged(reference))).toBe(200);
        const [line] = await feesOf(engagementId);
        expect(line).toMatchObject({ paidReference: reference });
        expect(line.paidAt).not.toBeNull();
        expect(emails().filter(sent => sent.to === email).map(sent => sent.subject)).toEqual(["TEST: Payment received: Month 1 service fee, payable on starting"]);
        expect(emails().filter(sent => sent.to === OFFICE).map(sent => sent.subject)).toEqual(["TEST: Paid online: Studio first-pay, Month 1 service fee, payable on starting"]);
        expect(emails().find(sent => sent.to === email)!.body).toContain("Your room is open");
        room = (await (await owner.call()).engagement.client.room())!;
        expect(room.awaitingPayment).toBe(false);
        expect(room.fees.map(fee => fee.paid)).toEqual([true, false, false]);
        expect(await returnPage(reference)).toMatchObject({ status: "paid", item: "fee" });
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ state: "paid" });
        expect(await (await browser().call()).onlinePayment.feeStart(link)).toEqual({ alreadyPaid: true });
        // The team's view shows it paid online, and Finance counts it as paid.
        const fees = await (await superAdmin.call()).engagement.staff.fees({ engagementId });
        expect(fees.feeLines[0]).toMatchObject({ paidOnline: true });
        expect(fees.opensOnPayment).toBe(false);
      });

      it("refuses a payment for the wrong amount and tells Business Support, leaving the fee unpaid and the room closed", async () => {
        const { owner, engagementId } = await digitalClient("wrong-amount");
        const link = linkParts((await (await owner.call()).engagement.client.room())!.fees[0]!.payPath!);
        await (await browser().call()).onlinePayment.feeStart(link);
        const reference = paystack.initialized.at(-1)!.reference as string;
        pay(reference, { amount: 100 });
        mocked.deliverEmail.mockClear();
        expect(await webhook(charged(reference))).toBe(200);
        expect((await feesOf(engagementId))[0].paidAt).toBeNull();
        expect(emails().map(sent => sent.subject)).toEqual([expect.stringMatching(/^Paystack payment needs a look: TS-F-\d{6}$/)]);
        expect(emails()[0]!.body).toContain("The amount does not match: ₦1 paid, ₦470,000 expected.");
        expect((await (await owner.call()).engagement.client.room())!.awaitingPayment).toBe(true);
        expect(await returnPage(reference)).toMatchObject({ status: "pending", item: "fee" });
      });

      it("opens the room when the team records the first payment by hand, or opens it early", async () => {
        const a = await digitalClient("by-hand");
        const [line] = await feesOf(a.engagementId);
        const result = await (await superAdmin.call()).engagement.staff.setFeePaid({ feeLineId: line.id, paid: true });
        expect(result).toMatchObject({ opened: true });
        expect((await (await a.owner.call()).engagement.client.room())!.awaitingPayment).toBe(false);

        const b = await digitalClient("open-early");
        expect(await (await superAdmin.call()).engagement.staff.openRoomNow({ engagementId: b.engagementId })).toMatchObject({ opened: true });
        expect((await (await b.owner.call()).engagement.client.room())!.awaitingPayment).toBe(false);
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(eq(schema.adminAccessAuditEvents.action, "engagement_room_opened"));
        expect(audits.map((row: { details: string }) => JSON.parse(row.details).engagementId)).toContain(b.engagementId);
      });
    });

    describe("asking someone before paying (R72)", () => {
      it("names the engagement's main contact on the pay page only once they agree to show their number, else nobody (the page offers the office)", async () => {
        const { engagementId } = await digitalClient("ask-first");
        const [first] = await feesOf(engagementId);
        const link = { feeLineId: first.id, token: (await (await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: first.id })).url.split("/").at(-1)! };
        // Nobody on the team yet: no one is named.
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ contact: null });

        const leadUser = (await db.insert(schema.users).values({ openId: unique("lead"), email: uniqueEmail("lead"), name: "Lewis Lead", role: "user", status: "active" }).returning())[0];
        await db.insert(schema.userCredentials).values({ userId: leadUser.id, passwordHash });
        await db.insert(schema.userPlatformRoles).values({ userId: leadUser.id, role: "desk_lead" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: leadUser.id, role: "manager" });
        const lead = browser();
        await (await lead.call()).account.signInInternal({ email: leadUser.email, password: PASSWORD });
        // A number not yet agreed to is never shown.
        await (await lead.call()).account.setWhatsapp({ whatsapp: "+234 803 000 0001", agree: false });
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ contact: null });
        await (await lead.call()).account.setWhatsapp({ whatsapp: "+234 803 000 0001", agree: true });
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ contact: { name: "Lewis Lead", whatsapp: "+2348030000001" } });

        // Another client's pay page never names this engagement's team.
        const other = await digitalClient("ask-other");
        const [otherFee] = await feesOf(other.engagementId);
        const otherLink = { feeLineId: otherFee.id, token: (await (await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: otherFee.id })).url.split("/").at(-1)! };
        expect(await (await browser().call()).onlinePayment.feePage(otherLink)).toMatchObject({ contact: null });
      });
    });

    describe("payment links from the team", () => {
      it("emails the client the fee's pay link, for the team and Finance, never a Specialist or an analyst off the engagement", async () => {
        const { email, engagementId } = await digitalClient("send-link");
        const [, second] = await feesOf(engagementId);
        mocked.deliverEmail.mockClear();
        const sent = await (await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: second.id });
        expect(sent.url).toMatch(new RegExp(`/pay/fee/${second.id}/[A-Za-z0-9_-]{32}$`));
        const message = emails().find(item => item.to === email)!;
        expect(message.subject).toBe("TEST: Month 2 service fee, payable before day 31: ₦470,000 for the Digital Marketing");
        expect(message.body).toContain(`Pay online: ${sent.url}`);
        expect(message.body).toContain("Your room opens as soon as it is paid.");

        const finance = browser();
        const financeUser = (await db.insert(schema.users).values({ openId: unique("fin"), email: uniqueEmail("fin"), name: "Fola Finance", role: "user", status: "active" }).returning())[0];
        await db.insert(schema.userCredentials).values({ userId: financeUser.id, passwordHash });
        await db.insert(schema.userPlatformRoles).values({ userId: financeUser.id, role: "finance" });
        await (await finance.call()).account.signInInternal({ email: financeUser.email, password: PASSWORD });
        // Finance has no engagements in view, so the engagement is not found for them; the desk and the team send links.
        await expect((await finance.call()).engagement.staff.sendFeeLink({ feeLineId: second.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

        const specialistUser = (await db.insert(schema.users).values({ openId: unique("sme"), email: uniqueEmail("sme"), name: "Sola Specialist", role: "user", status: "active" }).returning())[0];
        await db.insert(schema.userCredentials).values({ userId: specialistUser.id, passwordHash });
        await db.insert(schema.userPlatformRoles).values({ userId: specialistUser.id, role: "subject_matter_expert" });
        await (await superAdmin.call()).engagement.staff.assign({ engagementId, userId: specialistUser.id, role: "expert" });
        const specialist = browser();
        await (await specialist.call()).account.signInInternal({ email: specialistUser.email, password: PASSWORD });
        await expect((await specialist.call()).engagement.staff.sendFeeLink({ feeLineId: second.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      it("offers no online payment while Paystack is off", async () => {
        const { owner, engagementId } = await digitalClient("paystack-off");
        ENV.paystackSecretKey = "";
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.fees.every(fee => fee.payPath === null)).toBe(true);
        const [line] = await feesOf(engagementId);
        await expect((await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: line.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      });
    });
  });
}
