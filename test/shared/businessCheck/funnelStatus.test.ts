import { describe, expect, it } from "vitest";
import { FUNNEL_STATUSES, FUNNEL_STATUS_LABELS, funnelStatus, funnelStatusLabel, isReadyToOnboard, stageDisplayName } from "@shared/businessCheck/funnelStatus";
import { PIPELINE_LABELS, PIPELINE_STAGES, type PipelineStage } from "@shared/businessCheck/pipeline";

const done = new Date("2026-10-05T09:00:00Z");
const scheduled = new Date("2026-10-08T13:00:00Z");

describe("funnelStatus: the plain words the admin console uses", () => {
  it.each([
    [{ pipelineStage: "lead" }, "in_progress", "Lead"],
    [{ pipelineStage: "lead", completedAt: done }, "completed", "Qualified lead"],
    [{ pipelineStage: "qualified_lead", completedAt: done }, "completed", "Qualified lead"],
    [{ pipelineStage: "call_booked", completedAt: done }, "call_requested", "Debrief requested"],
    [{ pipelineStage: "call_booked", completedAt: done, callScheduledFor: scheduled }, "call_scheduled", "Debrief booked"],
    [{ pipelineStage: "opportunity", completedAt: done }, "fit", "Opportunity"],
    [{ pipelineStage: "referred", completedAt: done }, "referred", "Referred"],
    [{ pipelineStage: "lost", completedAt: done }, "declined", "Lost"],
    [{ pipelineStage: "nurture", completedAt: done }, "nurture", "Nurture"],
    [{ pipelineStage: "won", completedAt: done }, "won", "Won"],
  ] as const)("%j -> %s (%s)", (input, key, label) => {
    expect(funnelStatus(input as never)).toBe(key);
    expect(funnelStatusLabel(key)).toBe(label);
  });

  it("shows a call as 'Debrief requested' until its time is known, then 'Debrief booked'", () => {
    expect(funnelStatusLabel(funnelStatus({ pipelineStage: "call_booked", completedAt: done }))).toBe("Debrief requested");
    expect(funnelStatusLabel(funnelStatus({ pipelineStage: "call_booked", completedAt: done, callScheduledFor: scheduled }))).toBe("Debrief booked");
    expect(Object.values(FUNNEL_STATUS_LABELS).filter(entry => entry.label === "Debrief booked")).toHaveLength(1);
  });

  it("puts an onboarding invitation ahead of the call outcome", () => {
    expect(funnelStatus({ pipelineStage: "opportunity", invitationStatus: "pending" })).toBe("onboarding");
    expect(funnelStatus({ pipelineStage: "opportunity", invitationStatus: "accepted" })).toBe("onboarded");
    // A revoked or expired link puts the prospect back where the call left them.
    expect(funnelStatus({ pipelineStage: "opportunity", invitationStatus: "revoked" })).toBe("fit");
    expect(funnelStatus({ pipelineStage: "opportunity", invitationStatus: "expired" })).toBe("fit");
  });

  it("names a status for every stored stage, so no stage can show a blank", () => {
    for (const stage of PIPELINE_STAGES) {
      const status = funnelStatus({ pipelineStage: stage as PipelineStage, completedAt: done });
      expect(FUNNEL_STATUSES).toContain(status);
      expect(FUNNEL_STATUS_LABELS[status].label.length).toBeGreaterThan(0);
    }
  });

  it("treats only a fit as ready to onboard", () => {
    expect(FUNNEL_STATUSES.filter(isReadyToOnboard)).toEqual(["fit"]);
  });

  it("changes the wording only: the stored stage names are untouched", () => {
    expect(PIPELINE_STAGES.map(stage => PIPELINE_LABELS[stage].name)).toEqual(["Lead", "Qualified lead", "Debrief booked", "Opportunity", "Won", "Lost", "Nurture", "Referred"]);
  });
});

describe("stageDisplayName: stage names in the admin console", () => {
  it("uses the agreed pipeline names", () => {
    expect(PIPELINE_STAGES.map(stageDisplayName)).toEqual(["Lead", "Qualified lead", "Debrief booked", "Opportunity", "Won", "Lost", "Nurture", "Referred"]);
  });
});
