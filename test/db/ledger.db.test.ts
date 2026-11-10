/**
 * The payments ledger (R37, batch F; App flow 3.1): money recorded by hand by Finance or the Super Admin, in parts,
 * cancelled when recorded by mistake and never deleted; Paystack charging only what is left; a payment that does not fit
 * needing a look until Finance accepts it; receipt and invoice numbers without gaps; fees saved in place so a billed fee
 * keeps its id; and the payment requests in the same ledger. Real application code on PostgreSQL (PGlite on every run,
 * plus TEST_DATABASE_URL via `pnpm test:db`). Paystack is a fake behind a stubbed `fetch`; email and the language model
 * are stubbed. Fictional people only.
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
import { addDays, lagosDay } from "@shared/agreement";
import { takeNumber } from "@server/ledger";
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
  describe.skipIf(!target.enabled)(`The payments ledger on ${target.name}`, target.timeout ? { timeout: target.timeout } : {}, () => {
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

    /** A member of IP Factory's staff with these roles, signed in. */
    async function staffMember(roles: Array<"finance" | "analyst" | "desk_lead" | "partner">, name: string) {
      const user = (await db.insert(schema.users).values({ openId: unique(name), email: uniqueEmail(name), name, role: "user", status: "active" }).returning())[0];
      await db.insert(schema.userCredentials).values({ userId: user.id, passwordHash });
      for (const role of roles) await db.insert(schema.userPlatformRoles).values({ userId: user.id, role });
      const signedIn = browser();
      await (await signedIn.call()).account.signInInternal({ email: user.email, password: PASSWORD });
      return signedIn;
    }
    const ledgerOf = async (feeLineId: number) => db.select().from(schema.payments).where(eq(schema.payments.feeLineId, feeLineId)).orderBy(schema.payments.id);
    const byHand = (feeLineId: number, amount: number, extra: Partial<{ receivedOn: string; method: "bank_transfer" | "cash" | "other"; note: string }> = {}) =>
      ({ feeLineId, amount, receivedOn: lagosDay(), method: "bank_transfer" as const, note: "Transfer 1001", ...extra });
    const receiptOf = (label: string) => Number(label.slice("TS-RC-".length));

    describe("money recorded by hand (Finance and the Super Admin)", () => {
      it("records a fee in parts, each with a receipt, until it is paid; Paystack then charges only what is left", async () => {
        const { email, owner, engagementId } = await digitalClient("parts");
        const [first] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Finance");
        mocked.deliverEmail.mockClear();
        const part = await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 200_000, { note: "Transfer 5521" }));
        expect(part).toMatchObject({ success: true, left: 270_000, opened: true, receipt: expect.stringMatching(/^TS-RC-\d{6}$/) });
        const receipt = emails().find(sent => sent.to === email)!;
        expect(receipt.subject).toBe("Payment received: Month 1 service fee, payable on starting");
        expect(receipt.body).toContain("We have received ₦200,000 for the Digital Marketing: Month 1 service fee, payable on starting.");
        expect(receipt.body).toContain("₦270,000 is left to pay on it.");
        expect(receipt.body).toContain(`Receipt: ${part.receipt}`);
        expect(receipt.body).toContain("Received: ");

        // The room shows what is paid and what is left, with Pay for the rest, and the receipt.
        let room = (await (await owner.call()).engagement.client.room())!;
        expect(room.awaitingPayment).toBe(false);
        expect(room.fees[0]).toMatchObject({ paid: false, paidAmount: 200_000, left: 270_000, payPath: expect.stringMatching(/^\/pay\/fee\//), receipts: [{ number: part.receipt, amount: 200_000 }] });
        const link = linkParts(room.fees[0]!.payPath!);
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ amountNaira: 270_000, paidNaira: 200_000, totalNaira: 470_000, state: "open" });

        // Paystack is asked for what is left, and its payment completes the fee with the next receipt.
        await (await browser().call()).onlinePayment.feeStart(link);
        const attempt = paystack.initialized.at(-1)!;
        expect(attempt.amount).toBe(27_000_000);
        pay(attempt.reference as string);
        expect(await webhook(charged(attempt.reference as string))).toBe(200);
        const rows = await ledgerOf(first.id);
        expect(rows.map((row: { method: string; status: string; amount: number }) => [row.method, row.status, row.amount])).toEqual([["bank_transfer", "paid", 200_000], ["paystack", "paid", 270_000]]);
        expect(rows[1].receiptNumber).toBe(receiptOf(part.receipt) + 1);
        expect((await feesOf(engagementId))[0].paidAt).not.toBeNull();
        room = (await (await owner.call()).engagement.client.room())!;
        expect(room.fees[0]).toMatchObject({ paid: true, left: 0, paidAmount: 470_000 });
        expect(room.fees[0]!.receipts).toHaveLength(2);
        expect(await (await browser().call()).onlinePayment.feeStart(link)).toEqual({ alreadyPaid: true });
        // The team sees both payments; who recorded the first, and its note, are on it.
        const fees = await (await superAdmin.call()).engagement.staff.fees({ engagementId });
        expect(fees.feeLines[0]!.payments.map(payment => [payment.methodLabel, payment.amount, payment.recordedBy, payment.note])).toEqual([["Bank transfer", 200_000, "Fola Finance", "Transfer 5521"], ["Paystack", 270_000, null, null]]);
      });

      it("refuses more than is left, a day in the future and no note, and anyone but Finance and the Super Admin", async () => {
        const { engagementId } = await digitalClient("refusals");
        const [first] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Refusals");
        await expect((await finance.call()).engagement.finance.recordPayment(byHand(first.id, 470_001))).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only ₦470,000 is left to pay on this fee." });
        await expect((await finance.call()).engagement.finance.recordPayment(byHand(first.id, 1000, { receivedOn: addDays(lagosDay(), 1) }))).rejects.toMatchObject({ code: "BAD_REQUEST", message: "The day the money arrived cannot be in the future." });
        await expect((await finance.call()).engagement.finance.recordPayment(byHand(first.id, 1000, { note: "   " }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
        // The engagement team, a Vice President or Senior Associate (the desk-lead bundle) and a Partner do not record money.
        for (const roles of [["analyst"], ["desk_lead"], ["desk_lead", "partner"]] as const) {
          const member = await staffMember([...roles], `Not finance ${roles.join(" ")}`);
          await expect((await member.call()).engagement.finance.recordPayment(byHand(first.id, 1000))).rejects.toMatchObject({ code: "FORBIDDEN", message: "Recording money is for Finance and the Super Admin." });
        }
        expect(await ledgerOf(first.id)).toEqual([]);
        // The Super Admin does; Finance sees it.
        await (await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 470_000, { method: "cash", note: "Cash at the office" }));
        const listed = (await (await finance.call()).engagement.finance.list()).fees.find(fee => fee.id === first.id)!;
        expect(listed).toMatchObject({ paid: true, paidAmount: 470_000, left: 0 });
        await expect((await finance.call()).engagement.finance.recordPayment(byHand(first.id, 1000))).rejects.toMatchObject({ code: "CONFLICT", message: "This fee is already paid." });
      });

      it("cancels a payment recorded by mistake: kept with its receipt number, the fee owed again, the owner told; Paystack money is refunded, never cancelled", async () => {
        const { email, owner, engagementId } = await digitalClient("mistake");
        const [first] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Mistake");
        const recorded = await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 470_000));
        const [payment] = await ledgerOf(first.id);
        await expect((await finance.call()).engagement.finance.cancelPayment({ paymentId: payment.id, reason: "no" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        mocked.deliverEmail.mockClear();
        expect(await (await finance.call()).engagement.finance.cancelPayment({ paymentId: payment.id, reason: "Recorded against the wrong client" })).toEqual({ success: true, left: 470_000 });
        const [kept] = await ledgerOf(first.id);
        expect(kept).toMatchObject({ status: "cancelled", receiptNumber: receiptOf(recorded.receipt), cancelReason: "Recorded against the wrong client", amount: 470_000 });
        expect((await feesOf(engagementId))[0].paidAt).toBeNull();
        const correction = emails().find(sent => sent.to === email)!;
        expect(correction.subject).toBe("Your payment record has been corrected: Month 1 service fee, payable on starting");
        expect(correction.body).toContain(`Receipt ${recorded.receipt} no longer stands.`);
        expect(correction.body).toContain("₦470,000 is left to pay on it.");
        // The room it opened stays open, and shows the fee owed again; a cancelled payment is not shown to the client.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.awaitingPayment).toBe(false);
        expect(room.fees[0]).toMatchObject({ paid: false, left: 470_000, receipts: [] });
        await expect((await finance.call()).engagement.finance.cancelPayment({ paymentId: payment.id, reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT" });
        // The next payment takes the next number: a cancelled one keeps its own.
        const next = await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 470_000));
        expect(receiptOf(next.receipt)).toBeGreaterThan(receiptOf(recorded.receipt));

        // A Paystack payment is never cancelled.
        const other = await digitalClient("mistake-online");
        const link = linkParts((await (await other.owner.call()).engagement.client.room())!.fees[0]!.payPath!);
        await (await browser().call()).onlinePayment.feeStart(link);
        const reference = paystack.initialized.at(-1)!.reference as string;
        pay(reference);
        await webhook(charged(reference));
        const [online] = await ledgerOf(link.feeLineId);
        await expect((await finance.call()).engagement.finance.cancelPayment({ paymentId: online.id, reason: "Test" })).rejects.toMatchObject({ code: "CONFLICT", message: "Money Paystack took is refunded, not cancelled." });
      });
    });

    describe("Paystack and the ledger", () => {
      it("records one payment and one receipt when the webhook and the return page arrive together", async () => {
        const { email, owner, engagementId } = await digitalClient("together");
        const link = linkParts((await (await owner.call()).engagement.client.room())!.fees[0]!.payPath!);
        await (await browser().call()).onlinePayment.feeStart(link);
        const reference = paystack.initialized.at(-1)!.reference as string;
        pay(reference);
        mocked.deliverEmail.mockClear();
        await together<unknown>([() => webhook(charged(reference)), () => returnPage(reference)]);
        const rows = await ledgerOf(link.feeLineId);
        expect(rows.filter((row: { status: string }) => row.status === "paid")).toHaveLength(1);
        expect(emails().filter(sent => sent.to === email && sent.subject.includes("Payment received"))).toHaveLength(1);
        expect((await feesOf(engagementId))[0].paidAt).not.toBeNull();
      });

      it("makes a Paystack payment that no longer fits need a look, and lets Finance accept one that fits", async () => {
        const { owner, engagementId } = await digitalClient("look");
        const [first] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Look");
        const link = linkParts((await (await owner.call()).engagement.client.room())!.fees[0]!.payPath!);
        // A checkout opens for the whole fee; the money then arrives by transfer and is recorded by hand.
        await (await browser().call()).onlinePayment.feeStart(link);
        const reference = paystack.initialized.at(-1)!.reference as string;
        await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 470_000));
        pay(reference);
        mocked.deliverEmail.mockClear();
        expect(await webhook(charged(reference))).toBe(200);
        expect(emails().map(sent => sent.subject)).toEqual([expect.stringMatching(/^Paystack payment needs a look: TS-F-\d{6}$/)]);
        expect(emails()[0]!.body).toContain("This fee was already paid, so this may be a second payment for it.");
        const list = await (await finance.call()).engagement.finance.list();
        const looked = list.needsALook.find(item => item.feeLineId === first.id)!;
        expect(looked).toMatchObject({ status: "needs_a_look", amount: 470_000, paystackReference: reference });
        expect(await returnPage(reference)).toMatchObject({ status: "pending" });
        // Nothing is left on the fee, so it cannot count: it is refunded in Paystack (recorded with F2).
        await expect((await finance.call()).engagement.finance.acceptPayment({ paymentId: looked.id })).rejects.toMatchObject({ code: "CONFLICT" });

        // A short payment on another fee fits: accepted, it counts, with a receipt, and the rest is left.
        const second = (await feesOf(engagementId))[1];
        const secondLink = linkParts((await (await owner.call()).engagement.client.room())!.fees[1]!.payPath!);
        expect(secondLink.feeLineId).toBe(second.id);
        await (await browser().call()).onlinePayment.feeStart(secondLink);
        const short = paystack.initialized.at(-1)!.reference as string;
        pay(short, { amount: 100_000 });
        await webhook(charged(short));
        const [shortRow] = (await ledgerOf(second.id)).filter((row: { status: string }) => row.status === "needs_a_look");
        expect(shortRow).toMatchObject({ amount: 1_000, note: "The amount does not match: ₦1,000 paid, ₦470,000 expected." });
        await expect((await (await staffMember(["desk_lead"], "Desk Look")).call()).engagement.finance.acceptPayment({ paymentId: shortRow.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect(await (await finance.call()).engagement.finance.acceptPayment({ paymentId: shortRow.id })).toMatchObject({ success: true, left: 469_000 });
        expect((await ledgerOf(second.id)).find((row: { id: number }) => row.id === shortRow.id)).toMatchObject({ status: "paid", amount: 1_000, receiptNumber: expect.any(Number) });
      });
    });

    describe("numbers and fees", () => {
      it("gives receipt numbers in order without gaps: a refused payment takes none, and a failed save gives its number back", async () => {
        const { engagementId } = await digitalClient("numbers");
        const [first] = await feesOf(engagementId);
        const a = await (await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 100_000));
        await expect((await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 400_000))).rejects.toMatchObject({ code: "BAD_REQUEST" });
        const b = await (await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 100_000));
        expect(receiptOf(b.receipt)).toBe(receiptOf(a.receipt) + 1);
        // A number taken in a save that fails is given back with it.
        await expect(db.transaction(async (tx: unknown) => {
          await takeNumber(tx as never, "receipt");
          throw new Error("the save failed");
        })).rejects.toThrow("the save failed");
        const c = await (await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 100_000));
        expect(receiptOf(c.receipt)).toBe(receiptOf(b.receipt) + 1);
      });

      it("keeps a billed fee's id and invoice number when the fees are saved, so its pay link still works; it cannot be removed or made less than is paid", async () => {
        const { email, owner, engagementId } = await digitalClient("billed");
        const lines = await feesOf(engagementId);
        // Sending the second month's link bills it: it gets its invoice number.
        const sent = await (await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: lines[1].id });
        const link = { feeLineId: lines[1].id, token: sent.url.split("/").at(-1)! };
        const invoice = (await feesOf(engagementId))[1].invoiceNumber;
        expect(invoice).toEqual(expect.any(Number));
        const schedule = (overrides: Record<number, Partial<{ amount: number; dueOn: string | null }>> = {}) =>
          lines.map((line: { id: number; label: string; amount: number; dueOn: string | null }, index: number) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, ...overrides[index] }));
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule({ 1: { dueOn: "2026-12-20" } }) });
        const after = await feesOf(engagementId);
        expect(after.map((line: { id: number }) => line.id)).toEqual(lines.map((line: { id: number }) => line.id));
        expect(after[1]).toMatchObject({ dueOn: "2026-12-20", invoiceNumber: invoice });
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ label: "Month 2 service fee, payable before day 31", state: "open" });
        // A billed fee cannot be removed; an unbilled one can.
        await expect((await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: [schedule()[0]!, schedule()[2]!] })).rejects.toMatchObject({ code: "CONFLICT", message: "Month 2 service fee, payable before day 31 has been billed, so it cannot be removed. Change it, or ask a Partner to write it off." });
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule().slice(0, 2) });
        expect(await feesOf(engagementId)).toHaveLength(2);

        // A fee paid in full and then raised is part paid again: the room asks for the rest, and the owner is told.
        await (await superAdmin.call()).engagement.finance.recordPayment(byHand(lines[0].id, 470_000));
        await expect((await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule({ 0: { amount: 400_000 } }).slice(0, 2) })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "₦470,000 is already paid on Month 1 service fee, payable on starting, so it cannot be less." });
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule({ 0: { amount: 500_000 }, 1: { dueOn: "2026-12-20" } }).slice(0, 2) });
        expect((await feesOf(engagementId))[0].paidAt).toBeNull();
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.fees[0]).toMatchObject({ paid: false, paidAmount: 470_000, left: 30_000 });
        expect(emails().find(item => item.to === email)!.subject).toBe("Your fees have changed: Digital Marketing");
      });

      it("carries over a fee marked paid before the ledger, with no payment yet, the first time it is touched", async () => {
        const { owner, engagementId } = await digitalClient("carried");
        const [first] = await feesOf(engagementId);
        // As the code before the ledger left it in the minutes before the new code went live.
        await db.update(schema.engagementFeeLines).set({ paidAt: new Date("2026-11-09T10:00:00Z") }).where(eq(schema.engagementFeeLines.id, first.id));
        expect((await (await owner.call()).engagement.client.room())!.fees[0]).toMatchObject({ paid: true, left: 0 });
        await expect((await superAdmin.call()).engagement.finance.recordPayment(byHand(first.id, 1000))).rejects.toMatchObject({ code: "CONFLICT", message: "This fee is already paid." });
        // The refusal rolled back, so nothing was written; a save that changes the fee carries it over.
        expect(await ledgerOf(first.id)).toEqual([]);
        const lines = await feesOf(engagementId);
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: lines.map((line: { id: number; label: string; amount: number; dueOn: string | null }) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn })) });
        expect(await ledgerOf(first.id)).toEqual([expect.objectContaining({ status: "paid", method: "other", amount: 470_000, note: "Marked paid before the ledger", receiptNumber: expect.any(Number), receivedOn: "2026-11-09" })]);
        expect((await feesOf(engagementId))[0].paidAt).not.toBeNull();
      });
    });

    describe("refunds and write-offs (F2)", () => {
      it("records a refund against a payment: the fee is owed again and the owner told; never more than is left; a refund recorded by mistake is cancelled", async () => {
        const { email, owner, engagementId } = await digitalClient("refund");
        const [first] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Refund");
        const paid = await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 470_000));
        const [payment] = await ledgerOf(first.id);
        const refund = (amount: number, extra: Partial<{ refundedOn: string; reason: string; reference: string | null }> = {}) =>
          ({ paymentId: payment.id, amount, refundedOn: lagosDay(), reason: "Overpaid by mistake", reference: null as string | null, ...extra });
        // Only Finance and the Super Admin record refunds; a Partner writes off, but does not record money.
        for (const roles of [["analyst"], ["desk_lead", "partner"]] as const) {
          await expect((await (await staffMember([...roles], `No refund ${roles.join(" ")}`)).call()).engagement.finance.recordRefund(refund(1000))).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
        await expect((await finance.call()).engagement.finance.recordRefund(refund(1000, { refundedOn: addDays(lagosDay(), 1) }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
        mocked.deliverEmail.mockClear();
        expect(await (await finance.call()).engagement.finance.recordRefund(refund(100_000, { reference: "RF-1001" }))).toEqual({ success: true, left: 100_000 });
        const told = emails().find(sent => sent.to === email)!;
        expect(told.subject).toBe("Your refund: Month 1 service fee, payable on starting");
        expect(told.body).toContain("We have refunded ₦100,000 of your payment for the Digital Marketing (Month 1 service fee, payable on starting)");
        expect(told.body).toContain(`It was paid with receipt ${paid.receipt}.`);
        expect(told.body).toContain("Refund reference: RF-1001");
        expect((await feesOf(engagementId))[0].paidAt).toBeNull();
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.fees[0]).toMatchObject({ paid: false, paidAmount: 370_000, left: 100_000, receipts: [{ number: paid.receipt, amount: 470_000, refunded: 100_000 }] });

        await expect((await finance.call()).engagement.finance.recordRefund(refund(400_000))).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Only ₦370,000 of this payment is left to refund." });
        await (await finance.call()).engagement.finance.recordRefund(refund(370_000));
        expect((await ledgerOf(first.id))[0]).toMatchObject({ status: "refunded" });
        // A payment with a refund against it is refunded, not cancelled.
        await expect((await finance.call()).engagement.finance.cancelPayment({ paymentId: payment.id, reason: "Wrong client" })).rejects.toMatchObject({ code: "CONFLICT" });

        // The second refund was recorded by mistake: cancelled, it stays on the record and the payment counts again.
        const refunds = await db.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.paymentId, payment.id)).orderBy(schema.paymentRefunds.id);
        expect(await (await finance.call()).engagement.finance.cancelRefund({ refundId: refunds[1].id, reason: "Recorded twice" })).toEqual({ success: true, left: 100_000 });
        expect((await ledgerOf(first.id))[0]).toMatchObject({ status: "paid" });
        expect(await db.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.paymentId, payment.id))).toHaveLength(2);
        await expect((await finance.call()).engagement.finance.cancelRefund({ refundId: refunds[1].id, reason: "Again" })).rejects.toMatchObject({ code: "CONFLICT" });
      });

      it("refunds a payment that needs a look: refunded in part, the rest is accepted; refunded in full, it leaves the list", async () => {
        const { owner, engagementId } = await digitalClient("refund-look");
        const [first, second] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Look Refund");
        // A checkout opens for the whole first fee, then ₦200,000 arrives by transfer: Paystack's ₦470,000 no longer fits.
        const link = linkParts((await (await owner.call()).engagement.client.room())!.fees[0]!.payPath!);
        await (await browser().call()).onlinePayment.feeStart(link);
        const reference = paystack.initialized.at(-1)!.reference as string;
        await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 200_000));
        pay(reference);
        await webhook(charged(reference));
        const [looked] = (await ledgerOf(first.id)).filter((row: { status: string }) => row.status === "needs_a_look");
        expect(looked.note).toBe("Only ₦270,000 was left to pay on this fee, so this payment is more than it.");
        await expect((await finance.call()).engagement.finance.acceptPayment({ paymentId: looked.id })).rejects.toMatchObject({ code: "CONFLICT" });
        // ₦200,000 goes back through Paystack and is recorded; the rest fits and counts.
        await (await finance.call()).engagement.finance.recordRefund({ paymentId: looked.id, amount: 200_000, refundedOn: lagosDay(), reason: "Paid by transfer as well", reference: null });
        expect((await ledgerOf(first.id)).find((row: { id: number }) => row.id === looked.id)).toMatchObject({ status: "needs_a_look" });
        expect(await (await finance.call()).engagement.finance.acceptPayment({ paymentId: looked.id })).toMatchObject({ success: true, left: 0 });
        expect((await feesOf(engagementId))[0].paidAt).not.toBeNull();

        // A second payment for a fee already paid (an old checkout completed later), refunded in full: it never
        // counted, and it leaves the list.
        await (await finance.call()).engagement.finance.recordPayment(byHand(second.id, 470_000));
        const twice = `${(await (await superAdmin.call()).engagement.staff.fees({ engagementId })).feeLines[1]!.reference}-0a0b0c0d`;
        paystack.transactions.set(twice, { reference: twice, status: "success", amount: 47_000_000, currency: "NGN" });
        await webhook(charged(twice));
        const [again] = (await ledgerOf(second.id)).filter((row: { status: string }) => row.status === "needs_a_look");
        expect(again).toMatchObject({ paystackReference: twice, amount: 470_000 });
        await (await finance.call()).engagement.finance.recordRefund({ paymentId: again.id, amount: 470_000, refundedOn: lagosDay(), reason: "Paid twice", reference: "RF-2" });
        expect((await ledgerOf(second.id)).find((row: { id: number }) => row.id === again.id)).toMatchObject({ status: "refunded", receiptNumber: null });
        expect((await (await finance.call()).engagement.finance.list()).needsALook.find(item => item.id === again.id)).toBeUndefined();
        expect((await feesOf(engagementId))[1].paidAt).not.toBeNull();
        // Cancelled by mistake, the refund no longer stands and the payment needs a look again: it never counted.
        const [refund] = await db.select().from(schema.paymentRefunds).where(eq(schema.paymentRefunds.paymentId, again.id));
        await (await finance.call()).engagement.finance.cancelRefund({ refundId: refund.id, reason: "Not refunded yet" });
        expect((await ledgerOf(second.id)).find((row: { id: number }) => row.id === again.id)).toMatchObject({ status: "needs_a_look" });
      });

      it("writes off what is left, by a Partner or the Super Admin with a note: nothing more to pay, never late, reversible", async () => {
        const { owner, engagementId } = await digitalClient("write-off");
        const lines = await feesOf(engagementId);
        const first = lines[0];
        // Month 1 was due ten days ago: it is late and the work is paused.
        await (await superAdmin.call()).engagement.staff.openRoomNow({ engagementId });
        const schedule = (overrides: Record<number, Partial<{ amount: number; dueOn: string | null }>> = {}) =>
          lines.map((line: { id: number; label: string; amount: number; dueOn: string | null }, index: number) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: index === 0 ? addDays(lagosDay(), -10) : line.dueOn, ...overrides[index] }));
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule() });
        expect((await (await owner.call()).engagement.client.room())!.hold).toMatchObject({ state: "paused" });
        const sent = await (await superAdmin.call()).engagement.staff.sendFeeLink({ feeLineId: first.id });
        const link = { feeLineId: first.id, token: sent.url.split("/").at(-1)! };
        const finance = await staffMember(["finance"], "Fola Write");
        await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 200_000));

        // Finance records money but does not write it off; nor does a Vice President or Senior Associate.
        await expect((await finance.call()).engagement.finance.writeOff({ feeLineId: first.id, note: "Goodwill" })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only a Partner or the Super Admin can write off a fee." });
        await expect((await (await staffMember(["desk_lead"], "Desk Write")).call()).engagement.finance.writeOff({ feeLineId: first.id, note: "Goodwill" })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const partner = await staffMember(["desk_lead", "partner"], "Pat Partner");
        await expect((await partner.call()).engagement.finance.writeOff({ feeLineId: first.id, note: "no" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
        expect(await (await partner.call()).engagement.finance.writeOff({ feeLineId: first.id, note: "Agreed on the call: goodwill for the delay" })).toEqual({ success: true, writtenOff: 270_000 });

        // The client sees nothing more to pay; it is not late and the work is not paused.
        const room = (await (await owner.call()).engagement.client.room())!;
        expect(room.fees[0]).toMatchObject({ paid: true, writtenOff: true, left: 0, payPath: null });
        expect(room.hold).toBeNull();
        expect(await (await browser().call()).onlinePayment.feePage(link)).toMatchObject({ state: "paid", writtenOff: true });
        expect(await (await browser().call()).onlinePayment.feeStart(link)).toEqual({ alreadyPaid: true });
        await expect((await finance.call()).engagement.finance.recordPayment(byHand(first.id, 1000))).rejects.toMatchObject({ code: "CONFLICT", message: "This fee is written off. Reverse the write-off first." });
        await expect((await partner.call()).engagement.finance.writeOff({ feeLineId: first.id, note: "Again" })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect((await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule({ 0: { amount: 300_000 } }) })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect((await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: schedule().slice(1) })).rejects.toMatchObject({ code: "CONFLICT" });
        const listed = (await (await partner.call()).engagement.finance.list()).fees.find(fee => fee.id === first.id)!;
        expect(listed).toMatchObject({ paid: true, left: 0, writtenOff: { amount: 270_000, by: "Pat Partner", note: "Agreed on the call: goodwill for the delay" } });

        // A refund after the write-off is owed again; reversing the write-off makes what it covered owed too.
        const [payment] = await ledgerOf(first.id);
        await (await finance.call()).engagement.finance.recordRefund({ paymentId: payment.id, amount: 200_000, refundedOn: lagosDay(), reason: "Returned at the client's request", reference: null });
        expect((await (await owner.call()).engagement.client.room())!.fees[0]).toMatchObject({ paid: false, left: 200_000 });
        expect(await (await partner.call()).engagement.finance.reverseWriteOff({ feeLineId: first.id, reason: "The client asked to pay after all" })).toEqual({ success: true, left: 470_000 });
        expect((await feesOf(engagementId))[0]).toMatchObject({ writtenOffAmount: null, writtenOffAt: null });
        const audits = await db.select().from(schema.adminAccessAuditEvents).where(sql`${schema.adminAccessAuditEvents.action} in ('fee_written_off', 'fee_write_off_reversed')`);
        expect(details(audits.filter((row: { details: string }) => JSON.parse(row.details).feeLineId === first.id))).toEqual([
          expect.objectContaining({ feeLineId: first.id, amount: 270_000, note: "Agreed on the call: goodwill for the delay" }),
          expect.objectContaining({ feeLineId: first.id, amount: 270_000, reason: "The client asked to pay after all" }),
        ]);
      });
    });

    describe("payment requests", () => {
      it("puts a confirmed payment request into the ledger with its receipt number, and the receipt email names it", async () => {
        const check = await finishedCheck("request-ledger");
        await (await superAdmin.call()).businessSupport.requestPayment({ businessCheckId: check.id, item: "current_state" });
        const request = await paymentOf(check.id, "current_state");
        mocked.deliverEmail.mockClear();
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id, note: "Transfer 7730" });
        const rows = await db.select().from(schema.payments).where(eq(schema.payments.paymentRequestId, request.id));
        expect(rows).toEqual([expect.objectContaining({ status: "paid", method: "other", amount: request.amountNaira, note: "Transfer 7730", feeLineId: null, receiptNumber: expect.any(Number), recordedByUserId: ownerId })]);
        const confirmation = emails().find(sent => sent.to === check.email && sent.subject.startsWith("Payment received"))!;
        expect(confirmation.body).toContain(`Your receipt number is TS-RC-${String(rows[0].receiptNumber).padStart(6, "0")}.`);
      });
    });

    describe("Finance from one source (F4)", () => {
      type Payment = typeof schema.payments.$inferSelect;
      const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
      /** The owner pays a fee online from the room, in full, on whichever Paystack keys are set; returns the reference. */
      async function payOnline(owner: Browser, index: number) {
        const room = (await (await owner.call()).engagement.client.room())!;
        await (await browser().call()).onlinePayment.feeStart(linkParts(room.fees[index]!.payPath!));
        const reference = paystack.initialized.at(-1)!.reference as string;
        pay(reference);
        expect(await webhook(charged(reference))).toBe(200);
        return reference;
      }

      it("takes money in from the ledger, less refunds, with test payments apart and each payment's fee or request and reference: the totals equal the ledger", async () => {
        const { owner, engagementId } = await digitalClient("one-source");
        const [first, second, third] = await feesOf(engagementId);
        const finance = await staffMember(["finance"], "Fola Source");
        await (await finance.call()).engagement.finance.recordPayment(byHand(first.id, 200_000, { note: "Transfer 8801" }));
        // The rest of the first fee on Paystack's test keys: no real money moved.
        const testReference = await payOnline(owner, 0);
        // The second fee on the live keys, then part of it refunded.
        ENV.paystackSecretKey = LIVE_KEY;
        const liveReference = await payOnline(owner, 1);
        const [live] = (await ledgerOf(second.id)).filter((row: Payment) => row.status === "paid");
        await (await finance.call()).engagement.finance.recordRefund({ paymentId: live.id, amount: 70_000, refundedOn: lagosDay(), reason: "Agreed discount", reference: "RF-8802" });
        // A checkout opened on the third fee and never finished moved no money, so it is not money in.
        const room = (await (await owner.call()).engagement.client.room())!;
        await (await browser().call()).onlinePayment.feeStart(linkParts(room.fees[2]!.payPath!));
        // A Business Review confirmed by hand.
        const check = await assessmentAskedFor("one-source-request");
        const request = await paymentOf(check.id, "current_state");
        await (await superAdmin.call()).businessSupport.confirmPayment({ paymentRequestId: request.id, note: "Transfer 9902" });

        const listed = await (await finance.call()).engagement.finance.list();
        const [byHandRow, testRow] = await ledgerOf(first.id);
        const entry = (paymentId: number) => listed.moneyIn.find(row => row.paymentId === paymentId);
        expect(entry(byHandRow.id)).toMatchObject({ feeLineId: first.id, paymentRequestId: null, client: expect.stringContaining("Studio one-source"), engagement: "Digital Marketing", label: first.label, method: "bank_transfer", methodLabel: "Bank transfer", test: false, amount: 200_000, refunded: 0, paystackReference: null, note: "Transfer 8801", recordedBy: "Fola Source", receipt: `TS-RC-${String(byHandRow.receiptNumber).padStart(6, "0")}`, status: "paid", beforeLedger: false, receivedOn: lagosDay() });
        expect(entry(testRow.id)).toMatchObject({ feeLineId: first.id, method: "paystack", test: true, amount: 270_000, paystackReference: testReference });
        expect(entry(live.id)).toMatchObject({ feeLineId: second.id, method: "paystack", test: false, amount: 470_000, refunded: 70_000, paystackReference: liveReference, status: "paid" });
        const [requestPayment] = await db.select().from(schema.payments).where(eq(schema.payments.paymentRequestId, request.id));
        expect(entry(requestPayment.id)).toMatchObject({ feeLineId: null, paymentRequestId: request.id, engagement: null, label: "Business Review", method: "other", amount: request.amountNaira, note: "Transfer 9902", recordedBy: "Owner", test: false });
        expect(listed.requests.find(row => row.id === request.id)).toMatchObject({ paid: true, receipt: entry(requestPayment.id)!.receipt });
        expect(listed.moneyIn.some(row => row.feeLineId === third.id)).toBe(false);
        // Newest first.
        const days = listed.moneyIn.map(row => row.receivedOn ?? "");
        expect(days).toEqual([...days].sort().reverse());

        // The totals equal the ledger, read straight from its tables.
        const payments: Payment[] = await db.select().from(schema.payments);
        const refunds: Array<typeof schema.paymentRefunds.$inferSelect> = await db.select().from(schema.paymentRefunds);
        const counted = payments.filter(row => row.status === "paid" || row.status === "refunded");
        const refundedOn = (row: Payment) => sum(refunds.filter(refund => refund.paymentId === row.id && refund.cancelledAt === null).map(refund => refund.amount));
        const net = (rows: Payment[]) => sum(rows.map(row => row.amount - refundedOn(row)));
        const before = listed.moneyIn.filter(row => row.beforeLedger);
        expect(listed.moneyIn.filter(row => !row.beforeLedger).map(row => row.paymentId).sort((a, b) => a! - b!)).toEqual(counted.map(row => row.id).sort((a, b) => a - b));
        expect(listed.totals.paid).toBe(net(counted.filter(row => row.mode !== "test")) + sum(before.filter(row => !row.test).map(row => row.amount)));
        expect(listed.totals.refunded).toBe(sum(counted.filter(row => row.mode !== "test").map(refundedOn)));
        expect(listed.totals.test).toEqual({ paid: net(counted.filter(row => row.mode === "test")) + sum(before.filter(row => row.test).map(row => row.amount)), count: counted.filter(row => row.mode === "test").length + before.filter(row => row.test).length });
        // What is owed: what is left on every fee after its payments, refunds and write-offs, and the requests not yet paid.
        const feeLines: Array<typeof schema.engagementFeeLines.$inferSelect> = await db.select().from(schema.engagementFeeLines);
        const paidOn = (fee: typeof feeLines[number]) => net(counted.filter(row => row.feeLineId === fee.id));
        const owedOnFees = sum(feeLines.map(fee => (fee.paidAt ? 0 : Math.max(0, fee.amount - paidOn(fee) - (fee.writtenOffAmount ?? 0)))));
        const requests: Array<typeof schema.paymentRequests.$inferSelect> = await db.select().from(schema.paymentRequests);
        const owedOnRequests = sum(requests.filter(row => row.status !== "confirmed" && !counted.some(payment => payment.paymentRequestId === row.id)).map(row => row.amountNaira));
        expect(listed.totals.owedOnRequests).toBe(owedOnRequests);
        expect(listed.totals.owed).toBe(owedOnFees + owedOnRequests);
        expect(listed.totals.writtenOff).toBe(sum(feeLines.map(fee => fee.writtenOffAmount ?? 0)));
        // Every fee's paid amount is its money in.
        for (const fee of listed.fees) expect(sum(listed.moneyIn.filter(row => row.feeLineId === fee.id).map(row => row.amount - row.refunded)), fee.label).toBe(fee.paidAmount);
      });

      it("lists a fee or a payment request marked paid before the ledger as money in without a receipt, until it is carried over", async () => {
        const { engagementId } = await digitalClient("before-ledger");
        const [first] = await feesOf(engagementId);
        // As the code before the ledger left them in the minutes before the new code went live.
        await db.update(schema.engagementFeeLines).set({ paidAt: new Date("2026-11-03T09:00:00Z") }).where(eq(schema.engagementFeeLines.id, first.id));
        const check = await assessmentAskedFor("before-ledger-request");
        const request = await paymentOf(check.id, "current_state");
        await db.update(schema.paymentRequests).set({ status: "confirmed", confirmedAt: new Date("2026-11-04T09:00:00Z"), note: "TEST: Paid online with Paystack, reference TS-CS-000042-0a1b2c3d" }).where(eq(schema.paymentRequests.id, request.id));
        const finance = await staffMember(["finance"], "Fola Before");
        let listed = await (await finance.call()).engagement.finance.list();
        expect(listed.moneyIn.find(row => row.key === `fee-${first.id}`)).toMatchObject({ paymentId: null, receipt: null, beforeLedger: true, amount: 470_000, receivedOn: "2026-11-03", method: "other", note: "Marked paid before the ledger", test: false });
        expect(listed.moneyIn.find(row => row.key === `request-${request.id}`)).toMatchObject({ paymentId: null, receipt: null, beforeLedger: true, amount: request.amountNaira, receivedOn: "2026-11-04", method: "paystack", paystackReference: "TS-CS-000042-0a1b2c3d", test: true, note: null });
        expect(listed.requests.find(row => row.id === request.id)).toMatchObject({ paid: true, receipt: null });
        expect(listed.fees.find(row => row.id === first.id)).toMatchObject({ paid: true, paidAmount: 470_000 });

        // Saving the fees carries the fee into the ledger: the same money, now with its receipt number.
        const lines = await feesOf(engagementId);
        await (await superAdmin.call()).engagement.staff.saveFees({ engagementId, feeLines: lines.map((line: { id: number; label: string; amount: number; dueOn: string | null }) => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn })) });
        listed = await (await finance.call()).engagement.finance.list();
        expect(listed.moneyIn.some(row => row.key === `fee-${first.id}`)).toBe(false);
        expect(listed.moneyIn.filter(row => row.feeLineId === first.id)).toEqual([expect.objectContaining({ beforeLedger: false, amount: 470_000, receipt: expect.stringMatching(/^TS-RC-\d{6}$/), receivedOn: "2026-11-03" })]);
      });

      it("is for those who see Finance (view_financials) only", async () => {
        const analyst = await staffMember(["analyst"], "Ade No Finance");
        await expect((await analyst.call()).engagement.finance.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
        for (const roles of [["partner"], ["desk_lead"]] as const) {
          const member = await staffMember([...roles], `Sees finance ${roles.join(" ")}`);
          expect((await (await member.call()).engagement.finance.list()).moneyIn).toEqual(expect.any(Array));
        }
      });
    });
  });
}
