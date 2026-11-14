import { describe, expect, it } from "vitest";
import { planRoleOf } from "@shared/engagement";

/** Every team item has a named person (R88): the plan's own items go to the role that does them. */
describe("who does a plan's own item", () => {
  it("gives a Digital Marketing plan to the Digital Marketer, a review to the Analyst, and a consultant review to the Lead Consultant", () => {
    expect(planRoleOf("digital_marketing", "Prepare the content plan for month 1")).toBe("digital_marketer");
    expect(planRoleOf("business_review", "Work out profit by product or outlet, from your numbers")).toBe("analyst");
    expect(planRoleOf("assessment", "Draft the Pricing Review")).toBe("analyst");
    expect(planRoleOf("assessment", "Consultant review")).toBe("lead");
    expect(planRoleOf("something_else", "Anything")).toBeNull();
  });
});

describe("every standard Work Plan item starts with a verb (ET, 14 November 2026)", () => {
  it("names each item of every plan as an action", async () => {
    const { DIGITAL_MARKETING, serviceStarter } = await import("@shared/engagementTypes");
    const { ASSESSMENT_TEMPLATE } = await import("@shared/engagement");
    const { PRODUCTS } = await import("@shared/products");
    const VERBS = ["Answer", "Send", "Share", "Give", "Approve", "Prepare", "Record", "Assess", "List", "Tell", "Find", "Work", "Draft", "Review"];
    const titles = [
      ...[...DIGITAL_MARKETING.dataRequests, ...DIGITAL_MARKETING.clientActions, ...DIGITAL_MARKETING.teamActions].map(item => item.title),
      ...[...ASSESSMENT_TEMPLATE.dataRequests, ...ASSESSMENT_TEMPLATE.teamActions].map(item => item.title),
      ...Object.values(PRODUCTS).flatMap(product => { const plan = serviceStarter(product as never); return [...plan.dataRequests, ...plan.teamActions].map(item => item.title); }),
    ];
    expect(titles.filter(title => !VERBS.includes(title.split(/[\s:]/)[0]!))).toEqual([]);
  });
});
