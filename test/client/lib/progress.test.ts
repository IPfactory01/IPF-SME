import { describe, expect, it } from "vitest";
import { progressOf, type ProgressTask } from "@/lib/progress";

const task = (over: Partial<ProgressTask>): ProgressTask => ({ id: 1, side: "client", kind: "data_request", status: "open", title: "Item", ref: null, section: null, priority: null, dueOn: null, weekNumber: 1, owners: [], ...over });
const base = { sessions: [], startedOn: "2026-11-11", today: "2026-11-14", now: Date.UTC(2026, 10, 14, 12) };

describe("Progress (R92)", () => {
  it("counts the Data Requests as the firm's sheet does: received, outstanding, overdue, high priority open, by section, next due", () => {
    const tasks = [
      task({ id: 1, section: "A Brand", status: "accepted" }),
      task({ id: 2, section: "A Brand", status: "received" }),
      task({ id: 3, section: "B Accounts", status: "open", priority: "high", dueOn: "2026-11-13", ref: "B1", title: "Access to your accounts" }),
      task({ id: 4, section: "B Accounts", status: "needs_more", dueOn: "2026-11-20" }),
      task({ id: 5, section: "C Offers", status: "not_available" }),
      task({ id: 6, status: "cancelled" }),
      task({ id: 7, kind: "action", side: "ipf", status: "done" }),
    ];
    const { dataRequests } = progressOf({ ...base, tasks });
    expect(dataRequests).toMatchObject({ requested: 5, received: 2, checking: 1, outstanding: 2, overdue: 1, notAvailable: 1, highOpen: 1 });
    expect(dataRequests!.bySection).toEqual([
      { section: "A Brand", received: 2, outstanding: 0, total: 2 },
      { section: "B Accounts", received: 0, outstanding: 2, total: 2 },
      { section: "C Offers", received: 0, outstanding: 0, total: 1 },
    ]);
    expect(dataRequests!.next).toEqual({ title: "Access to your accounts", ref: "B1", dueOn: "2026-11-13" });
    expect(progressOf({ ...base, tasks: [task({ kind: "action" })] }).dataRequests).toBeNull();
  });

  it("lays the Work Plan out by week, and each owner's load, late first", () => {
    const kemi = { userId: 1, name: "Kemi Producer" };
    const lewis = { userId: 2, name: "Lewis Lead" };
    const tasks = [
      task({ id: 1, kind: "action", side: "ipf", weekNumber: 1, status: "done", owners: [kemi] }),
      task({ id: 2, kind: "action", side: "ipf", weekNumber: 1, status: "open", dueOn: "2026-11-12", owners: [lewis, kemi] }),
      task({ id: 3, kind: "action", side: "ipf", weekNumber: null, status: "received", dueOn: "2026-11-20", owners: [lewis] }),
      task({ id: 4, kind: "action", side: "ipf", weekNumber: 2, status: "open", dueOn: "2026-11-30", owners: [kemi] }),
    ];
    const { plan, people } = progressOf({ ...base, tasks });
    expect(plan).toMatchObject({ total: 4, done: 1, checking: 1, open: 2, overdue: 1 });
    expect(plan.byWeek).toEqual([
      { week: 1, done: 1, checking: 0, open: 0, overdue: 1, total: 2 },
      { week: 2, done: 0, checking: 1, open: 1, overdue: 0, total: 2 },
    ]);
    expect(people.map(person => [person.name, person.open, person.overdue, person.done])).toEqual([["Kemi Producer", 2, 1, 1], ["Lewis Lead", 1, 1, 0]]);
  });

  it("counts only published content against this month's target, Sessions held of those due, and fees paid, left and late", () => {
    const result = progressOf({
      ...base, tasks: [],
      content: [{ kind: "reel", month: 1, status: "published" }, { kind: "reel", month: 1, status: "approved" }, { kind: "story", month: 1, status: "published" }, { kind: "reel", month: 2, status: "published" }],
      contentTargets: [{ label: "Reels", count: 15 }, { label: "Posts", count: 5 }, { label: "Stories", count: 20 }], currentMonth: 1,
      sessions: [{ status: "held", scheduledFor: "2026-11-11T10:00:00Z" }, { status: "planned", scheduledFor: "2026-11-13T10:00:00Z" }, { status: "planned", scheduledFor: "2026-11-18T10:00:00Z" }, { status: "cancelled", scheduledFor: "2026-11-12T10:00:00Z" }, { status: "planned", scheduledFor: null }],
      fees: [{ amount: 500_000, paidAmount: 500_000, left: 0, dueOn: "2026-11-11" }, { amount: 500_000, paidAmount: 0, left: 500_000, dueOn: "2026-11-13" }, { amount: 500_000, paidAmount: 0, left: 500_000, dueOn: "2026-12-11" }],
    });
    expect(result.content).toEqual({ month: 1, rows: [{ label: "Reels", target: 15, published: 1 }, { label: "Posts", target: 5, published: 0 }, { label: "Stories", target: 20, published: 1 }] });
    expect(result.sessions).toEqual({ held: 1, due: 2, next: new Date("2026-11-18T10:00:00Z") });
    expect(result.fees).toEqual({ total: 1_500_000, paid: 500_000, left: 1_000_000, late: 500_000 });
  });
});
