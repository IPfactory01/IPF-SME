import { describe, expect, it } from "vitest";

const shouldValidate = process.env.VALIDATE_RESEND_CREDENTIALS === "1";

describe.skipIf(!shouldValidate)("Resend credentials", () => {
  it("authenticates against the read-only domains endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": "the-shift-platform/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Resend credential check returned HTTP ${response.status}`);
    }
    expect(response.ok).toBe(true);
  }, 15_000);
});
