import { describe, expect, it, vi } from "vitest";
import { EMAIL_TIMEOUT_MS, postToResend } from "@server/email";

type Call = { url: string; init: RequestInit };

/** A fake Resend that answers each call from the script, recording what it was sent. */
function resend(script: Array<{ status: number; body?: unknown; headers?: Record<string, string> } | Error>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = script.shift();
    if (!next) throw new Error("No scripted answer left");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status, headers: { "content-type": "application/json", ...(next.headers ?? {}) } });
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };
  return { fetchImpl, sleep, calls, sleeps };
}

const payload = { from: "IP Factory <info@ipfactory.co>", to: ["ada@example.com"], subject: "Hello", text: "Hello" };

describe("one email through Resend", () => {
  it("sends with a bounded request and names the message with an idempotency key", async () => {
    const fake = resend([{ status: 200, body: { id: "msg_1" } }]);
    const result = await postToResend({ payload, apiKey: "re_test", idempotencyKey: "payment_requests:12:confirmed", fetchImpl: fake.fetchImpl, sleep: fake.sleep });
    expect(result).toEqual({ status: "Sent", providerMessageId: "msg_1" });
    expect(fake.calls).toHaveLength(1);
    const { init } = fake.calls[0];
    expect(fake.calls[0].url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ authorization: "Bearer re_test", "idempotency-key": "payment_requests:12:confirmed", "user-agent": "the-shift-platform/1.0" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(EMAIL_TIMEOUT_MS).toBe(8_000);
  });

  it("sends without the key header when no key is given", async () => {
    const fake = resend([{ status: 200, body: { id: "msg_2" } }]);
    await postToResend({ payload, apiKey: "re_test", fetchImpl: fake.fetchImpl, sleep: fake.sleep });
    expect(fake.calls[0].init.headers).not.toHaveProperty("idempotency-key");
  });

  it("retries once when Resend is busy, waiting as long as it asks (within reason), with the same key", async () => {
    const fake = resend([{ status: 429, body: { message: "Too many requests" }, headers: { "retry-after": "1" } }, { status: 200, body: { id: "msg_3" } }]);
    const result = await postToResend({ payload, apiKey: "re_test", idempotencyKey: "business_checks:7:summary:owner", fetchImpl: fake.fetchImpl, sleep: fake.sleep });
    expect(result).toEqual({ status: "Sent", providerMessageId: "msg_3" });
    expect(fake.calls).toHaveLength(2);
    expect(fake.sleeps).toEqual([1000]);
    expect(fake.calls.map(call => (call.init.headers as Record<string, string>)["idempotency-key"])).toEqual(["business_checks:7:summary:owner", "business_checks:7:summary:owner"]);
  });

  it("caps a long Retry-After and gives up after the one retry, reporting why", async () => {
    const fake = resend([{ status: 503, body: { message: "Service unavailable" }, headers: { "retry-after": "120" } }, { status: 500, body: { name: "internal_server_error" } }]);
    const result = await postToResend({ payload, apiKey: "re_test", fetchImpl: fake.fetchImpl, sleep: fake.sleep });
    expect(result).toEqual({ status: "Failed", reason: "internal_server_error" });
    expect(fake.calls).toHaveLength(2);
    expect(fake.sleeps).toEqual([2000]);
  });

  it("does not retry a refusal, such as an unverified domain or a bad address", async () => {
    const fake = resend([{ status: 403, body: { message: "The ipfactory.co domain is not verified" } }]);
    const result = await postToResend({ payload, apiKey: "re_test", fetchImpl: fake.fetchImpl, sleep: fake.sleep });
    expect(result).toEqual({ status: "Failed", reason: "The ipfactory.co domain is not verified" });
    expect(fake.calls).toHaveLength(1);
    expect(fake.sleeps).toEqual([]);
  });

  it("retries once when Resend does not answer in time, and says so", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const fake = resend([timeout, timeout]);
    const result = await postToResend({ payload, apiKey: "re_test", fetchImpl: fake.fetchImpl, sleep: fake.sleep, timeoutMs: 8_000 });
    expect(result).toEqual({ status: "Failed", reason: "Resend did not answer within 8 seconds" });
    expect(fake.calls).toHaveLength(2);
    expect(fake.sleeps).toEqual([600]);
  });

  it("recovers when the first attempt fails on the network and the second gets through", async () => {
    const fake = resend([new Error("socket hang up"), { status: 200, body: { id: "msg_4" } }]);
    expect(await postToResend({ payload, apiKey: "re_test", fetchImpl: fake.fetchImpl, sleep: fake.sleep })).toEqual({ status: "Sent", providerMessageId: "msg_4" });
  });
});
