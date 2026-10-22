import { describe, expect, it } from "vitest";
import { buildJourney, CURRENT_STATE, DELIVERY_REMEDY, formatNaira, JOURNEY, PRICES, PROBLEM_AREAS } from "@shared/businessSupport";
import { PAYMENT_ITEM_DETAILS } from "@shared/payments";

describe("prices (ET, 21 October 2026)", () => {
  it("are the top of each range: Full Report ₦100,000, Business Review ₦600,000, Six-Week Fix ₦1,500,000", () => {
    expect(PRICES).toEqual({ fullReport: 100_000, currentState: 600_000, fix: 1_500_000 });
  });

  it("shows the server's Full Report and Business Review prices in the journey, never a starting price", () => {
    const copy = buildJourney({ fullReport: 100_000, currentState: 600_000 }).map((step) => step.body).join(" ");
    expect(copy).toContain("₦100,000");
    expect(copy).toContain("Business Review (₦600,000)");
    expect(copy).not.toMatch(/from ₦600,000/i);
    expect(buildJourney({ fullReport: 100, currentState: 200 }).map((step) => step.body).join(" ")).toContain("₦200");
  });
});

describe("Business Review name", () => {
  it("is one name, from one place, on the site and in payments (renamed from Current State Assessment, 21 October)", () => {
    expect(CURRENT_STATE.name).toBe("Business Review");
    expect(PAYMENT_ITEM_DETAILS.current_state.name).toBe(CURRENT_STATE.name);
    const copy = JOURNEY.map((step) => `${step.name} ${step.body}`).join(" ");
    expect(copy).not.toMatch(/Current State/);
  });
});

describe("How it works (plan page 18)", () => {
  it("runs from the free check to what comes next, in six steps", () => {
    expect(JOURNEY.map((step) => step.id)).toEqual(["check", "first-step", "pay", "records", "deliver", "next"]);
    expect(JOURNEY[0].name).toBe("Free Business Health Check");
  });

  it("states the delivery remedy (as the Terms give it, not an automatic refund) and the independent check before delivery", () => {
    const deliver = JOURNEY.find((step) => step.id === "deliver")!.body;
    expect(deliver).toContain(DELIVERY_REMEDY);
    expect(deliver).not.toMatch(/refund/i);
    expect(deliver).toMatch(/consultant who did not prepare it/);
  });
});

describe("business-support catalogue (concept note v0.8.1)", () => {
  it("numbers the problem areas 0 to 10 without gaps, each with a measure", () => {
    expect(PROBLEM_AREAS.map((area) => area.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const area of PROBLEM_AREAS) expect(area.measure.length).toBeGreaterThan(0);
  });

  it("follows the site copy rules", () => {
    const copy = JOURNEY.map((step) => `${step.name} ${step.body}`).join(" ") + PROBLEM_AREAS.map((area) => area.siteSentence ?? "").join(" ");
    expect(copy).not.toMatch(/\b(door|sprint|playbook|retainer|leverage|holistic|framework|solutions)\b/i);
  });

  it("formats naira in full with thousands separators", () => {
    expect(formatNaira(1_500_000)).toBe("₦1,500,000");
  });
});
