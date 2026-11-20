import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PulseMethodConfig } from "@shared/pulse/configTypes";
import { validateMethodConfig } from "@server/pulse/configValidation";

function loadV1Config(): PulseMethodConfig {
  const raw = readFileSync(join(process.cwd(), "shared/pulse/method-v1.0.0.json"), "utf8");
  return JSON.parse(raw) as PulseMethodConfig;
}

describe("PRD v1.0.0 method configuration", () => {
  const config = loadV1Config();

  it("validates the full v1.0.0 configuration without errors", () => {
    expect(validateMethodConfig(config)).toEqual([]);
  });

  it("contains exactly 24 questions: 18 scored + 6 opportunity routing", () => {
    expect(config.questions).toHaveLength(24);
    const scored = config.questions.filter((q) => q.active && q.section !== "opportunity");
    const routing = config.questions.filter((q) => q.active && q.section === "opportunity");
    expect(scored).toHaveLength(18);
    expect(routing).toHaveLength(6);
  });

  it("scores questions on the 0–3 evidence scale with at most one unknown option each", () => {
    for (const q of config.questions) {
      for (const o of q.options) {
        if (o.unknown_flag) continue;
        expect(o.raw_score, `${q.question_id}/${o.option_id}`).toBeGreaterThanOrEqual(0);
        expect(o.raw_score, `${q.question_id}/${o.option_id}`).toBeLessThanOrEqual(3);
        expect(Number.isInteger(o.raw_score), `${q.question_id}/${o.option_id}`).toBe(true);
      }
      expect(q.options.filter((o) => o.unknown_flag)).toHaveLength(1);
    }
  });

  it("defines six scored dimensions with weights summing to 1 and three questions each", () => {
    const scoredDimensions = config.dimensions.filter((d) => d.dimension_id !== "opportunity");
    expect(scoredDimensions).toHaveLength(6);
    expect(scoredDimensions.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1, 9);
    for (const d of scoredDimensions) {
      expect(d.question_ids).toHaveLength(3);
    }
  });

  it("uses the PRD §9.1 five classification bands with contiguous boundaries", () => {
    const expected = [
      [0, 29],
      [30, 49],
      [50, 69],
      [70, 84],
      [85, 100],
    ];
    expect(config.classifications.map((c) => [c.minimum_score, c.maximum_score])).toEqual(expected);
    for (let i = 1; i < config.classifications.length; i++) {
      expect(config.classifications[i]!.minimum_score).toBe(config.classifications[i - 1]!.maximum_score + 1);
    }
  });

  it("defines all six critical gates GATE-01..GATE-06", () => {
    const ids = config.gates.map((g) => g.gate_id);
    for (const id of ["GATE-01", "GATE-02", "GATE-03", "GATE-04", "GATE-05", "GATE-06"]) {
      expect(ids).toContain(id);
    }
  });

  it("defines six intervention pathways", () => {
    expect(config.routes).toHaveLength(6);
    const labels = config.routes.map((r) => r.label);
    expect(labels).toContain("Workflow Optimisation");
    expect(labels).toContain("AI Governance and Adoption");
    expect(labels).toContain("Foundation work");
  });

  it("has recommendation library entries with approved timeframes", () => {
    expect(config.recommendations.length).toBeGreaterThan(0);
    for (const rec of config.recommendations) {
      expect(["0-30 days", "31-60 days", "61-90 days"]).toContain(rec.timeframe);
    }
  });

  it("defaults country to Nigeria with the controlled industry and size lists", () => {
    const country = config.controlled_lists.find((l) => l.field === "country");
    expect(country?.default_value).toBe("Nigeria");
    expect(country?.values).toContain("Nigeria");
    const industry = config.controlled_lists.find((l) => l.field === "industry");
    expect(industry?.values.length).toBeGreaterThanOrEqual(10);
    const size = config.controlled_lists.find((l) => l.field === "employee_range");
    expect(size?.values).toContain("1 to 10");
  });

  it("rejects a configuration with weights that do not sum to 1", () => {
    const broken = { ...config, dimensions: config.dimensions.map((d) => ({ ...d, weight: d.weight * 2 })) };
    const errors = validateMethodConfig(broken);
    expect(errors.some((e) => e.path === "dimensions")).toBe(true);
  });

  it("rejects a configuration missing scored questions", () => {
    const broken: PulseMethodConfig = {
      ...config,
      questions: config.questions.filter((q) => q.section !== "opportunity").slice(0, 10),
    };
    const errors = validateMethodConfig(broken);
    expect(errors.some((e) => e.message.includes("18 active scored questions"))).toBe(true);
  });

  it("rejects non-contiguous classification bands", () => {
    const broken: PulseMethodConfig = {
      ...config,
      classifications: [
        { minimum_score: 0, maximum_score: 29, label: "Foundations required", interpretation: "" },
        { minimum_score: 40, maximum_score: 49, label: "Emerging", interpretation: "" },
      ],
    };
    const errors = validateMethodConfig(broken);
    expect(errors.some((e) => e.message.includes("contiguous"))).toBe(true);
  });

  it("rejects raw scores outside the 0–3 range", () => {
    const [q] = config.questions;
    const broken: PulseMethodConfig = {
      ...config,
      questions: [
        { ...q!, options: q!.options.map((o) => ({ ...o, raw_score: 5 })) },
        ...config.questions.slice(1),
      ],
    };
    const errors = validateMethodConfig(broken);
    expect(errors.length).toBeGreaterThan(0);
  });
});
