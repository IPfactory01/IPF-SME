import { describe, expect, it, vi } from "vitest";
import { isMissingEngagementTable, startEngagementSafely } from "@server/engagements";
import { clientCanSee, clientCanSeeTask, ENGAGEMENT_STAGE_LABELS, journeyOf, type ClientViewer } from "@shared/engagement";

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
