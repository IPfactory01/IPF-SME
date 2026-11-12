/**
 * The owner's own answers, as the team reads them on the Business Health Check record (R84): each section on the
 * owner's path, each question in the wording they saw, and what they answered in words. Pure and read only: nothing is
 * scored or recalculated here.
 */
import { optionsFor, promptFor, sectionPath, visibleQuestions } from "./engine";
import { SECTIONS, type Answers, type Question } from "./questions";

export type AnswerSheetSection = { id: string; title: string; area: number | null; questions: { id: string; prompt: string; answer: string | null }[] };

/** One answer in words: the option's label (several joined with commas), what was typed, or null when not answered. */
export function answerInWords(question: Question, answers: Answers): string | null {
  const value = answers[question.id];
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (question.kind === "text") return typeof value === "string" && value.trim() ? value.trim() : null;
  const options = optionsFor(question, answers);
  const label = (chosen: string) => options.find(option => option.value === chosen)?.label ?? question.options.find(option => option.value === chosen)?.label ?? chosen;
  return (Array.isArray(value) ? value : [value]).map(label).join(", ");
}

/** Every section on the owner's path with its questions and answers, in the order they were asked. */
export function answerSheet(answers: Answers): AnswerSheetSection[] {
  return sectionPath(answers).map(id => {
    const section = SECTIONS[id];
    return {
      id,
      title: section.title,
      area: section.area ?? null,
      questions: visibleQuestions(section, answers).map(question => ({ id: question.id, prompt: promptFor(question, answers), answer: answerInWords(question, answers) })),
    };
  }).filter(section => section.questions.length > 0);
}

/** How many questions were answered, for the button that opens the sheet. */
export const answeredCount = (sheet: readonly AnswerSheetSection[]) => sheet.reduce((sum, section) => sum + section.questions.filter(question => question.answer !== null).length, 0);
