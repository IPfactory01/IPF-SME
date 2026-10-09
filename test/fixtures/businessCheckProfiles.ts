import { nextStep } from "@shared/businessCheck/engine";
import type { Answers } from "@shared/businessCheck/questions";

/** Answers every remaining question with the option at `pickIndex` (clamped), to walk a whole path. */
export function completeWith(answers: Answers, pickIndex = 0): Answers {
  const filled = { ...answers };
  for (let guard = 0; guard < 100; guard++) {
    const step = nextStep(filled);
    if (!step) return filled;
    // Typed answers (the business's name and description) are required: give fictional ones.
    if (step.question.kind === "text") {
      filled[step.question.id] = step.question.id === "p_name" ? "Example Business" : "A fictional business used to test the business check";
      continue;
    }
    const options = step.question.options;
    const option = options[Math.min(pickIndex, options.length - 1)];
    filled[step.question.id] = step.question.kind === "multi" ? [option.value] : option.value;
  }
  throw new Error("path did not finish");
}

/** The five representative Free Business Check profiles whose outputs are pinned before and after the migration. */
export const businessCheckProfiles: Record<string, Answers> = {
  ideaStageFounder: completeWith({ p_stage: "idea", p_type: "expert", p_sector: "services" }, 2),
  smallOperatingTrader: completeWith({ p_stage: "operating", p_type: "trader", p_sector: "retail", p_age: "2to5", p_staff: "1to2", p_revenue: "1to3m", p_trend: "flat" }, 1),
  growingMaker: completeWith({ p_stage: "operating", p_type: "maker", p_sector: "food and drink", p_age: "2to5", p_staff: "6to10", p_revenue: "3to5m", p_trend: "growing" }, 0),
  advisoryRouteBusiness: completeWith({ p_stage: "operating", p_type: "mixed", p_sector: "manufacturing", p_age: "over10", p_staff: "over50", p_revenue: "over25m", p_trend: "growing" }, 0),
  weakFounderReadiness: completeWith({
    p_stage: "operating", p_type: "trader", p_sector: "retail", p_age: "under2", p_staff: "1to2", p_revenue: "under1m", p_trend: "early",
    f_instinct: "S", f_seen: "S", f_team: "solo", f_tough: "nobody", f_education: "none", f_finance: ["none"], f_hours: "lt2",
  }, 0),
};

export const profileContact = (name: string) => ({
  fullName: `Profile ${name}`,
  email: `${name.toLowerCase()}@example.test`,
  businessName: `${name} Business`,
  description: "Controlled regression profile.",
});
