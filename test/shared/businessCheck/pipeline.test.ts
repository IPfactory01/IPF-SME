import { describe, expect, it } from "vitest";
import { advancePipeline, PIPELINE_LABELS, PIPELINE_STAGES } from "@shared/businessCheck/pipeline";

describe("pipeline stages", () => {
  it("uses the agreed stage names, in order", () => {
    expect(PIPELINE_STAGES.map((stage) => PIPELINE_LABELS[stage].name)).toEqual(["Lead", "Qualified lead", "Debrief booked", "Opportunity", "Won", "Lost", "Nurture", "Referred"]);
  });

  it("moves forward automatically through lead, qualified lead and call booked", () => {
    expect(advancePipeline("lead", "qualified_lead")).toBe("qualified_lead");
    expect(advancePipeline("qualified_lead", "call_booked")).toBe("call_booked");
    expect(advancePipeline("lead", "call_booked")).toBe("call_booked");
  });

  it("never moves backwards", () => {
    expect(advancePipeline("call_booked", "qualified_lead")).toBe("call_booked");
    expect(advancePipeline("qualified_lead", "lead")).toBe("qualified_lead");
  });

  it("never overwrites a stage the team has set", () => {
    for (const manual of ["opportunity", "won", "lost", "nurture", "referred"] as const) {
      expect(advancePipeline(manual, "call_booked")).toBe(manual);
      expect(advancePipeline(manual, "qualified_lead")).toBe(manual);
    }
  });
});
