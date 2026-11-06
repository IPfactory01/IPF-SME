import { describe, expect, it } from "vitest";
import { defaultAgreement } from "@shared/agreement";

describe("the proposal a new engagement starts from", () => {
  it("drafts Digital marketing as a monthly service fee of ₦470,000 for three months, the first at signing, with the milestones", () => {
    const draft = defaultAgreement("digital_marketing", null);
    expect(draft.feeLines).toEqual([
      { label: "Month 1 service fee, payable on signing", amount: 470_000, dueOn: null },
      { label: "Month 2 service fee, payable before day 31", amount: 470_000, dueOn: null },
      { label: "Month 3 service fee, payable before day 61", amount: 470_000, dueOn: null },
    ]);
    expect(draft.scope).toContain("Quarter review (day 90):");
    expect(draft.scope).toContain("Milestones:");
    expect(draft.scope).toContain("Reels: 15 a month");
    expect(draft.terms).toContain("the first month on signing");
    // The house register: third person, no second person and no dashes as connectors.
    for (const text of [draft.scope, draft.outOfScope, draft.clientCommitments, draft.terms]) { expect(text).not.toMatch(/\byou(r)?\b/i); expect(text).not.toMatch(/[\u2013\u2014]/); }
  });

  it("drafts a service from its price on the website", () => {
    expect(defaultAgreement("business_review", null).feeLines).toEqual([{ label: "Business Review, payable before work begins", amount: 600_000, dueOn: null }]);
  });
});
