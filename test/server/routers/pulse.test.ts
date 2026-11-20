import { describe, expect, it } from "vitest";
import { invalidAnswers, newPulseSessionId, PULSE_METHOD, renderProjection, scoreAnswers, sizeIdOf } from "@server/routers/pulse";

const allAnswers = () => PULSE_METHOD.questions.map((q) => ({ questionId: q.question_id, selectedOptionId: q.options.filter((o) => !o.unknown_flag).at(-1)!.option_id, isUnknown: false }));

/** The Pulse router's rules that need no database (R107). */
describe("the Pulse rules", () => {
  it("names each staff range from the first screen as the guidance and pathway engines size a business", () => {
    expect(PULSE_METHOD.controlled_lists.find((list) => list.field === "employee_range")?.values.map(sizeIdOf)).toEqual(["micro", "small", "medium", "large", "large"]);
    expect(sizeIdOf("11–50")).toBe("small");
    expect(sizeIdOf(null)).toBeUndefined();
    expect(sizeIdOf("about forty")).toBeUndefined();
  });

  it("gives every respondent a 32-character key in their link", () => {
    const ids = new Set(Array.from({ length: 50 }, newPulseSessionId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it("accepts a complete set of answers and scores the best options at the top band", () => {
    expect(invalidAnswers(PULSE_METHOD, allAnswers())).toEqual({ problems: [], missing: [] });
    const result = scoreAnswers(PULSE_METHOD, allAnswers());
    expect(result.overallScore).toBe(100);
    expect(result.unknownCount).toBe(0);
  });

  it("names unknown questions, foreign options and a scored option sent as \"I don't know\"", () => {
    const [first, second, ...rest] = allAnswers();
    const { problems, missing } = invalidAnswers(PULSE_METHOD, [
      { questionId: "Z-99", selectedOptionId: null, isUnknown: false },
      { ...first, selectedOptionId: second.selectedOptionId },
      { ...second, isUnknown: true },
      ...rest.slice(1),
    ]);
    expect(problems).toEqual([
      'unknown question "Z-99"',
      `question "${first.questionId}": unknown option "${second.selectedOptionId}"`,
      `question "${second.questionId}": option "${second.selectedOptionId}" is not an "I don't know" option`,
    ]);
    expect(missing).toEqual([rest[0].questionId]);
  });

  it("projects the method without its scores, gates or route rules", () => {
    const projection = renderProjection(PULSE_METHOD);
    expect(Object.keys(projection.questions[0].options[0]).sort()).toEqual(["label", "option_id", "unknown_flag"]);
    expect(projection).not.toHaveProperty("gates");
    expect(projection.questions.every((q) => !q.guidance.isPersonalised)).toBe(true);
  });
});
