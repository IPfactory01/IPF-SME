import { describe, expect, it } from "vitest";
import { normalizeEmailHeaderValue } from "@server/email";

// Live Resend call: runs only when explicitly opted in (VALIDATE_RESEND_CREDENTIALS=1) and configuration exists.
const hasResendConfiguration = Boolean(
  process.env.VALIDATE_RESEND_CREDENTIALS === "1" &&
    process.env.RESEND_API_KEY,
);

describe("sender configuration", () => {
  it.skipIf(!hasResendConfiguration)("sends from the verified IP Factory domain with an authenticated Resend account", async () => {
    if (process.env.EMAIL_FROM) expect(normalizeEmailHeaderValue(process.env.EMAIL_FROM)).toMatch(/@contact\.ipfactory\.co>?$/);

    const response = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(12_000),
    });
    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: Array<{ name?: string; status?: string }> };
    const domain = payload.data?.find((item) => item.name === "contact.ipfactory.co");
    expect(domain?.status).toBe("verified");
  }, 15_000);
});
