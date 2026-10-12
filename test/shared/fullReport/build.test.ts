import { describe, expect, it } from "vitest";
import { evaluate } from "@shared/businessCheck/engine";
import { buildFullReport, chargeText, reportMetrics, type FullReport } from "@shared/fullReport/build";
import { readIntake, type ReportIntake } from "@shared/fullReport/intake";
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

  it("shows a commission as a percentage of the deal, and reads the margin as a share of each fee", () => {
    const report = build("smallOperatingTrader", {
      products: [
        { name: "Deal advisory", basis: "percent", price: null, percent: 2.5, dealSize: 50_000_000 },
        { name: "Market studies", basis: "price", price: 1_500_000, percent: null, dealSize: null },
        { name: "Introductions", basis: "percent", price: null, percent: 1, dealSize: null },
      ],
      topEarner: 0,
    });
    const table = part(report, 1).blocks.find((block) => block.kind === "table");
    expect(table).toMatchObject({ columns: ["What you sell", "Price or fee", ""], rows: [
      ["Deal advisory", "2.5% of the deal, about ₦1,250,000 on a ₦50,000,000 deal", "Top earner"],
      ["Market studies", "₦1,500,000", ""],
      ["Introductions", "1% of the deal", ""],
    ] });
    expect(text(report)).toContain("You earn a percentage of each deal, so your income rises and falls with the number and size of deals, not with a price list.");
    expect(text(report)).toContain('"label":"Gross margin","value":"25% to 50%","note":"Left from each fee after direct costs"');
    expect(text(report)).toContain("keeping about 25% to 50% of each fee after direct costs");
    expect(text(report)).not.toMatch(/Left from each sale|of each sale after direct costs/);
    const intakeRows = report.appendix[1].rows;
    expect(intakeRows.find((row) => row.question.startsWith("Out of every ₦100 you earn in commission and fees"))).toBeTruthy();
    expect(intakeRows.find((row) => row.question.startsWith("Your top three"))!.answer).toBe("Deal advisory (2.5% of the deal, about ₦1,250,000 on a ₦50,000,000 deal); Market studies (₦1,500,000); Introductions (1% of the deal)");
  });

  it("quotes a typed margin as typed, and judges it by the same bands", () => {
    const report = build("smallOperatingTrader", { costShare: "over_75", marginPercent: 20 });
    expect(reportMetrics({ ...sampleIntake, costShare: "over_75", marginPercent: 20 }, {}).margin).toEqual({ text: "20%", health: "stuck" });
    expect(text(report)).toContain("Gross margin, from your answer: 20% (₦80 of every ₦100 goes on direct costs).");
    expect(text(report)).toContain('"label":"Gross margin","value":"20%"');
    expect(text(report)).not.toContain("under 25%");
    expect(report.appendix[1].rows.find((row) => row.question.startsWith("Out of every ₦100"))!.answer).toBe("A margin of 20%");
    expect(reportMetrics({ ...sampleIntake, costShare: "25_50", marginPercent: 62.5 }, {}).margin).toEqual({ text: "62.5%", health: "clear" });
  });

  it("builds the same report from a form sent before the charge choice and the margin box existed", () => {
    const { marginPercent: _margin, ...older } = sampleIntake;
    const stored = JSON.parse(JSON.stringify({ ...older, products: sampleIntake.products.map(({ name, price }) => ({ name, price })) }));
    const answers = { ...businessCheckProfiles.smallOperatingTrader, p_name: "Adunni Fabrics" } as Record<string, string>;
    const input = { reference: "TS-R-000012", date: DATE, contact: { fullName: "Adunni Example", businessName: "Adunni Fabrics" }, answers, result: evaluate(answers) };
    expect(buildFullReport({ ...input, intake: readIntake(stored)! })).toEqual(buildFullReport({ ...input, intake: sampleIntake }));
    expect(chargeText({ name: "Aso-oke sets", basis: "varies", price: null, percent: null, dealSize: null })).toBe("Varies");
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
    expect(part(report, 10).blocks[0]).toEqual({ kind: "timeline", moves: report.onePage.moves });
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
    const register = part(report, 7).blocks[1];
    expect(register).toMatchObject({ kind: "table", columns: ["#", "Risk", "Likelihood", "Impact", "First control"] });
    const rows = (register as { rows: string[][] }).rows;
    expect(rows[0]).toEqual(["1", "Cash runs out in a bad month", "High", "High", "A 13-week cash forecast, updated every Monday."]);
    expect(rows.map((row) => row[1])).toEqual(expect.arrayContaining(["Losing a big customer", "Tax or registration penalties"]));
  });

  it("copes with an owner who does not know their numbers", () => {
    const report = build("smallOperatingTrader", { lastMonthRevenue: null, monthlyCosts: null, cash: "not_sure", costShare: "not_sure", conversion: null, topEarner: null });
    expect(text(report)).not.toMatch(/undefined|NaN/);
    expect(report.onePage.keyNumbers.map((item) => item.value)).toEqual(["Not known", "Not known", "Not known", "Not known"]);
  });
});

describe("the consulting layout", () => {
  it("opens with the root cause first in the key takeaways, and says what it means", () => {
    const report = build("smallOperatingTrader");
    expect(report.onePage.takeaways[0]).toEqual({ headline: "Financials", detail: part(report, 9).finding.replace(/^The place to start is financials: /, "").replace(/^./, (c) => c.toUpperCase()), health: "stuck" });
    expect(report.onePage.takeaways.length).toBeLessThanOrEqual(3);
    expect(report.onePage.implications[0]).toMatch(/^Start with financials: the first job is to/);
    expect(report.onePage.implications.some((item) => /13-week cash forecast/.test(item))).toBe(true);
    expect(report.onePage.implications.length).toBeLessThanOrEqual(3);
  });

  it("scores every area once, the same on the summary and in the diagnosis", () => {
    const report = build("smallOperatingTrader");
    expect(part(report, 9).blocks[0]).toEqual({ kind: "scorecard", rows: report.onePage.scorecard });
    const areas = report.onePage.scorecard.map((row) => row.area);
    expect(new Set(areas).size).toBe(areas.length);
    const counts = { clear: 0, watch: 0, stuck: 0 } as Record<string, number>;
    for (const row of report.onePage.scorecard) counts[row.health] += 1;
    expect(counts).toEqual(report.onePage.tally);
  });

  it("colours each benchmark bar by the same thresholds the readings use", () => {
    const report = build("smallOperatingTrader", { lastMonthRevenue: 2_000_000, monthlyCosts: 2_750_000, cash: "under_500k", costShare: "over_75", conversion: 2, owed: "1m_5m" });
    const byLabel = Object.fromEntries(report.onePage.benchmarks.map((item) => [item.label, item]));
    expect(byLabel["Cash cover"].health).toBe("stuck");
    expect(byLabel["Left after costs"]).toMatchObject({ health: "stuck", display: "−38% of revenue" });
    expect(byLabel["Gross margin"]).toMatchObject({ health: "stuck", display: "under 25%" });
    expect(byLabel["Owed to you"].health).toBe("watch");
    expect(byLabel["Enquiries that buy"]).toMatchObject({ health: "watch", display: "2 in 10" });
    for (const item of report.onePage.benchmarks) {
      const zone = item.zones.find((candidate) => item.value <= candidate.to) ?? item.zones[item.zones.length - 1];
      expect(zone.health, item.label).toBe(item.health);
    }
  });

  it("draws last month as money in, costs and what is left, and leaves out numbers the owner did not give", () => {
    const report = build("growingMaker", { lastMonthRevenue: 2_000_000, monthlyCosts: 2_750_000, cash: "2m_10m" });
    expect(part(report, 8).blocks.find((block) => block.kind === "waterfall")).toEqual({ kind: "waterfall", steps: [
      { label: "Money in", amount: 2_000_000, display: "₦2,000,000" },
      { label: "Costs", amount: -2_750_000, display: "−₦2,750,000" },
      { label: "Shortfall", amount: -750_000, display: "−₦750,000" },
    ] });
    const unknown = build("smallOperatingTrader", { lastMonthRevenue: null, monthlyCosts: null, cash: "not_sure", costShare: "not_sure", conversion: null, owed: "not_sure" });
    expect(unknown.parts.flatMap((item) => item.blocks).some((block) => block.kind === "waterfall")).toBe(false);
    expect(unknown.onePage.benchmarks).toEqual([]);
  });

  it("numbers each risk the same on the matrix and in the register", () => {
    const report = build("smallOperatingTrader", { registration: "not_registered", topCustomerShare: "over_50" });
    const [matrix, register] = part(report, 7).blocks as [Extract<FullReport["parts"][number]["blocks"][number], { kind: "riskMatrix" }>, { rows: string[][] }];
    expect(matrix.kind).toBe("riskMatrix");
    expect(matrix.risks.map((risk) => [String(risk.number), risk.risk])).toEqual(register.rows.map((row) => [row[0], row[1]]));
  });
});
