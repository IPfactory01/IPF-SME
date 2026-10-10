import { describe, expect, it, vi } from "vitest";
import { isMissingEngagementTable, startEngagementSafely } from "@server/engagements";
import { ASSESSMENT_TEMPLATE, clientCanSee, clientCanSeeTask, ENGAGEMENT_STAGE_LABELS, FINDINGS_OUTLINE, journeyOf, type ClientViewer } from "@shared/engagement";

const owner: ClientViewer = { kind: "owner" };
const full: ClientViewer = { kind: "member", access: "full", userId: 7 };
const contributor: ClientViewer = { kind: "member", access: "contributor", userId: 8 };

describe("who on the client's side sees what", () => {
  it("never shows a client anything kept for IP Factory", () => {
    for (const viewer of [owner, full, contributor]) expect(clientCanSee("team", viewer)).toBe(false);
  });

  it("keeps owner-only items for the owner, and shares business items with full-access staff only", () => {
    expect([owner, full, contributor].map(viewer => clientCanSee("owner", viewer))).toEqual([true, false, false]);
    expect([owner, full, contributor].map(viewer => clientCanSee("business", viewer))).toEqual([true, true, false]);
  });

  it("gives contributors only the client-side tasks assigned to them", () => {
    const theirs = { side: "client" as const, assigneeUserId: 8 };
    const unassigned = { side: "client" as const, assigneeUserId: null };
    const ours = { side: "ipf" as const, assigneeUserId: null };
    expect([owner, full, contributor].map(viewer => clientCanSeeTask(theirs, viewer))).toEqual([true, true, true]);
    expect([owner, full, contributor].map(viewer => clientCanSeeTask(unassigned, viewer))).toEqual([true, true, false]);
    expect([owner, full, contributor].map(viewer => clientCanSeeTask(ours, viewer))).toEqual([true, true, false]);
  });
});

describe("the client's journey", () => {
  it("marks the steps before the current one done and the rest next", () => {
    expect(journeyOf("fix").map(step => step.state)).toEqual(["done", "done", "current", "next"]);
    expect(journeyOf("closed").every(step => step.state === "done")).toBe(true);
    expect(ENGAGEMENT_STAGE_LABELS.assessment).toBe("Current State Assessment");
  });
});

describe("before migration 0008 is applied", () => {
  it("recognises the missing table", () => {
    expect(isMissingEngagementTable({ code: "42P01" })).toBe(true);
    expect(isMissingEngagementTable({ cause: { code: "42P01" } })).toBe(true);
    expect(isMissingEngagementTable({ code: "23505" })).toBe(false);
  });

  it("never lets a missing engagement table undo a confirmed payment", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const missing = { transaction: () => Promise.reject(Object.assign(new Error('relation "engagements" does not exist'), { code: "42P01" })) };
    expect(await startEngagementSafely(missing as never, { businessCheckId: 1, paymentRequestId: 1, actorUserId: 1 })).toBe("not_set_up");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("apply migration 0008"));
    const broken = { transaction: () => Promise.reject(new Error("connection lost")) };
    expect(await startEngagementSafely(broken as never, { businessCheckId: 1, paymentRequestId: 1, actorUserId: 1 })).toBe("failed");
    error.mockRestore();
  });
});

describe("the Current State Assessment template (from IP Factory's assessment proposals, 10 October)", () => {
  it("asks for the six pre-call questions, the numbers, the people, the bank statements and what is owed", () => {
    const titles = ASSESSMENT_TEMPLATE.dataRequests.map(item => item.title);
    expect(titles[0]).toBe("Six quick questions before your first call");
    expect(titles).toEqual(expect.arrayContaining(["Your sales for the last 12 months", "What you spend each month", "Your price list", "Who works in the business", "Bank statements for the last 6 months", "Money owed to you, and money you owe", "Anything you already track", "Ten customers: why they buy, and why some stopped"]));
    expect(titles).toHaveLength(9);
    for (const item of ASSESSMENT_TEMPLATE.dataRequests) {
      expect(item.title.length).toBeLessThanOrEqual(60);
      expect(item.detail.length).toBeGreaterThan(10);
    }
    expect(ASSESSMENT_TEMPLATE.dataRequests[0].detail.match(/\d\./g)).toHaveLength(6);
  });

  it("is a Work Plan: every item in week 1 or 2, in order, tagged internal or external, with the team's own actions and both calls placed", () => {
    const items = [...ASSESSMENT_TEMPLATE.dataRequests, ...ASSESSMENT_TEMPLATE.teamActions];
    for (const item of items) {
      expect([1, 2]).toContain(item.week);
      expect(["internal", "external"]).toContain(item.factor);
    }
    for (const week of [1, 2]) {
      const orders = items.filter(item => item.week === week).map(item => item.order).sort((a, b) => a - b);
      expect(orders).toEqual(orders.map((_, index) => index + 1));
    }
    // The assessment tests external factors too (ET, 10 October): customers from the client, competitors from the team.
    expect(ASSESSMENT_TEMPLATE.dataRequests.filter(item => item.factor === "external")).toHaveLength(1);
    expect(ASSESSMENT_TEMPLATE.teamActions.map(item => item.factor).sort()).toEqual(["external", "internal"]);
    expect(ASSESSMENT_TEMPLATE.sessions.map(item => item.week)).toEqual([1, 2]);
  });

  it("gives both calls a timed 90-minute agenda that ends with what happens next", () => {
    expect(ASSESSMENT_TEMPLATE.sessions).toHaveLength(2);
    for (const session of ASSESSMENT_TEMPLATE.sessions) {
      expect(session.durationMinutes).toBe(90);
      expect(session.agenda).toMatch(/^.+\n0 to 10 min:/);
      expect(session.agenda).toMatch(/\n8[05] to 90:/);
    }
    expect(ASSESSMENT_TEMPLATE.sessions[1].agenda).toContain("the one problem to fix first");
  });

  it("keeps the template in the site's words: no internal terms, second person", () => {
    const copy = [...ASSESSMENT_TEMPLATE.dataRequests.flatMap(item => [item.title, item.detail]), ...ASSESSMENT_TEMPLATE.sessions.map(item => item.agenda), FINDINGS_OUTLINE].join(" ");
    expect(copy).not.toMatch(/\b(door|sprint|playbook|retainer|workstream|RACI|stakeholder)\b/i);
    expect(FINDINGS_OUTLINE.split("\n\n")).toHaveLength(7);
    expect(FINDINGS_OUTLINE.startsWith("1. The one problem to fix first")).toBe(true);
  });
});
