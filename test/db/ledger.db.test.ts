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
  });
}
