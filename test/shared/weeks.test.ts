import { describe, expect, it } from "vitest";
import { weekDays, weekLabel, weekOfDay, weekPlace } from "@shared/weeks";

/** The weeks every Work Plan card follows (R85): seven days from the start date. */
describe("the weeks of an engagement", () => {
  it("counts weeks of seven days from the start", () => {
    expect(weekOfDay("2026-11-11", "2026-11-11")).toBe(1);
    expect(weekOfDay("2026-11-11", "2026-11-17")).toBe(1);
    expect(weekOfDay("2026-11-11", "2026-11-18")).toBe(2);
    expect(weekOfDay("2026-11-11", "2026-11-10")).toBeNull();
    expect(weekOfDay(null, "2026-11-18")).toBeNull();
    expect(weekDays("2026-11-11", 3)).toEqual({ from: "2026-11-25", to: "2026-12-01" });
    expect(weekLabel("2026-11-11", 3)).toBe("25 Nov to 1 Dec");
  });

  it("places a week against today: past, this week, next, later", () => {
    expect(weekPlace("2026-11-11", 1, "2026-11-20")).toBe("past");
    expect(weekPlace("2026-11-11", 2, "2026-11-20")).toBe("now");
    expect(weekPlace("2026-11-11", 3, "2026-11-20")).toBe("next");
    expect(weekPlace("2026-11-11", 5, "2026-11-20")).toBe("later");
    expect(weekPlace("2026-11-11", null, "2026-11-20")).toBe("none");
    // Before it starts, week 1 is the one to look at.
    expect(weekPlace("2026-12-01", 1, "2026-11-20")).toBe("now");
  });
});
