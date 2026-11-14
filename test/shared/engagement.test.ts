import { describe, expect, it } from "vitest";
import { ASSESSMENT_TEMPLATE, splitNumberedList } from "@shared/engagement";

describe("numbered questions in a task's detail", () => {
  it("splits the six pre-call questions into their opening line and six items", () => {
    const six = ASSESSMENT_TEMPLATE.dataRequests.find(item => item.title.startsWith("Answer six quick questions"))!;
    const list = splitNumberedList(six.detail)!;
    expect(list.intro).toBe("A few words each is enough.");
    expect(list.items).toHaveLength(6);
    expect(list.items[0]).toBe("What do you sell, and who buys it?");
    expect(list.items[5]).toBe("If you could fix one thing in three months, what would it be?");
  });

  it("works without an opening line and with items already on their own lines", () => {
    expect(splitNumberedList("1. Bank statements\n2. Price list")).toEqual({ intro: "", items: ["Bank statements", "Price list"] });
  });

  it("leaves ordinary text alone: no list, a single item, numbers out of order, or a number inside a sentence", () => {
    expect(splitNumberedList("Rent, salaries, stock, power, fuel and loan repayments. A rough list is fine.")).toBeNull();
    expect(splitNumberedList("Send this. 1. Only one thing")).toBeNull();
    expect(splitNumberedList("1. First 3. Third")).toBeNull();
    expect(splitNumberedList("Sales for the last 12 months. Month by month.")).toBeNull();
  });
});

describe("project roles by type of engagement (R45)", () => {
  it("offers the Digital Marketer and the Content Producer on Digital marketing only, and shows them after the lead", async () => {
    const { teamRolesFor, ENGAGEMENT_TEAM_ROLE_LABELS, ENGAGEMENT_TEAM_ROLE_ORDER, ENGAGEMENT_REVIEW_ROLES } = await import("@shared/engagement");
    expect(teamRolesFor("digital_marketing")).toEqual(expect.arrayContaining(["digital_marketer", "content_producer"]));
    expect(teamRolesFor("business_review")).not.toContain("digital_marketer");
    expect(teamRolesFor("business_review")).not.toContain("content_producer");
    expect([ENGAGEMENT_TEAM_ROLE_LABELS.digital_marketer, ENGAGEMENT_TEAM_ROLE_LABELS.content_producer]).toEqual(["Digital Marketer", "Content Producer"]);
    expect(ENGAGEMENT_TEAM_ROLE_ORDER.lead).toBeLessThan(ENGAGEMENT_TEAM_ROLE_ORDER.digital_marketer);
    expect(ENGAGEMENT_TEAM_ROLE_ORDER.content_producer).toBeLessThan(ENGAGEMENT_TEAM_ROLE_ORDER.analyst);
    // Approval follows the person's level, as for every role (App flow 4.6).
    expect(ENGAGEMENT_REVIEW_ROLES).not.toContain("digital_marketer");
  });
});
