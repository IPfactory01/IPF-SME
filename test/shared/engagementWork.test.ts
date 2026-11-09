import { describe, expect, it } from "vitest";
import { dayLabel, workLines, workOf, WORK_TITLE } from "@shared/engagementWork";

describe("What we will do (R47)", () => {
  it("is not called Your Plan, the method's plan handed over at the end", () => {
    expect(WORK_TITLE).toBe("What we will do");
  });

  it("describes the work from the service bought, the Business Review, or the type", () => {
    expect(workOf({ type: "done_for_you", service: "pitch_deck" }).what).toMatch(/\w/);
    expect(workOf({ type: "business_review", service: null }).youGet).toContain("The one problem to fix first, in your words");
    expect(workOf({ type: "digital_marketing", service: null }).youGet).toEqual(["15 reels a month", "5 posts a month", "20 stories a month", "A review at the end of each month, and of the quarter"]);
    expect(workOf({ type: "assessment", service: null })).toEqual({ what: "", youGet: [] });
  });

  it("writes the welcome email's lines: the work, the start and each fee with its date", () => {
    const lines = workLines({ type: "digital_marketing", service: null, startsOn: "2026-11-02", fees: [{ label: "Month 1 service fee", amount: 470000, dueOn: "2026-11-02" }, { label: "Month 2 service fee", amount: 470000, dueOn: null }] });
    expect(lines[0]).toBe("WHAT WE WILL DO");
    expect(lines).toContain("• 15 reels a month");
    expect(lines).toContain("Starts: Mon 2 Nov 2026");
    expect(lines).toContain("• Month 1 service fee: ₦470,000, due Mon 2 Nov 2026");
    expect(lines).toContain("• Month 2 service fee: ₦470,000");
    expect(workLines({ type: "assessment", service: null, startsOn: null, fees: [] })).toEqual([]);
  });

  it("writes a day in Lagos with its year and no comma", () => {
    expect(dayLabel("2026-11-10")).toBe("Tue 10 Nov 2026");
  });
});
