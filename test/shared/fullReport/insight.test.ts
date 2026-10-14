import { describe, expect, it } from "vitest";
import { evaluate, READINESS_LABELS } from "@shared/businessCheck/engine";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { buildFullReport } from "@shared/fullReport/build";
import { roomInsight } from "@shared/fullReport/insight";
import { businessCheckProfiles } from "../../fixtures/businessCheckProfiles";
import { sampleIntake } from "../../fixtures/reportIntake";

const answers = { ...businessCheckProfiles.smallOperatingTrader, p_name: "Adunni Fabrics" } as Record<string, string>;
const result = evaluate(answers);
const report = buildFullReport({ reference: "TS-R-000012", date: new Date("2026-10-14T09:00:00Z"), contact: { fullName: "Adunni Example", businessName: "Adunni Fabrics" }, answers, result, intake: { ...sampleIntake, revenueTarget: 4_000_000 } });

describe("what the client room's Founder and Business tabs show", () => {
  it("takes the Founder tab from Sections One and Two of the Full Report, with the 12-month question", () => {
    const insight = roomInsight({ report, result })!;
    expect(insight.source).toBe("Full Report");
    expect(insight.founder.sections).toEqual(report.sections.filter(section => section.number <= 2));
    expect(insight.founder.question).toEqual(report.background.question);
    expect(insight.founder.readiness.health).toBe(report.sections[0].health);
  });

  it("takes the Business tab from the report's scorecard, in its order, with each area's reading and benchmarks", () => {
    const insight = roomInsight({ report, result: null })!;
    const business = report.onePage.scorecard.filter(row => ![AREA_NAMES[0], AREA_NAMES[1], "Your idea"].includes(row.area));
    expect(insight.areas.map(area => [area.area, area.health, area.finding])).toEqual(business.map(row => [row.area, row.health, row.finding]));
    for (const area of insight.areas.filter(item => item.reading)) expect(area.reading!.area).toBe(area.area);
    // Every benchmark bar lands on exactly one area, and nothing is invented.
    for (const item of insight.areas.flatMap(area => area.benchmarks)) expect(report.onePage.benchmarks).toContainEqual(item);
    expect(insight.areas.find(area => area.area === AREA_NAMES[7])?.benchmarks.map(item => item.label)).toEqual(expect.arrayContaining(["Cash cover"]));
  });

  it("falls back to the Business Check without a report: readiness, the behaviour profile and the outline in the owner's words", () => {
    const insight = roomInsight({ report: null, result })!;
    expect(insight.source).toBe("Business Check");
    expect(insight.founder.sections).toEqual([]);
    expect(insight.founder.readiness.label).toBe(READINESS_LABELS[result.founder.level]);
    expect(insight.areas.map(area => area.area)).toEqual(result.outline.filter(row => row.area > 1).map(row => row.name));
    expect(insight.areas.every(area => area.reading === null && area.benchmarks.length === 0)).toBe(true);
  });

  it("has nothing to show without a report or a check", () => {
    expect(roomInsight({ report: null, result: null })).toBeNull();
  });
});
