import { PIPELINE_LABELS, type PipelineStage } from "./pipeline";

/**
 * What the admin console calls the state of a business check. This is DISPLAY wording only: the stored pipeline stage
 * (shared/businessCheck/pipeline.ts) is unchanged. The stored stage `call_booked` covers both a call that is only
 * requested and one with a time: it reads "Call booked" once the time is known (a Calendly booking, read on the server,
 * or a time an administrator recorded), and "Call requested" until then.
 */
export const FUNNEL_STATUSES = [
  "in_progress",
  "completed",
  "call_requested",
  "call_scheduled",
  "fit",
  "referred",
  "declined",
  "nurture",
  "won",
  "onboarding",
  "onboarded",
] as const;
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];

/**
 * `tone` only chooses a colour treatment; it carries no meaning of its own. Labels use the owner's agreed pipeline
 * names (Lead, Qualified lead, Opportunity, Lost, Nurture…); the internal ids (fit, declined…) are unchanged.
 */
export type FunnelTone = "muted" | "neutral" | "attention" | "info" | "positive" | "negative";

export const FUNNEL_STATUS_LABELS: Record<FunnelStatus, { label: string; tone: FunnelTone }> = {
  in_progress: { label: "Lead", tone: "muted" },
  completed: { label: "Qualified lead", tone: "neutral" },
  call_requested: { label: "Debrief requested", tone: "attention" },
  call_scheduled: { label: "Debrief booked", tone: "info" },
  fit: { label: "Opportunity", tone: "positive" },
  referred: { label: "Referred", tone: "info" },
  declined: { label: "Lost", tone: "negative" },
  nurture: { label: "Nurture", tone: "muted" },
  won: { label: "Won", tone: "positive" },
  onboarding: { label: "Onboarding", tone: "info" },
  onboarded: { label: "Onboarded", tone: "positive" },
};

type Dateish = Date | string | null | undefined;

export function funnelStatus(input: {
  pipelineStage: PipelineStage;
  completedAt?: Dateish;
  callScheduledFor?: Dateish;
  /** The state of the check's most recent onboarding invitation, if there is one. */
  invitationStatus?: "pending" | "accepted" | "revoked" | "expired" | null;
}): FunnelStatus {
  // An invitation that is out, or accepted, is the most advanced thing that can be true of a prospect.
  if (input.invitationStatus === "accepted") return "onboarded";
  if (input.invitationStatus === "pending") return "onboarding";
  switch (input.pipelineStage) {
    case "opportunity": return "fit";
    case "referred": return "referred";
    case "lost": return "declined";
    case "nurture": return "nurture";
    case "won": return "won";
    case "call_booked": return input.callScheduledFor ? "call_scheduled" : "call_requested";
    case "qualified_lead": return "completed";
    case "lead": return input.completedAt ? "completed" : "in_progress";
  }
}

/** A fit who has not been sent an onboarding link yet: the next step is Client Onboarding. */
export const isReadyToOnboard = (status: FunnelStatus) => status === "fit";

export const funnelStatusLabel = (status: FunnelStatus) => FUNNEL_STATUS_LABELS[status].label;

/**
 * The name the admin console gives a stored stage (stage tabs, "Move to" buttons, stage history): the agreed pipeline
 * name. Calendly bookings now reach the console, so the call stage reads "Call booked"; each row's badge still says
 * "Call requested" until its time is known.
 */
export const stageDisplayName = (stage: PipelineStage) => PIPELINE_LABELS[stage].name;
