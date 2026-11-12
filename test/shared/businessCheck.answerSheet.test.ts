import { describe, expect, it } from "vitest";
import { answerInWords, answerSheet, answeredCount } from "@shared/businessCheck/answerSheet";
import { SECTIONS } from "@shared/businessCheck/questions";
import { questionPath } from "@shared/businessCheck/engine";
import { businessCheckProfiles } from "../fixtures/businessCheckProfiles";

/** The owner's answers as the team reads them (R84): in words, in the order asked, nothing recalculated. */
describe("the answer sheet", () => {
  it("lists every question on the owner's path, in order, with the wording they saw", () => {
    for (const answers of Object.values(businessCheckProfiles)) {
      const sheet = answerSheet(answers);
      expect(sheet.flatMap(section => section.questions.map(question => question.id))).toEqual(questionPath(answers).map(step => step.question.id));
    }
  });

  it("writes a choice as its words, several joined with commas, and typed text as typed", () => {
    const stage = SECTIONS.profile.questions.find(question => question.id === "p_stage")!;
    const option = stage.options[0]!;
    expect(answerInWords(stage, { p_stage: option.value })).toBe(option.label);
    const multi = Object.values(SECTIONS).flatMap(section => section.questions).find(question => question.kind === "multi")!;
    const [first, second] = multi.options;
    expect(answerInWords(multi, { [multi.id]: [first!.value, second!.value] })).toBe(`${first!.label}, ${second!.label}`);
    const text = Object.values(SECTIONS).flatMap(section => section.questions).find(question => question.kind === "text")!;
    expect(answerInWords(text, { [text.id]: "  Ada Foods  " })).toBe("Ada Foods");
  });

  it("says nothing was answered for a skipped or missing answer, and counts only what was answered", () => {
    const text = SECTIONS.profile.questions.find(question => question.kind === "text")!;
    expect(answerInWords(text, { [text.id]: "" })).toBeNull();
    expect(answerInWords(text, {})).toBeNull();
    const sheet = answerSheet({});
    expect(sheet.map(section => section.id)).toEqual(["profile"]);
    expect(answeredCount(sheet)).toBe(0);
    const full = answerSheet(businessCheckProfiles.smallOperatingTrader!);
    expect(answeredCount(full)).toBeGreaterThan(10);
  });
});
