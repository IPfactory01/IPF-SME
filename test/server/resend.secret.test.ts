import { describe, expect, it } from "vitest";

type ResendDomain = { name?: string; status?: string };

function senderDomain(value: string) {
  const address = value.match(/<([^>]+)>/)?.[1] ?? value;
  const domain = address.trim().split("@").pop();
  return domain?.toLowerCase() ?? "";
}

describe("Resend secret configuration", () => {
  it.skipIf(process.env.VALIDATE_RESEND_CREDENTIALS !== "1")("authenticates the configured API key against the domains endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": "the-shift-platform/1.0",
      },
    });

    expect(response.ok, `Resend domains endpoint returned HTTP ${response.status}`).toBe(true);
  }, 15_000);

  const senderCheck = process.env.VALIDATE_RESEND_SENDER === "1" ? it : it.skip;

  senderCheck("uses an approved sender domain", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    expect(apiKey, "RESEND_API_KEY must be configured").toBeTruthy();
    expect(from, "EMAIL_FROM must be configured").toBeTruthy();

    const domain = senderDomain(from!);
    expect(domain, "EMAIL_FROM must contain a valid sender domain").toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);

    // Resend's onboarding sender is permitted for account testing; production recipients
    // require a verified custom domain, which is checked below.
    if (domain === "resend.dev") return;

    const response = await fetch("https://api.resend.com/domains", {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
        "user-agent": "the-shift-platform/1.0",
      },
    });
    const payload = (await response.json()) as { data?: ResendDomain[] };
    expect(response.ok, `Resend domains endpoint returned HTTP ${response.status}`).toBe(true);
    expect(
      payload.data?.some((entry) => entry.name?.toLowerCase() === domain && entry.status === "verified"),
      `EMAIL_FROM domain ${domain} is not verified in Resend`,
    ).toBe(true);
  }, 15_000);
});
