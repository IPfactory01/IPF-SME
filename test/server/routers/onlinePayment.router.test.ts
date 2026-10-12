import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "@server/_core/context";

// No database: the limiter and the mode check run before it, so a request that passes them fails with
// INTERNAL_SERVER_ERROR (no database) and one that is throttled fails with TOO_MANY_REQUESTS.
vi.mock("@server/db", () => ({ getDb: async () => null }));

import { ENV } from "@server/_core/env";
import { appRouter } from "@server/routers";
import { onlinePaymentRouter } from "@server/routers/onlinePayment";
import { ONLINE_PAYMENT_OFF_MESSAGE } from "@server/onlinePayment";
import { resetRateLimitsForTests } from "@server/rateLimit";

const source = readFileSync(resolve(process.cwd(), "server/routers/onlinePayment.ts"), "utf8");
const procedure = (name: string) => source.slice(source.indexOf(`  ${name}: publicProcedure`), source.indexOf("\n  }),", source.indexOf(`  ${name}: publicProcedure`)));
const caller = () => onlinePaymentRouter.createCaller({ req: { ip: "203.0.113.60", protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);
const TOKEN = "CHECKTOKEN1234567890abcdef";
const passes = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
const throttled = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

const saved = ENV.paystackSecretKey;
beforeEach(async () => {
  ENV.paystackSecretKey = "sk_test_fixture_not_a_real_key";
  await resetRateLimitsForTests();
});
afterEach(() => {
  ENV.paystackSecretKey = saved;
});

describe("online payment routes", () => {
  it("are exactly the pay page, start and the return page's status, all public and registered", () => {
    const procedures = Object.keys((appRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures).filter(name => name.startsWith("onlinePayment.")).sort();
    expect(procedures).toEqual(["onlinePayment.page", "onlinePayment.start", "onlinePayment.status"]);
    for (const name of ["page", "start", "status"]) expect(procedure(name), name).toContain(`${name}: publicProcedure`);
    // Each says why it is public.
    expect(source.match(/\/\*\* Public: /g)).toHaveLength(3);
  });

  it("rate-limit each procedure through the shared counters, keyed by what the owner holds, before anything else", () => {
    expect(procedure("page")).toContain("await allow(LIMITS.paymentPage, input.token)");
    expect(procedure("start")).toContain("await allow(LIMITS.paymentStart, input.token)");
    expect(procedure("status")).toContain("await allow(LIMITS.paymentStatusAddress, ctx.req.ip || \"unknown\")");
    expect(procedure("status")).toContain("await allow(LIMITS.paymentStatus, input.reference)");
    expect(source).toContain("consumeLimit(rule, subject)");
  });

  it("never take an amount from the browser: the only inputs are the token, the item and the reference", () => {
    const inputs = Array.from(source.matchAll(/\.input\(([^)]*\))\)/g), match => match[1]);
    expect(inputs).toEqual(["z.object({ token, item })", "z.object({ token, item })", "z.object({ reference })"]);
  });

  it("refuse to start when Paystack is off, with a clear message, before the database is touched", async () => {
    ENV.paystackSecretKey = "";
    await expect(caller().start({ token: TOKEN, item: "full_report" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: ONLINE_PAYMENT_OFF_MESSAGE });
    expect(ONLINE_PAYMENT_OFF_MESSAGE).toBe("Online payment is not open yet. Please try again later, or reply to your payment email and we will send you a link when it is.");
  });

  it("allow 10 starts per Business Check an hour, then throttle; another check has its own allowance", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await passes(caller().start({ token: TOKEN, item: "full_report" }));
    await throttled(caller().start({ token: TOKEN, item: "current_state" }));
    await passes(caller().start({ token: `${TOKEN}-other`, item: "full_report" }));
  });

  it("allow 20 status checks per Paystack reference an hour, and 60 pay page reads per check", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) await passes(caller().status({ reference: "TS-R-000012-1a2b3c4d" }));
    await throttled(caller().status({ reference: "TS-R-000012-1a2b3c4d" }));
    await passes(caller().status({ reference: "TS-R-000012-5e6f7a8b" }));
    for (let attempt = 0; attempt < 60; attempt += 1) await passes(caller().page({ token: TOKEN, item: "full_report" }));
    await throttled(caller().page({ token: TOKEN, item: "full_report" }));
  });

  it("allow 60 status checks per address an hour across references, so invented references cannot flood Paystack", async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) await passes(caller().status({ reference: `TS-R-000012-${attempt.toString(16).padStart(8, "0")}` }));
    await throttled(caller().status({ reference: "TS-R-000012-ffffffff" }));
    const elsewhere = onlinePaymentRouter.createCaller({ req: { ip: "203.0.113.61", protocol: "https", headers: {} }, res: {}, user: null } as unknown as TrpcContext);
    await passes(elsewhere.status({ reference: "TS-R-000012-ffffffff" }));
  });

  it("refuse a token that is not a Business Check token, or an item that is not for sale, before anything else", async () => {
    await expect(caller().start({ token: "TS-R-000012", item: "full_report" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().page({ token: TOKEN, item: "fix" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
