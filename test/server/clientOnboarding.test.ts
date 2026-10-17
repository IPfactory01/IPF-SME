import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOnboardingEmail } from "@server/clientOnboarding";
import { buildBusinessSupportEmailHtml } from "@server/emailTemplates";

describe("the client account invitation email", () => {
  const url = "https://ipf-sme.example.com/onboarding/abc123";
  const email = buildOnboardingEmail({ fullName: "Ada Example", businessName: "Example Stores", url });

  it("invites the owner to Advisory as a Service, not to JUMP", () => {
    expect(email.subject).toBe("Set up your client account on Advisory as a Service");
    expect(email.body).toContain("Dear Ada,");
    expect(email.body).toContain("Welcome to Advisory as a Service, by IP Factory.");
    expect(email.body).toContain("client account for Example Stores");
    expect(`${email.subject}\n${email.body}`).not.toMatch(/JUMP|Emmanuel Tarfa/);
  });

  it("shows the one-time link as a button in the IP Factory layout", () => {
    const html = buildBusinessSupportEmailHtml(email.body);
    expect(html).toMatch(new RegExp(`<a href="${url}"[^>]*>Create your account</a>`));
    expect(html).toContain('src="cid:ipf-logo"');
  });

  it("is sent as IP Factory", () => {
    const source = readFileSync(new URL("../../server/clientOnboarding.ts", import.meta.url), "utf8");
    expect(source).toMatch(/deliverEmail\(\{[\s\S]*?sender: "business_support"[\s\S]*?client_onboarding_invitations:\$\{invitation\.id\}/);
  });
});
