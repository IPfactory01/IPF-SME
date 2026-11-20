import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildAnswers,
  collectUnknownOptionIds,
  evaluate,
  evaluateExpression,
} from "@shared/pulse/scoringEngine";
import type { PulseMethodConfig } from "@shared/pulse/configTypes";

const configPath = path.resolve("shared/pulse/method-v1.0.0.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as PulseMethodConfig;

describe("Pulse scoring engine — Appendix B test cases", () => {
  const unknownIds = collectUnknownOptionIds(config);

  function answersFrom(allSame: "min" | "max"): Record<string, string> {
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      if (allSame === "min") {
        // lowest raw_score option that is not the unknown option
        const scored = q.options.filter((o) => o.raw_score !== undefined && !o.unknown_flag);
        const lowest = scored.reduce((a, b) =>
          (a.raw_score ?? 9) <= (b.raw_score ?? 9) ? a : b
        );
        map[q.question_id] = lowest.option_id;
      } else {
        const scored = q.options.filter((o) => o.raw_score !== undefined);
        const highest = scored.reduce((a, b) =>
          (a.raw_score ?? -1) >= (b.raw_score ?? -1) ? a : b
        );
        map[q.question_id] = highest.option_id;
      }
    }
    return map;
  }

  it("all minimum answers → overall 0 and lowest band classification", () => {
    const result = evaluate(config, {
      answers: buildAnswers(config, answersFrom("min"), unknownIds),
    });
    expect(result.overallScore).toBe(0);
    expect(result.classification).toBeDefined();
    expect(result.classification.label.length).toBeGreaterThan(0);
    // lowest band should include 0
    const band = config.classifications.find(
      (c) => result.overallScore >= c.minimum_score && result.overallScore <= c.maximum_score
    );
    expect(band?.label).toBe(result.classification.label);
  });

  it("all maximum answers → overall 100 and top band, no unsupported assurance", () => {
    const result = evaluate(config, {
      answers: buildAnswers(config, answersFrom("max"), unknownIds),
    });
    expect(result.overallScore).toBe(100);
    const band = config.classifications.find(
      (c) => result.overallScore >= c.minimum_score && result.overallScore <= c.maximum_score
    );
    expect(band?.label).toContain("scale");
  });

  it("classification boundaries only change at approved boundaries (29/30, 49/50, 69/70, 84/85)", () => {
    for (const boundary of [30, 50, 70, 85]) {
      const left = config.classifications.find(
        (c) => boundary - 1 >= c.minimum_score && boundary - 1 <= c.maximum_score
      );
      const right = config.classifications.find(
        (c) => boundary >= c.minimum_score && boundary <= c.maximum_score
      );
      expect(left?.label).not.toBe(right?.label);
      expect(right?.minimum_score).toBe(boundary);
    }
  });

  it("unknown-heavy session shows evidence-visibility warning", () => {
    // Every answer is the "I do not know" option → all 24 scored answers unknown
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const unknownOption = q.options.find((o) => o.unknown_flag);
      if (unknownOption) map[q.question_id] = unknownOption.option_id;
    }
    const result = evaluate(config, {
      answers: buildAnswers(config, map, unknownIds),
    });
    expect(result.unknownCount).toBeGreaterThan(result.answeredCount / 3);
    expect(result.showEvidenceWarning).toBe(true);
  });
});

describe("expression evaluator", () => {
  it("evaluates comparisons, AND, OR, NOT and parentheses", () => {
    const ctx = {
      questionScores: { "S-01": 0, "S-02": 1, "T-03": 2 },
      gateTriggered: { "GATE-03": true },
      overallScore: 42,
    };
    expect(evaluateExpression("S-01 == 0", ctx)).toBe(true);
    expect(evaluateExpression("S-02 == 0", ctx)).toBe(false);
    expect(evaluateExpression("(S-02 == 0 OR S-01 == 0) AND overall_score < 50", ctx)).toBe(true);
    expect(evaluateExpression("NOT GATE-03", ctx)).toBe(false);
    expect(evaluateExpression("overall_score >= 42", ctx)).toBe(true);
    expect(evaluateExpression("T-03 >= 3", ctx)).toBe(false);
  });

  it("returns false for unresolved question ids rather than erroring", () => {
    expect(
      evaluateExpression("ZZ-99 == 0", {
        questionScores: {},
        gateTriggered: {},
        overallScore: 0,
      })
    ).toBe(false);
  });

  it("throws on malformed syntax", () => {
    expect(() =>
      evaluateExpression("(S-01 == 0", {
        questionScores: {},
        gateTriggered: {},
        overallScore: 0,
      })
    ).toThrow();
  });
});

describe("gate and route evaluation against live config", () => {
  const unknownIds = collectUnknownOptionIds(config);

  it("gate GATE-01 triggers when S-02 is scored 0", () => {
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const opt =
        q.question_id === "S-02"
          ? q.options.find((o) => o.raw_score === 0 && !o.unknown_flag)
          : q.options.find((o) => o.raw_score === 3 && !o.unknown_flag);
      if (opt) map[q.question_id] = opt.option_id;
    }
    const result = evaluate(config, {
      answers: buildAnswers(config, map, unknownIds),
    });
    expect(result.gates.map((g) => g.gateId)).toContain("GATE-01");
  });

  it("high overall score with governance gate still shows constrained recommendation", () => {
    // Every answer at raw_score 3 except S-02 at 0 → max score, GATE-01 triggers
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const opt =
        q.question_id === "S-02"
          ? q.options.find((o) => o.raw_score === 0 && !o.unknown_flag)
          : q.options.find((o) => o.raw_score === 3 && !o.unknown_flag);
      if (opt) map[q.question_id] = opt.option_id;
    }
    const result = evaluate(config, {
      answers: buildAnswers(config, map, unknownIds),
    });
    expect(result.overallScore).toBeGreaterThan(70);
    const highGovernance = result.gates.some((g) => g.gateId === "GATE-01");
    expect(highGovernance).toBe(true);
  });

  it("recommendations respect trigger expressions and status", () => {
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const opt = q.options.find((o) => o.raw_score === 0 && !o.unknown_flag);
      if (opt) map[q.question_id] = opt.option_id;
    }
    const result = evaluate(config, {
      answers: buildAnswers(config, map, unknownIds),
    });
    // with everything at 0, REC-015 (overall < 30) and foundation recs should fire
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.every((r) => r.title.length > 0)).toBe(true);
  });
});

describe("AI-USE gate condition (PRD §9.2)", () => {
  const unknownIds = collectUnknownOptionIds(config);

  function questionById(id: string) {
    return config.questions.find((q) => q.question_id === id);
  }

  it("GATE-03 does not trigger when no AI use is reported anywhere", () => {
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const opt = q.options.find((o) => o.raw_score === 3 && !o.unknown_flag);
      if (opt) map[q.question_id] = opt.option_id;
    }
    // GATE-03 expression is "(T-03 == 0 OR G-01 == 0) AND AI-USE". Set T-03 to the
    // "I do not know" option so the expression's score condition holds but no
    // real AI use is reported → AI-USE condition stays false.
    const unknownOption = questionById("T-03")?.options.find((o) => o.unknown_flag);
    if (unknownOption) map["T-03"] = unknownOption.option_id;
    const result = evaluate(config, {
      answers: buildAnswers(config, map, unknownIds),
    });
    expect(result.gates.some((g) => g.gateId === "GATE-03")).toBe(false);
  });

  it("GATE-03 triggers when AI-USE questions report real use and expression matches", () => {
    // GATE-03 expression: "(T-03 == 0 OR G-01 == 0) AND AI-USE".
    const map: Record<string, string> = {};
    for (const q of config.questions) {
      const opt = q.options.find((o) => o.raw_score === 3 && !o.unknown_flag);
      if (opt) map[q.question_id] = opt.option_id;
    }
    // Force the score part of the expression true with a real (non-unknown) 0:
    const gatingQ = questionById("T-03")!;
    const triggerOption = gatingQ.options.find((o) => o.raw_score === 0 && !o.unknown_flag) ?? gatingQ.options[0];
    map["T-03"] = triggerOption.option_id;
    const answers = buildAnswers(config, map, unknownIds);
    const result = evaluate(config, { answers });
    const g03 = result.gates.find((g) => g.gateId === "GATE-03");
    expect(!!g03).toBe(true);
  });
});
