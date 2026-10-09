import { describe, expect, it } from "vitest";
import { evaluate } from "@shared/businessCheck/engine";
import { buildFullReport, reportMetrics, type FullReport } from "@shared/fullReport/build";
import type { ReportIntake } from "@shared/fullReport/intake";
import { businessCheckProfiles } from "../../fixtures/businessCheckProfiles";
import { sampleIntake } from "../../fixtures/reportIntake";

const DATE = new Date("2026-10-09T10:00:00Z");
const build = (profile: keyof typeof businessCheckProfiles, intake: Partial<ReportIntake> = {}, answers: Record<string, unknown> = {}) => {
  const merged = { ...businessCheckProfiles[profile], p_name: "Adunni Fabrics", ...answers } as Record<string, string>;
  return buildFullReport({ reference: "TS-R-000012", date: DATE, contact: { fullName: "Adunni Example", businessName: "Adunni Fabrics" }, answers: merged, result: evaluate(merged), intake: { ...sampleIntake, ...intake } });
};
const text = (report: FullReport) => JSON.stringify(report);
const part = (report: FullReport, number: number) => report.parts.find((item) => item.number === number)!;

describe("the full report", () => {
  it("is deterministic: the same answers give the same report, word for word", () => {
    expect(build("smallOperatingTrader")).toEqual(build("smallOperatingTrader"));
    expect(build("smallOperatingTrader")).toMatchSnapshot();
  });

  it("has the agreed structure for every kind of business, with a finding on every part", () => {
    for (const profile of Object.keys(businessCheckProfiles) as (keyof typeof businessCheckProfiles)[]) {
      const report = build(profile);
      expect(report.parts.map((item) => item.title), profile).toEqual([
        "Your business today", "Where it is going", "Your market", "What you sell and how it makes money", "How customers find you and buy",
        "How the business runs", "What could go wrong", "The numbers", "The diagnosis", "What to fix first: your 90-day plan", "How we can help",
      ]);
      for (const item of report.parts) expect(item.finding, `${profile} part ${item.number}`).toMatch(/\S.*[.]$/);
      expect(report.onePage.moves.length, profile).toBeGreaterThan(0);
      expect(text(report), profile).not.toMatch(/undefined|NaN|\bnull\b|JUMP/);
      expect(report.appendix[1].rows).toHaveLength(17);
    }
  });

  it("still builds for a check saved with a sector the check no longer offers", () => {
    const report = build("smallOperatingTrader", {}, { p_sector: "professional services" });
    expect(report.descriptor).toMatch(/^A business that /);
    expect(text(report)).not.toMatch(/undefined|NaN|\bnull\b/);
    expect(part(report, 1).blocks.flatMap((block) => (block.kind === "facts" ? block.rows.map((row) => row.label) : []))).not.toContain("Sector");
  });

  it("dates the report from the intake and carries the reference", () => {
    const report = build("smallOperatingTrader");
    expect(report).toMatchObject({ reference: "TS-R-000012", date: "9 October 2026", businessName: "Adunni Fabrics", ownerName: "Adunni Example" });
    expect(report.method).toContain("not an audit");
  });

  it("starts the plan with the root cause the business check found", () => {
    const report = build("smallOperatingTrader");
    expect(report.onePage.fixFirst.area).toBe("Financials");
    expect(report.onePage.moves[0]).toMatchObject({ month: "Month 1", area: "Financials" });
    expect(part(report, 10).blocks[0]).toMatchObject({ kind: "table", columns: ["When", "Move", "This week", "Number to watch"] });
  });

  it("reads the owner's goal back in their words", () => {
    expect(text(build("growingMaker"))).toContain("“Open a second shop in Yaba and reach ₦4 million a month.”");
  });

  it("uses the idea reading for an owner who has not started", () => {
    const report = build("ideaStageFounder");
    expect(part(report, 1).finding).toContain("has not started trading");
    expect(part(report, 2).blocks[0]).toMatchObject({ kind: "reading", area: "Your idea" });
  });

  it("still describes a large business that the check sent to an adviser, from the intake", () => {
    const report = build("advisoryRouteBusiness");
    expect(part(report, 1).health).toBe("not_assessed");
    expect(part(report, 3).finding).toBe("You can describe your best customer and the competitors they compare you with.");
  });
});

describe("what the rules work out from the numbers", () => {
  it("works out the month's result, cash cover, gross margin and new customers", () => {
    const metrics = reportMetrics({ ...sampleIntake, lastMonthRevenue: 2_400_000, monthlyCosts: 2_150_000, cash: "500k_2m", costShare: "50_75", enquiries: "50_200", conversion: 3 }, { p_revenue: "1to3m" });
    expect(metrics.result).toBe(250_000);
    expect(metrics.resultMargin).toBeCloseTo(0.104, 3);
    expect(metrics.cover!.low).toBeCloseTo(1.008, 2);
    expect(metrics.cover!.high).toBeCloseTo(4.03, 2);
    expect(metrics.margin).toEqual({ text: "25% to 50%", health: "watch" });
    expect(metrics.newCustomers).toEqual({ low: 15, high: 60 });
    expect(metrics.revenueVsTypical).toBe("within");
  });

  it("marks a loss-making month as stuck and names the gap in naira", () => {
    const report = build("growingMaker", { lastMonthRevenue: 2_000_000, monthlyCosts: 2_750_000, cash: "2m_10m" });
    expect(part(report, 8).health).toBe("stuck");
    expect(part(report, 8).finding).toBe("Last month the business spent ₦750,000 more than it brought in.");
  });

  it("says so when the owner's own reading and their numbers disagree", () => {
    const report = build("growingMaker", { costShare: "over_75" }, { s4_status: "clear" });
    expect(text(report)).toContain("Your check answer says margins are healthy, but more than ₦75 of every ₦100 goes on direct costs.");
    expect(part(report, 4).health).toBe("stuck");
  });

  it("puts the worst risks first, each with a first control", () => {
    const report = build("smallOperatingTrader", { registration: "not_registered", topCustomerShare: "over_50" });
    const register = part(report, 7).blocks[0];
    expect(register).toMatchObject({ kind: "table", columns: ["Risk", "Likelihood", "Impact", "First control"] });
    const rows = (register as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(["Cash runs out in a bad month", "High", "High", "A 13-week cash forecast, updated every Monday."]);
    expect(rows.map((row) => row[0])).toEqual(expect.arrayContaining(["Losing a big customer", "Tax or registration penalties"]));
  });

  it("copes with an owner who does not know their numbers", () => {
    const report = build("smallOperatingTrader", { lastMonthRevenue: null, monthlyCosts: null, cash: "not_sure", costShare: "not_sure", conversion: null, topEarner: null });
    expect(text(report)).not.toMatch(/undefined|NaN/);
    expect(report.onePage.keyNumbers.map((item) => item.value)).toEqual(["Not known", "Not known", "Not known", "Not known"]);
  });
});
