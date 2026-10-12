/**
 * Paying online: the checks a Paystack transaction must pass, and the webhook endpoint as Express serves it (raw body,
 * signature, outside the browser-origin guard), locally and through the Vercel gateway. Database behaviour is in
 * test/db/onlinePayment.db.test.ts.
 */
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express, NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import { createApp } from "@server/_core/app";
import { createVercelGateway } from "@server/_core/vercelGateway";
import { transactionProblem } from "@server/onlinePayment";
import { ORIGIN_GUARD_EXEMPT_PATHS, requireTrustedBrowserOrigin } from "@server/security";

const KEY = "sk_test_fixture_not_a_real_key";
const sign = (body: string, key = KEY) => createHmac("sha512", key).update(body).digest("hex");

const saved = ENV.paystackSecretKey;
beforeEach(() => {
  ENV.paystackSecretKey = KEY;
});
afterEach(() => {
  ENV.paystackSecretKey = saved;
  vi.restoreAllMocks();
});

describe("a Paystack transaction confirms a payment request only when everything matches", () => {
  const request = { reference: "TS-R-000012", amountNaira: 100_000 };
  const good = { reference: "TS-R-000012-1a2b3c4d", status: "success", amount: 10_000_000, currency: "NGN" };

  it("passes the exact amount in kobo, in naira, successful, under the request's reference", () => {
    expect(transactionProblem(request, good)).toBeNull();
  });

  it("refuses a reference that does not start with the request's own, followed by a dash", () => {
    expect(transactionProblem(request, { ...good, reference: "TS-R-000013-1a2b3c4d" })).toBe("reference");
    expect(transactionProblem(request, { ...good, reference: "TS-R-0000120-1a2b3c4d" })).toBe("reference");
    expect(transactionProblem(request, { ...good, reference: "TS-R-000012" })).toBe("reference");
  });

  it("refuses anything Paystack has not settled as a success", () => {
    for (const status of ["failed", "abandoned", "reversed", "ongoing", "pending", ""]) expect(transactionProblem(request, { ...good, status }), status).toBe("status");
  });

  it("refuses another currency, and any amount but the request's own", () => {
    expect(transactionProblem(request, { ...good, currency: "USD" })).toBe("currency");
    expect(transactionProblem(request, { ...good, amount: 9_999_900 })).toBe("amount");
    expect(transactionProblem(request, { ...good, amount: 100_000 })).toBe("amount");
    expect(transactionProblem(request, { ...good, amount: Number.NaN })).toBe("amount");
  });
});

/** Posts raw bytes to the app on an ephemeral port, as Paystack does: no Origin, no browser headers. */
async function post(app: Express, path: string, body: string, headers: Record<string, string> = {}) {
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

describe("the Paystack webhook endpoint", () => {
  // Key order and spacing a JSON parser would not keep: the signature only matches the bytes as sent.
  const event = '{ "event":"transfer.success",   "data": {"reference":"TRF-1", "amount": 5000}}';

  it("receives the raw body and is exempt from the origin guard: a signed POST with no Origin reaches the handler", async () => {
    const res = await post(createApp(), "/api/paystack/webhook", event, { "x-paystack-signature": sign(event) });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ received: true });
  });

  it("answers 401 to a missing, wrong or re-keyed signature, and to a body changed after signing", async () => {
    const app = createApp();
    expect((await post(app, "/api/paystack/webhook", event)).status).toBe(401);
    expect((await post(app, "/api/paystack/webhook", event, { "x-paystack-signature": "0".repeat(128) })).status).toBe(401);
    expect((await post(app, "/api/paystack/webhook", event, { "x-paystack-signature": sign(event, "sk_test_another_fixture") })).status).toBe(401);
    expect((await post(app, "/api/paystack/webhook", JSON.stringify(JSON.parse(event)), { "x-paystack-signature": sign(event) })).status).toBe(401);
  });

  it("answers 401 to everything while Paystack is off", async () => {
    ENV.paystackSecretKey = "";
    expect((await post(createApp(), "/api/paystack/webhook", event, { "x-paystack-signature": sign(event, "") })).status).toBe(401);
  });

  it("asks Paystack to send a signed payment again when it cannot be processed (no database here)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const charge = '{"event":"charge.success","data":{"reference":"TS-R-000012-1a2b3c4d"}}';
    const res = await post(createApp(), "/api/paystack/webhook", charge, { "x-paystack-signature": sign(charge) });
    expect(res.status).toBe(500);
    expect(res.body).not.toContain(KEY);
  });

  it("works through the Vercel gateway, the way vercel.json rewrites /api/*", async () => {
    const res = await post(createVercelGateway(createApp()), "/api/index?__prefix=api&__path=paystack%2Fwebhook", event, { "x-paystack-signature": sign(event) });
    expect(res.status).toBe(200);
    expect((await post(createVercelGateway(createApp()), "/api/index?__prefix=api&__path=paystack%2Fwebhook", event)).status).toBe(401);
  });

  it("leaves every other /api write without an Origin blocked", async () => {
    const app = createApp();
    expect((await post(app, "/api/trpc/onlinePayment.start", '{"token":"x","item":"full_report"}')).status).toBe(403);
    expect((await post(app, "/api/paystack/webhooks", event, { "x-paystack-signature": sign(event) })).status).toBe(403);
    expect((await post(createVercelGateway(app), "/api/index?__prefix=api&__path=trpc%2FonlinePayment.status", "{}")).status).toBe(403);
  });
});

describe("the origin guard's exemption", () => {
  const guard = (originalUrl: string) => {
    const res = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json() { return this; } };
    const next = vi.fn() as unknown as NextFunction;
    requireTrustedBrowserOrigin({ method: "POST", originalUrl, get: () => undefined } as unknown as Request, res as unknown as Response, next);
    return { passed: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length === 1, status: res.statusCode };
  };

  it("names only the Paystack webhook, matched on the exact path", () => {
    expect(ORIGIN_GUARD_EXEMPT_PATHS).toEqual(["/api/paystack/webhook"]);
    expect(guard("/api/paystack/webhook").passed).toBe(true);
    expect(guard("/api/paystack/webhook?retry=1").passed).toBe(true);
    for (const path of ["/api/paystack/webhook/", "/api/paystack/webhook-test", "/api/paystack", "/api/trpc/onlinePayment.start"]) {
      expect(guard(path), path).toEqual({ passed: false, status: 403 });
    }
  });
});
