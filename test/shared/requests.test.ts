import { describe, expect, it } from "vitest";
import { arrivalFields, clockText, dayInWords, earliestRequestDue, followUpOf, hasArrived, requestDueOn, weekStartOf } from "@shared/requests";

/** Asking the client (R78): the day a request falls due, the week it counts in, and the clock once it arrives. */
describe("the day a request falls due", () => {
  it("is the next Thursday at least two days away", () => {
    // Monday 9 November 2026: Thursday is three days away.
    expect(requestDueOn("2026-11-09")).toBe("2026-11-12");
    // Tuesday: Thursday is exactly two days away.
    expect(requestDueOn("2026-11-10")).toBe("2026-11-12");
    // Wednesday, Thursday and Sunday: the Thursday after.
    expect(requestDueOn("2026-11-11")).toBe("2026-11-19");
    expect(requestDueOn("2026-11-12")).toBe("2026-11-19");
    expect(requestDueOn("2026-11-15")).toBe("2026-11-19");
  });

  it("is never sooner than two days away", () => {
    expect(earliestRequestDue("2026-11-11")).toBe("2026-11-13");
    expect(earliestRequestDue("2026-12-31")).toBe("2027-01-02");
  });

  it("counts a week from Monday to Sunday, and says a day in words", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
    expect(weekStartOf("2026-11-16")).toBe("2026-11-16");
    expect(dayInWords("2026-11-19")).toBe("Thursday 19 November");
  });
});

describe("the clock on an item", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const footage = { side: "client", receivedAt: null, turnaround: "first_edit" as const };

  it("starts when the client's side first arrives: the First edit is due 48 hours later", () => {
    const fields = arrivalFields(footage, "done", now);
    expect(fields).toEqual({ receivedAt: now, followUpDueAt: new Date("2026-11-14T10:00:00Z"), followUpDoneAt: null });
    expect(hasArrived(fields)).toBe(true);
    // Received, then accepted: the clock does not move.
    expect(arrivalFields({ ...footage, receivedAt: now }, "accepted", new Date("2026-11-13T10:00:00Z"))).toEqual({});
  });

  it("stamps an item without a clock, and nothing on the team's own items", () => {
    expect(arrivalFields({ side: "client", receivedAt: null, turnaround: null }, "received", now)).toEqual({ receivedAt: now, followUpDueAt: null, followUpDoneAt: null });
    expect(arrivalFields({ side: "ipf", receivedAt: null, turnaround: null }, "done", now)).toEqual({});
  });

  it("stops when the team asks for more or reopens it, and stays as it was when the item is no longer needed", () => {
    const arrived = { ...footage, receivedAt: now };
    expect(arrivalFields(arrived, "needs_more", now)).toEqual({ receivedAt: null, followUpDueAt: null, followUpDoneAt: null });
    expect(arrivalFields(arrived, "open", now)).toEqual({ receivedAt: null, followUpDueAt: null, followUpDoneAt: null });
    expect(arrivalFields(arrived, "cancelled", now)).toEqual({});
    expect(hasArrived(arrivalFields(footage, "needs_more", now))).toBe(false);
  });

  it("reads waiting, running, late and shared", () => {
    const dueAt = new Date("2026-11-14T10:00:00Z");
    expect(followUpOf({ turnaround: null, followUpDueAt: null, followUpDoneAt: null }, now.getTime())).toBeNull();
    expect(followUpOf({ turnaround: "first_edit", followUpDueAt: null, followUpDoneAt: null }, now.getTime())).toMatchObject({ label: "First edit", hours: 48, state: "waiting" });
    expect(followUpOf({ turnaround: "first_edit", followUpDueAt: dueAt, followUpDoneAt: null }, now.getTime())).toMatchObject({ state: "running", hoursLeft: 48 });
    expect(followUpOf({ turnaround: "first_draft", followUpDueAt: dueAt.toISOString(), followUpDoneAt: null }, new Date("2026-11-14T13:30:00Z").getTime())).toMatchObject({ label: "First draft", state: "late", hoursLeft: -3.5 });
    expect(followUpOf({ turnaround: "first_edit", followUpDueAt: dueAt, followUpDoneAt: now }, now.getTime())).toMatchObject({ state: "shared", doneAt: now });
  });

  it("says the hours left, or how late, in whole hours", () => {
    expect(clockText(31.9)).toBe("31 hours left");
    expect(clockText(1.2)).toBe("1 hour left");
    expect(clockText(0.4)).toBe("under an hour left");
    expect(clockText(-0.4)).toBe("under an hour late");
    expect(clockText(-3.5)).toBe("3 hours late");
  });
});
