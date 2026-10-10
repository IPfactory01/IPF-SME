/**
 * Where each business check stands commercially. The first three stages move automatically as the
 * owner goes through the check; the rest are set by the team after the discovery call, or by payment.
 */
export const PIPELINE_STAGES = ["lead", "qualified_lead", "call_booked", "opportunity", "won", "lost", "nurture", "referred"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_LABELS: Record<PipelineStage, { name: string; meaning: string }> = {
  lead: { name: "Lead", meaning: "Gave their details and started the Business Check" },
  qualified_lead: { name: "Qualified lead", meaning: "Finished the Business Check" },
  call_booked: { name: "Debrief booked", meaning: "Asked for the free Debrief" },
  opportunity: { name: "Opportunity", meaning: "After the Debrief: we can help; payment details sent" },
  won: { name: "Won", meaning: "Paid" },
  lost: { name: "Lost", meaning: "Link expired, or they said no" },
  nurture: { name: "Nurture", meaning: "Not now: too early or too small; follow up later" },
  referred: { name: "Referred", meaning: "Sent to IPF Advisory or a specialist" },
};

const AUTOMATIC: readonly PipelineStage[] = ["lead", "qualified_lead", "call_booked"];

/**
 * The stage after an automatic event. Automatic events only move a check forward through the
 * first three stages; they never overwrite a stage the team has set.
 */
export function advancePipeline(current: PipelineStage, event: PipelineStage): PipelineStage {
  if (!AUTOMATIC.includes(current) || !AUTOMATIC.includes(event)) return current;
  return AUTOMATIC.indexOf(event) > AUTOMATIC.indexOf(current) ? event : current;
}
