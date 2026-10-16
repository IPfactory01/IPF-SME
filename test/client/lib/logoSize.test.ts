import { describe, expect, it } from "vitest";
import { BOXED_WEIGHT, LOGO_AREA, LOGO_MAX, logoWidth } from "@/lib/logoSize";
import { BRAND } from "@shared/brand";

const area = (logo: { width: number; height: number; boxed?: boolean }) => {
  const w = logoWidth(logo);
  return w * (w * logo.height / logo.width);
};

describe("optical sizing of client logos", () => {
  it("gives a wide wordmark and a compact mark the same area, not the same height", () => {
    const wide = { width: 320, height: 101 };
    const compact = { width: 166, height: 123 };
    expect(Math.abs(area(wide) - LOGO_AREA)).toBeLessThan(LOGO_AREA * 0.03);
    expect(Math.abs(area(compact) - LOGO_AREA)).toBeLessThan(LOGO_AREA * 0.03);
    expect(logoWidth(wide)).toBeGreaterThan(logoWidth(compact));
  });

  it("gives a logo printed on a filled box a smaller share, because it carries more ink", () => {
    const plain = { width: 316, height: 97 };
    expect(area({ ...plain, boxed: true }) / area(plain)).toBeCloseTo(BOXED_WEIGHT, 1);
  });

  it("keeps every logo on the site inside its tile", () => {
    for (const logo of BRAND.trackRecord.clientLogos) {
      const w = logoWidth(logo);
      expect(w).toBeLessThanOrEqual(LOGO_MAX.width);
      expect(w * logo.height / logo.width).toBeLessThanOrEqual(LOGO_MAX.height + 0.5);
    }
  });
});
