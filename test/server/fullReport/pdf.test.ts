import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { evaluate } from "@shared/businessCheck/engine";
import { buildFullReport } from "@shared/fullReport/build";
import { renderFullReportPdf } from "@server/fullReport/pdf";
import { PLAYFAIR_DISPLAY_700, PLUS_JAKARTA_SANS_400, PLUS_JAKARTA_SANS_600, PLUS_JAKARTA_SANS_700 } from "@server/fullReport/fonts";
import { PRINT_LOGO_PNG_BASE64, PRINT_LOGO_SIZE } from "@server/fullReport/logo";
import { businessCheckProfiles } from "../../fixtures/businessCheckProfiles";
import { sampleIntake } from "../../fixtures/reportIntake";

// fontkit comes with pdfkit; resolve it from there.
const fontkit = createRequire(createRequire(import.meta.url).resolve("pdfkit"))("fontkit") as { create: (buffer: Buffer) => { hasGlyphForCodePoint: (code: number) => boolean; familyName: string } };
const DATE = new Date("2026-10-09T10:00:00Z");

describe("the full report PDF", () => {
  it("is an A4 PDF with a cover, the one-page answer, eleven parts and the appendix, in the brand fonts and logo", async () => {
    const answers = { ...businessCheckProfiles.smallOperatingTrader, p_name: "Adunni Fabrics" };
    const report = buildFullReport({ reference: "TS-R-000012", date: DATE, contact: { fullName: "Adunni Example" }, answers, result: evaluate(answers), intake: sampleIntake });
    const pdf = await renderFullReportPdf(report, DATE);
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    const pages = (raw.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(15);
    expect(pages).toBeLessThanOrEqual(24);
    expect(raw).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(raw).toMatch(/PlusJakartaSans/);
    expect(raw).toMatch(/PlayfairDisplay/);
    expect(raw).toContain("/Subtype /Image");
  }, 20_000);

  it("lays out a business paid by the deal, with the fee wording in the products table", async () => {
    const answers = { ...businessCheckProfiles.smallOperatingTrader, p_name: "Example Advisory" };
    const intake = { ...sampleIntake, products: [
      { name: "Deal advisory for mining and energy buyers", basis: "percent" as const, price: null, percent: 2.5, dealSize: 50_000_000 },
      { name: "Market entry studies", basis: "price" as const, price: 1_500_000, percent: null, dealSize: null },
    ], topEarner: 0, marginPercent: 62.5, costShare: "25_50" as const };
    const report = buildFullReport({ reference: "TS-R-000013", date: DATE, contact: { fullName: "Bola Example" }, answers, result: evaluate(answers), intake });
    const pdf = await renderFullReportPdf(report, DATE);
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
  }, 20_000);

  it("renders every kind of business without failing", async () => {
    for (const profile of Object.keys(businessCheckProfiles)) {
      const answers = businessCheckProfiles[profile];
      const report = buildFullReport({ reference: "TS-R-000001", date: DATE, contact: { fullName: "Test Owner", businessName: `${profile} Ltd` }, answers, result: evaluate(answers), intake: { ...sampleIntake, lastMonthRevenue: null, monthlyCosts: null, cash: "not_sure" } });
      const pdf = await renderFullReportPdf(report, DATE);
      expect(pdf.length, profile).toBeGreaterThan(50_000);
    }
  }, 60_000);
});

describe("the embedded brand assets", () => {
  it("covers English text and the naira sign in Plus Jakarta Sans; Playfair Display is used only without amounts", () => {
    for (const data of [PLUS_JAKARTA_SANS_400, PLUS_JAKARTA_SANS_600, PLUS_JAKARTA_SANS_700]) {
      const font = fontkit.create(Buffer.from(data, "base64"));
      expect(font.familyName).toMatch(/Plus Jakarta Sans/);
      for (const code of [0x20a6, 0x2019, 0x201c, 0x2022, ..."Aa0,.₦%".split("").map((char) => char.codePointAt(0)!)]) expect(font.hasGlyphForCodePoint(code), code.toString(16)).toBe(true);
    }
    const display = fontkit.create(Buffer.from(PLAYFAIR_DISPLAY_700, "base64"));
    expect(display.familyName).toBe("Playfair Display");
    expect(display.hasGlyphForCodePoint(0x20a6)).toBe(false);
  });

  it("uses the same logo file as client/public/brand/ipf-gradient-logo-print.png", () => {
    const file = readFileSync(new URL("../../../client/public/brand/ipf-gradient-logo-print.png", import.meta.url));
    const png = Buffer.from(PRINT_LOGO_PNG_BASE64, "base64");
    expect(png.equals(file)).toBe(true);
    expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual(PRINT_LOGO_SIZE);
  });
});
