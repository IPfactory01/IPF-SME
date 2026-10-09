import { describe, expect, it } from "vitest";
import { costShareForMargin, earnsByDeal, INTAKE_QUESTIONS, intakeSchema, intakeWording, readIntake } from "@shared/fullReport/intake";
import { sampleIntake } from "../../fixtures/reportIntake";

const withProducts = (products: unknown[]) => intakeSchema.safeParse({ ...sampleIntake, products });
const firstIssue = (result: ReturnType<typeof withProducts>) => (result.success ? undefined : result.error.issues[0].message);

describe("the Report Intake schema", () => {
  it("takes a set price, a percentage of the deal or a price that varies, and keeps only what fits the choice", () => {
    const result = withProducts([
      { name: "School uniforms", basis: "price", price: 12_000, percent: 5, dealSize: 1_000 },
      { name: "Deal advisory", basis: "percent", price: 99, percent: 2.5, dealSize: 50_000_000 },
      { name: "Bespoke orders", basis: "varies", price: 5_000, percent: null, dealSize: null },
    ]);
    expect(result.success && result.data.products).toEqual([
      { name: "School uniforms", basis: "price", price: 12_000, percent: null, dealSize: null },
      { name: "Deal advisory", basis: "percent", price: null, percent: 2.5, dealSize: 50_000_000 },
      { name: "Bespoke orders", basis: "varies", price: null, percent: null, dealSize: null },
    ]);
  });

  it("names the product whose price or percentage is missing", () => {
    expect(firstIssue(withProducts([{ name: "Lace fabric", basis: "price", price: null }]))).toBe("Enter the price of Lace fabric, or choose It varies.");
    expect(firstIssue(withProducts([{ name: "Brokerage", basis: "percent", percent: null }]))).toBe("Enter the percentage of the deal you earn on Brokerage.");
    expect(firstIssue(withProducts([{ name: "Brokerage", basis: "percent", percent: 120 }]))).toBe("Enter a percentage of 100 or less.");
    expect(firstIssue(withProducts([{ name: "Brokerage", basis: "percent", percent: 0 }]))).toBe("Enter a percentage above 0.");
  });

  it("reads a form sent before the charge choice existed: a price means a set price, no price means it varies", () => {
    const result = withProducts([{ name: "Ankara fabric", price: 18_000 }, { name: "Aso-oke sets", price: null }]);
    expect(result.success && result.data.products.map((item) => item.basis)).toEqual(["price", "varies"]);
    const { marginPercent: _margin, ...older } = sampleIntake;
    const stored = { ...older, products: [{ name: "Ankara fabric", price: 18_000 }, { name: "Aso-oke sets", price: null }] };
    expect(readIntake(stored)).toMatchObject({ marginPercent: null, products: [{ basis: "price", price: 18_000 }, { basis: "varies", price: null }] });
    expect(readIntake(null)).toBeNull();
  });

  it("lets a typed margin decide the cost band, with each edge in the band whose wording includes it", () => {
    expect([90, 75, 60, 50, 49.5, 25, 20, 0].map(costShareForMargin)).toEqual(["under_25", "25_50", "25_50", "25_50", "50_75", "50_75", "over_75", "over_75"]);
    const result = intakeSchema.safeParse({ ...sampleIntake, costShare: "under_25", marginPercent: 20 });
    expect(result.success && [result.data.costShare, result.data.marginPercent]).toEqual(["over_75", 20]);
    expect(intakeSchema.safeParse({ ...sampleIntake, marginPercent: 140 }).success).toBe(false);
  });

  it("asks a business paid by the deal about its fees, not the deal money it passes on", () => {
    expect(earnsByDeal(sampleIntake.products)).toBe(false);
    expect(earnsByDeal([{ basis: "price" }, { basis: "percent" }])).toBe(true);
    const costShare = INTAKE_QUESTIONS.find((question) => question.id === "costShare")!;
    const revenue = INTAKE_QUESTIONS.find((question) => question.id === "lastMonthRevenue")!;
    expect(intakeWording(costShare, false).prompt).toBe(costShare.prompt);
    expect(intakeWording(costShare, true).prompt).toBe("Out of every ₦100 you earn in commission and fees, how much goes on delivering the deal?");
    expect(intakeWording(revenue, true).hint).toMatch(/^Count only your commission and fees, not the deal money you pass on to others\./);
    expect(intakeWording(revenue, false).hint).toBe(revenue.hint);
    expect(INTAKE_QUESTIONS).toHaveLength(17);
  });
});
