import { describe, expect, it, vi } from "vitest";

vi.mock("@server/_core/env", () => ({ ENV: { appOrigin: "https://app.example.test" } }));

const { buildBusinessSupportEmailHtml } = await import("@server/emailTemplates");
const { BRAND } = await import("@shared/brand");

describe("Business Support email footer", () => {
  it("links the Terms & Conditions and Privacy Policy on the configured app origin, not a fixed address", () => {
    const html = buildBusinessSupportEmailHtml("Hello Ada,\n\nYour result is ready.");
    expect(html).toContain('href="https://app.example.test/terms"');
    expect(html).toContain('href="https://app.example.test/privacy"');
    expect(html).not.toMatch(/vercel\.app/);
  });

  it("prints IP Factory's office address in the footer", () => {
    const html = buildBusinessSupportEmailHtml("Hello Ada,\n\nYour result is ready.");
    expect(html).toContain("IP Factory, 5 C&amp;I Leasing Drive, Lekki Phase 1, Lagos State, Nigeria");
    expect(BRAND.officeAddress.oneLine).toBe(BRAND.officeAddress.lines.join(", "));
  });
});
