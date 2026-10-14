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
const sec = (report: FullReport, number: number) => report.sections.find((item) => item.number === number)!;
const blocksOf = (report: FullReport, number: number) => sec(report, number).blocks;

describe("the full report", () => {
  it("is deterministic: the same answers give the same report, word for word", () => {
    expect(build("smallOperatingTrader")).toEqual(build("smallOperatingTrader"));
    expect(build("smallOperatingTrader")).toMatchSnapshot();
  });

  it("has the strategic plan's structure for every kind of business: a Background and nine sections, each opened with a finding", () => {
    for (const profile of Object.keys(businessCheckProfiles) as (keyof typeof businessCheckProfiles)[]) {
      const report = build(profile);
      expect(report.sections.map((item) => item.title), profile).toEqual([
        "Founder readiness", "Strategic intent", "Market and industry", "Offer and proposition", "Operational plan",
        "The financial case", "Risk", "The work plan", "Outstanding items",
      ]);
      for (const item of report.sections) {
        expect(item.standfirst, `${profile} section ${item.number}`).toMatch(/\S.*[.]$/);
        expect(item.overview.length, `${profile} section ${item.number}`).toBeGreaterThan(40);
        expect(item.scope.length, `${profile} section ${item.number}`).toBeGreaterThan(1);
      }
      expect(report.background.position.length, profile).toBeGreaterThan(3);
      expect(report.background.engagement, profile).toHaveLength(3);
      expect(report.onePage.moves.length, profile).toBeGreaterThan(0);
      expect(text(report), profile).not.toMatch(/undefined|NaN|\bnull\b|JUMP/);
      expect(report.appendix[1].rows).toHaveLength(17);
    }
  });

  it("still builds for a check saved with a sector the check no longer offers", () => {
    const report = build("smallOperatingTrader", {}, { p_sector: "professional services" });
    expect(report.descriptor).toMatch(/^A business that /);
    expect(text(report)).not.toMatch(/undefined|NaN|\bnull\b/);
    expect(report.background.position.map((row) => row.label)).not.toContain("Sector");
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
    const table = blocksOf(report, 4).find((block) => block.kind === "table");
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
    expect(blocksOf(report, 8)).toContainEqual({ kind: "timeline", moves: report.onePage.moves });
    expect(sec(report, 2).blocks).toContainEqual(expect.objectContaining({ kind: "table", columns: ["Months", "The single goal"] }));
  });

  it("reads the owner's goal back in their words", () => {
    expect(text(build("growingMaker"))).toContain("“Open a second shop in Yaba and reach ₦4 million a month.”");
  });

  it("uses the idea reading for an owner who has not started", () => {
    const report = build("ideaStageFounder");
    expect(report.descriptor).toContain("not yet trading");
    expect(blocksOf(report, 2)).toContainEqual(expect.objectContaining({ kind: "reading", area: "Your idea" }));
    expect(report.background.question).toBeUndefined();
  });

  it("still describes a large business that the check sent to an adviser, from the intake", () => {
    const report = build("advisoryRouteBusiness");
    expect(sec(report, 1).health).toBe("not_assessed");
    expect(sec(report, 3).standfirst).toBe("You can describe your best customer and the competitors they compare you with.");
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
    expect(sec(report, 6).health).toBe("stuck");
    expect(sec(report, 6).standfirst).toBe("Last month the business spent ₦750,000 more than it brought in.");
  });

  it("says so when the owner's own reading and their numbers disagree", () => {
    const report = build("growingMaker", { costShare: "over_75" }, { s4_status: "clear" });
    expect(text(report)).toContain("Your check answer says margins are healthy, but more than ₦75 of every ₦100 goes on direct costs.");
    expect(sec(report, 4).health).toBe("stuck");
    expect(blocksOf(report, 9)).toContainEqual({ kind: "numbered", items: expect.arrayContaining(["Your check answer says margins are healthy, but more than ₦75 of every ₦100 goes on direct costs. That leaves under 25% for rent, salaries and profit."]) });
  });

  it("puts the worst risks first, each with a first control", () => {
    const report = build("smallOperatingTrader", { registration: "not_registered", topCustomerShare: "over_50" });
    const register = blocksOf(report, 7).find((block) => block.kind === "table")!;
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
    expect(report.onePage.takeaways[0]).toEqual({ headline: "Financials", detail: report.onePage.fixFirst.finding, health: "stuck" });
    expect(report.background.facts).toEqual(report.onePage.takeaways.slice(0, 2).map(({ headline, detail }) => ({ headline, detail })));
    expect(report.background.headline).toEqual(report.onePage.implications);
    expect(report.onePage.takeaways.length).toBeLessThanOrEqual(3);
    expect(report.onePage.implications[0]).toMatch(/^Start with financials: the first job is to/);
    expect(report.onePage.implications.some((item) => /13-week cash forecast/.test(item))).toBe(true);
    expect(report.onePage.implications.length).toBeLessThanOrEqual(3);
  });

  it("scores every area once, the same on the summary and in the diagnosis", () => {
    const report = build("smallOperatingTrader");
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
    expect(blocksOf(report, 6).find((block) => block.kind === "waterfall")).toEqual({ kind: "waterfall", steps: [
      { label: "Money in", amount: 2_000_000, display: "₦2,000,000" },
      { label: "Costs", amount: -2_750_000, display: "−₦2,750,000" },
      { label: "Shortfall", amount: -750_000, display: "−₦750,000" },
    ] });
    const unknown = build("smallOperatingTrader", { lastMonthRevenue: null, monthlyCosts: null, cash: "not_sure", costShare: "not_sure", conversion: null, owed: "not_sure" });
    expect(unknown.sections.flatMap((item) => item.blocks).some((block) => block.kind === "waterfall")).toBe(false);
    expect(unknown.onePage.benchmarks).toEqual([]);
  });

  it("numbers each risk the same on the matrix and in the register", () => {
    const report = build("smallOperatingTrader", { registration: "not_registered", topCustomerShare: "over_50" });
    const matrix = blocksOf(report, 7).find((block) => block.kind === "riskMatrix") as Extract<FullReport["sections"][number]["blocks"][number], { kind: "riskMatrix" }>;
    const register = blocksOf(report, 7).find((block) => block.kind === "table") as { rows: string[][] };
    expect(matrix.kind).toBe("riskMatrix");
    expect(matrix.risks.map((risk) => [String(risk.number), risk.risk])).toEqual(register.rows.map((row) => [row[0], row[1]]));
  });
});

describe("the strategic plan", () => {
  type Block = FullReport["sections"][number]["blocks"][number];
  const codes = (report: FullReport) => report.sections.flatMap((item) => item.blocks.flatMap((block: Block) => (block.kind === "recommendation" || (block.kind === "reading" && block.code) ? [String((block as { code: string }).code)] : [])));

  it("breaks the gap to the owner's 12-month target into price, conversion and reach, and draws it from today to the target", () => {
    const report = build("smallOperatingTrader", { revenueTarget: 6_000_000 });
    const question = report.background.question!;
    expect(question.text[0]).toBe("The gap from ₦2.4 million a month to the ₦6 million you want is a factor of about 2.5. It is less frightening broken into three ordinary parts.");
    expect(question.levers.map((lever) => [lever.lever, lever.factor])).toEqual([["Price", "×1.15"], ["Conversion", "×1.67"], ["Reach and capacity", "×1.3"]]);
    const bridge = question.bridge!;
    expect(bridge.steps.map((step) => step.label)).toEqual(["Today", "Price", "Conversion", "Reach", "Target"]);
    const [today, ...rest] = bridge.steps;
    const target = rest.pop()!;
    expect(today.amount + rest.reduce((sum, step) => sum + step.amount, 0)).toBe(target.amount);
    expect(blocksOf(report, 6)).toContainEqual(bridge);
  });

  it("says the target is already within reach when it is at or below last month, and asks for it when it is missing", () => {
    expect(build("smallOperatingTrader", { revenueTarget: 2_000_000 }).background.question).toEqual({ text: ["Your target of ₦2 million a month is at or below last month's ₦2.4 million. The work is to hold that level while fixing the areas this plan names, not to chase growth."], levers: [] });
    const missing = build("smallOperatingTrader");
    expect(missing.background.question).toBeUndefined();
    const needs = blocksOf(missing, 9).find((block) => block.kind === "table") as { rows: string[][] };
    expect(needs.rows.map((row) => row[1])).toContain("The monthly sales you want in 12 months");
  });

  it("numbers every Recommendation by its section, once each, and the work plan points at them", () => {
    const report = build("smallOperatingTrader", { registration: "not_registered" });
    const all = codes(report);
    expect(new Set(all).size).toBe(all.length);
    for (const code of all) expect(code).toMatch(/^[1-9]\.[1-9]\d*$/);
    for (const item of report.sections) {
      const own = all.filter((code) => code.startsWith(`${item.number}.`)).map((code) => Number(code.split(".")[1]));
      expect(own, `section ${item.number}`).toEqual(own.map((_, index) => index + 1));
    }
    const actions = blocksOf(report, 8).filter((block) => block.kind === "table" && block.columns[0] === "#").flatMap((block) => (block as { rows: string[][] }).rows);
    expect(actions.map((row) => row[0])).toEqual(actions.map((_, index) => String(index + 1)));
    const referenced = actions.flatMap((row) => Array.from(row[1].matchAll(/Recommendation (\d+\.\d+)/g), (match) => match[1]));
    expect(referenced.length).toBeGreaterThan(0);
    for (const code of referenced) expect(all).toContain(code);
    expect(actions.map((row) => row[1])).toContain("Register with CAC, get a tax identification number and diarise the filing dates");
    expect(blocksOf(report, 8)).toContainEqual(expect.objectContaining({ kind: "callout", title: "The gate at the end of Phase One" }));
  });

  it("lists every answer the owner was not sure of as something we still need, in order of importance", () => {
    const report = build("smallOperatingTrader", { lastMonthRevenue: null, cash: "not_sure", conversion: null, competitors: [] });
    const needs = (blocksOf(report, 9).find((block) => block.kind === "table") as { rows: string[][] }).rows;
    expect(needs.map((row) => row[1]).slice(0, 3)).toEqual(["Last month's money in", "Cash in the bank today", "The monthly sales you want in 12 months"]);
    expect(needs.map((row) => row[1])).toEqual(expect.arrayContaining(["How many of every 10 people who ask go on to buy", "Up to three competitors, by name"]));
    expect(sec(report, 9).standfirst).toMatch(/^[A-Z][a-z]+ things we still need from you before this plan is complete\.$/);
  });
});
