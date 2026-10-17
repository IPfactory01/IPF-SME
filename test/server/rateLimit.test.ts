import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No database: the shared store is unavailable, so this instance's memory stands in, as before migration 0010.
vi.mock("@server/db", () => ({ getDb: async () => null }));

import { consumeLimit, LIMITS, limitKey, releaseLimit, resetRateLimitsForTests } from "@server/rateLimit";

const rule = { scope: "unit", max: 3, windowMs: 60_000 };

describe("rate limits without the shared store", () => {
  beforeEach(() => resetRateLimitsForTests());
  afterEach(() => vi.useRealTimers());

  it("allows the maximum within a window, then refuses, and starts again when the window has passed", async () => {
    vi.useFakeTimers();
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await consumeLimit(rule, "203.0.113.5")).toBe(true);
    expect(await consumeLimit(rule, "203.0.113.5")).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(await consumeLimit(rule, "203.0.113.5")).toBe(true);
  });

  it("keeps subjects apart and treats their case and spacing as one", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await consumeLimit(rule, "Ada@Example.test")).toBe(true);
    expect(await consumeLimit(rule, " ada@example.test ")).toBe(false);
    expect(await consumeLimit(rule, "bola@example.test")).toBe(true);
  });

  it("releases a subject's attempts", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeLimit(rule, "203.0.113.6");
    expect(await consumeLimit(rule, "203.0.113.6")).toBe(false);
    await releaseLimit(rule, "203.0.113.6");
    expect(await consumeLimit(rule, "203.0.113.6")).toBe(true);
  });

  it("never puts the address, email or link into the key", () => {
    const key = limitKey(LIMITS.checkStartEmail, "203.0.113.7:ada@example.test");
    expect(key).toMatch(/^check_start_email:[0-9a-f]{40}$/);
    expect(key).not.toContain("ada");
    expect(limitKey(LIMITS.checkStartEmail, "203.0.113.7:ada@example.test")).toBe(key);
    expect(limitKey(LIMITS.checkStartIp, "203.0.113.7:ada@example.test")).not.toBe(key);
  });

  it("names a limit for every public path that sends email, calls a provider or renders a file", () => {
    expect(Object.keys(LIMITS).sort()).toEqual(["checkNext", "checkSave", "checkStartEmail", "checkStartIp", "checkSubmit", "engagementComment", "fileUpload", "onboardingEmail", "paymentPage", "paymentStart", "paymentStatus", "paymentStatusAddress", "publicLookup", "reportDownload", "reportForm", "resetRequest"]);
    expect(LIMITS.checkSubmit).toEqual({ scope: "check_submit", max: 3, windowMs: 3_600_000 });
    // Paying online: each start opens a Paystack transaction and each status check asks Paystack.
    expect(LIMITS.paymentStart).toEqual({ scope: "payment_start", max: 10, windowMs: 3_600_000 });
    expect(LIMITS.paymentStatus).toEqual({ scope: "payment_status", max: 20, windowMs: 3_600_000 });
    expect(LIMITS.paymentStatusAddress).toEqual({ scope: "payment_status_ip", max: 60, windowMs: 3_600_000 });
    expect(LIMITS.paymentPage).toEqual({ scope: "payment_page", max: 60, windowMs: 3_600_000 });
    expect(LIMITS.checkNext).toEqual({ scope: "check_next", max: 5, windowMs: 86_400_000 });
    expect(LIMITS.reportDownload).toEqual({ scope: "report_download", max: 5, windowMs: 86_400_000 });
    // "Forgot your password?" can send an email: five an hour, per address and per email.
    expect(LIMITS.resetRequest).toEqual({ scope: "reset_request", max: 5, windowMs: 3_600_000 });
    expect(LIMITS.fileUpload).toEqual({ scope: "file_upload", max: 30, windowMs: 86_400_000 });
    expect(LIMITS.engagementComment).toEqual({ scope: "engagement_comment", max: 60, windowMs: 3_600_000 });
    expect(LIMITS.onboardingEmail).toEqual({ scope: "onboarding_email", max: 10, windowMs: 3_600_000 });
  });
});
