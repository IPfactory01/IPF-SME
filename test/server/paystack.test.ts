import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import {
  initializeTransaction, isValidPaystackSignature, onlineReference, PAYSTACK_WEBHOOK_PATH, paymentReferenceOf, PaystackError, paystackMode, verifyTransaction,
} from "@server/paystack";

/** Fixture keys: shaped like Paystack's, never real. */
const TEST_KEY = "sk_test_fixture_not_a_real_key";
const LIVE_KEY = "sk_live_fixture_not_a_real_key";
const sign = (body: string | Buffer, key = TEST_KEY) => createHmac("sha512", key).update(body).digest("hex");

const saved = ENV.paystackSecretKey;
afterEach(() => {
  ENV.paystackSecretKey = saved;
  vi.unstubAllGlobals();
});

describe("the online payment mode", () => {
  it("is off without a secret key, so nothing is offered online", () => {
    expect(paystackMode("")).toBe("off");
    expect(paystackMode("   ")).toBe("off");
  });

  it("is test for a test secret key and live for a live one, whatever the spaces around it", () => {
    expect(paystackMode(TEST_KEY)).toBe("test");
    expect(paystackMode(` ${LIVE_KEY} `)).toBe("live");
  });

  it("is off for anything that is not a secret key, such as a public key pasted by mistake", () => {
    expect(paystackMode("pk_test_fixture")).toBe("off");
    expect(paystackMode("pk_live_fixture")).toBe("off");
    expect(paystackMode("sk_other_fixture")).toBe("off");
  });

  it("reads the key from the hosting settings", () => {
    ENV.paystackSecretKey = "";
    expect(paystackMode()).toBe("off");
    ENV.paystackSecretKey = TEST_KEY;
    expect(paystackMode()).toBe("test");
  });
});

describe("the webhook signature", () => {
  const body = Buffer.from('{"event":"charge.success","data":{"reference":"TS-R-000012-1a2b3c4d","amount":10000000}}');

  it("accepts the HMAC-SHA512 of the exact bytes, keyed with the secret key", () => {
    expect(isValidPaystackSignature(body, sign(body), TEST_KEY)).toBe(true);
  });

  it("refuses a body changed by one byte", () => {
    const tampered = Buffer.from(body.toString().replace("10000000", "10000001"));
    expect(isValidPaystackSignature(tampered, sign(body), TEST_KEY)).toBe(false);
  });

  it("refuses a signature made with another key", () => {
    expect(isValidPaystackSignature(body, sign(body, LIVE_KEY), TEST_KEY)).toBe(false);
  });

  it("refuses a missing, empty or repeated header", () => {
    expect(isValidPaystackSignature(body, undefined, TEST_KEY)).toBe(false);
    expect(isValidPaystackSignature(body, "", TEST_KEY)).toBe(false);
    expect(isValidPaystackSignature(body, [sign(body), sign(body)], TEST_KEY)).toBe(false);
  });

  it("refuses a signature of the wrong length without throwing", () => {
    expect(() => isValidPaystackSignature(body, sign(body).slice(0, 64), TEST_KEY)).not.toThrow();
    expect(isValidPaystackSignature(body, sign(body).slice(0, 64), TEST_KEY)).toBe(false);
    expect(isValidPaystackSignature(body, `${sign(body)}00`, TEST_KEY)).toBe(false);
  });

  it("refuses everything while no secret key is set", () => {
    expect(isValidPaystackSignature(body, sign(body, ""), "")).toBe(false);
  });

  it("is posted to one fixed address", () => {
    expect(PAYSTACK_WEBHOOK_PATH).toBe("/api/paystack/webhook");
  });
});

describe("references", () => {
  it("gives each attempt its own reference, starting with the payment request's", () => {
    const first = onlineReference("TS-R-000012");
    const second = onlineReference("TS-R-000012");
    expect(first).toMatch(/^TS-R-000012-[0-9a-f]{8}$/);
    expect(second).not.toBe(first);
    expect(onlineReference("TS-CS-1234567").length).toBeLessThanOrEqual(32);
  });

  it("finds the payment request's reference inside an attempt's, and nothing in anything else", () => {
    expect(paymentReferenceOf("TS-R-000012-1a2b3c4d")).toBe("TS-R-000012");
    expect(paymentReferenceOf("TS-CS-1234567-deadbeef")).toBe("TS-CS-1234567");
    for (const other of ["TS-R-000012", "TS-R-000012-XYZ", "TS-R-000012-1a2b3c4d-1a2b3c4d", "T-R-000012-1a2b3c4d", "jump_123", "TS-R-12-1a2b3c4d"]) {
      expect(paymentReferenceOf(other), other).toBeNull();
    }
  });
});

describe("talking to Paystack", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answer = (status: number, body: unknown) => vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  beforeEach(() => {
    calls.length = 0;
    ENV.paystackSecretKey = TEST_KEY;
  });

  it("opens a transaction in kobo, in naira, with the attempt's reference, our return page and a time limit", async () => {
    vi.stubGlobal("fetch", answer(200, { status: true, message: "Authorization URL created", data: { authorization_url: "https://checkout.paystack.com/abc123", reference: "TS-R-000012-1a2b3c4d" } }));
    const opened = await initializeTransaction({ email: "ada@example.com", amountKobo: 10_000_000, reference: "TS-R-000012-1a2b3c4d", callbackUrl: "https://app.example.test/pay/return", metadata: { paymentRequestId: 3, businessCheckId: 12, item: "full_report" } });
    expect(opened).toEqual({ authorizationUrl: "https://checkout.paystack.com/abc123", reference: "TS-R-000012-1a2b3c4d" });
    const [{ url, init }] = calls;
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ email: "ada@example.com", amount: 10_000_000, currency: "NGN", reference: "TS-R-000012-1a2b3c4d", callback_url: "https://app.example.test/pay/return", metadata: { paymentRequestId: 3, businessCheckId: 12, item: "full_report" } });
  });

  it("refuses an amount that is not whole kobo, before calling Paystack", async () => {
    vi.stubGlobal("fetch", answer(200, {}));
    await expect(initializeTransaction({ email: "ada@example.com", amountKobo: 100.5, reference: "TS-R-000012-1a2b3c4d", callbackUrl: "https://app.example.test/pay/return", metadata: {} })).rejects.toBeInstanceOf(PaystackError);
    expect(calls).toHaveLength(0);
  });

  it("reports a refusal or an unusable checkout address, without the key in the message", async () => {
    vi.stubGlobal("fetch", answer(400, { status: false, message: "Duplicate Transaction Reference" }));
    const refused = await initializeTransaction({ email: "ada@example.com", amountKobo: 100, reference: "r", callbackUrl: "https://app.example.test/pay/return", metadata: {} }).catch((error: Error) => error);
    expect(refused).toBeInstanceOf(PaystackError);
    expect((refused as Error).message).toContain("Duplicate Transaction Reference");
    expect((refused as Error).message).not.toContain(TEST_KEY);
    vi.stubGlobal("fetch", answer(200, { status: true, data: { authorization_url: "http://checkout.example.test/insecure" } }));
    await expect(initializeTransaction({ email: "ada@example.com", amountKobo: 100, reference: "r", callbackUrl: "https://app.example.test/pay/return", metadata: {} })).rejects.toBeInstanceOf(PaystackError);
  });

  it("calls nothing while online payment is off", async () => {
    ENV.paystackSecretKey = "";
    vi.stubGlobal("fetch", answer(200, {}));
    await expect(verifyTransaction("TS-R-000012-1a2b3c4d")).rejects.toBeInstanceOf(PaystackError);
    expect(calls).toHaveLength(0);
  });

  it("verifies a transaction by its reference and keeps only what the confirmation checks", async () => {
    vi.stubGlobal("fetch", answer(200, { status: true, data: { reference: "TS-R-000012-1a2b3c4d", status: "success", amount: 10_000_000, currency: "NGN", customer: { email: "ada@example.com" }, authorization: { last4: "4081" } } }));
    expect(await verifyTransaction("TS-R-000012-1a2b3c4d")).toEqual({ reference: "TS-R-000012-1a2b3c4d", status: "success", amount: 10_000_000, currency: "NGN" });
    expect(calls[0].url).toBe("https://api.paystack.co/transaction/verify/TS-R-000012-1a2b3c4d");
    expect(calls[0].init.method).toBe("GET");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TEST_KEY}`);
  });

  it("answers null for a reference Paystack does not know, and throws when Paystack cannot be asked", async () => {
    vi.stubGlobal("fetch", answer(400, { status: false, message: "Transaction reference not found" }));
    expect(await verifyTransaction("TS-R-000012-00000000")).toBeNull();
    vi.stubGlobal("fetch", answer(500, { status: false, message: "Server error" }));
    await expect(verifyTransaction("TS-R-000012-00000000")).rejects.toBeInstanceOf(PaystackError);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }));
    await expect(verifyTransaction("TS-R-000012-00000000")).rejects.toThrow("Paystack did not answer (TimeoutError).");
  });
});
