import { describe, expect, it } from "vitest";
import { planRoleOf } from "@shared/engagement";

/** Every team item has a named person (R88): the plan's own items go to the role that does them. */
describe("who does a plan's own item", () => {
  it("gives a Digital Marketing plan to the Digital Marketer, a review to the Analyst, and a consultant review to the Lead Consultant", () => {
    expect(planRoleOf("digital_marketing", "Content plan for month 1")).toBe("digital_marketer");
    expect(planRoleOf("business_review", "Profit by product or outlet, from your numbers")).toBe("analyst");
    expect(planRoleOf("assessment", "Draft the Pricing Review")).toBe("analyst");
    expect(planRoleOf("assessment", "Consultant review")).toBe("lead");
    expect(planRoleOf("something_else", "Anything")).toBeNull();
  });
});
