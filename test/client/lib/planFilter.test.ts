import { describe, expect, it } from "vitest";
import { matchesSearch, matchesWhose, roleTag, whoseFrom, whoseValue } from "@/lib/planFilter";

const item = (over: Record<string, unknown> = {}) => ({ side: "ipf", title: "Prepare the first month's content calendar", ref: "2.01", detail: null, owners: [{ userId: 7 }, { userId: 9 }], reviewer: { userId: 4 }, ...over });

describe("whose items and the search (ET, 13 November 2026)", () => {
  it("shows everyone's, my tasks (owned), my reviews (checked), the client's side, or one person's: owned or reviewed", () => {
    expect(matchesWhose(item(), "everyone", null)).toBe(true);
    expect(matchesWhose(item(), "tasks", 9)).toBe(true);
    expect(matchesWhose(item(), "tasks", 4)).toBe(false);
    expect(matchesWhose(item(), "reviews", 4)).toBe(true);
    expect(matchesWhose(item(), "reviews", 9)).toBe(false);
    expect(matchesWhose(item(), "tasks", null)).toBe(false);
    expect(matchesWhose(item(), 4, 5)).toBe(true);
    expect(matchesWhose(item(), 7, 5)).toBe(true);
    expect(matchesWhose(item(), 8, 5)).toBe(false);
    expect(matchesWhose(item(), "client", 5)).toBe(false);
    expect(matchesWhose(item({ side: "client" }), "client", 5)).toBe(true);
  });

  it("matches the title, the reference and a workplan code in the detail, every word, in any case", () => {
    expect(matchesSearch(item(), "")).toBe(true);
    expect(matchesSearch(item(), "CALENDAR")).toBe(true);
    expect(matchesSearch(item(), "2.01")).toBe(true);
    expect(matchesSearch(item(), "content month")).toBe(true);
    expect(matchesSearch(item(), "content footage")).toBe(false);
    expect(matchesSearch(item({ title: "Logo, colours and fonts", ref: "A1", detail: "Done when: …\nWorkplan 1.04, DL02." }), "1.04")).toBe(true);
    // A word that is only in the detail's text does not match: the search is for titles and codes.
    expect(matchesSearch(item({ detail: "Done when: footage is in." }), "footage")).toBe(false);
  });

  it("keeps the choice through the select", () => {
    for (const whose of ["everyone", "tasks", "reviews", "client", 12] as const) expect(whoseFrom(whoseValue(whose))).toBe(whose);
  });

  it("tags a row with the reader's part: to do, to review, or ready for their review once sent (ET, 14 November 2026)", () => {
    expect(roleTag({ ...item(), status: "open" }, 7)).toEqual({ text: "To do", tone: "do" });
    expect(roleTag({ ...item(), status: "open" }, 4)).toEqual({ text: "To review", tone: "review" });
    expect(roleTag({ ...item(), status: "received" }, 4)).toEqual({ text: "Ready for review", tone: "ready" });
    expect(roleTag({ ...item(), status: "open" }, 5)).toBeNull();
    // A client item: the client does it; the team member on it follows it up.
    expect(roleTag({ ...item({ side: "client" }), status: "open" }, 7)).toEqual({ text: "To follow up", tone: "follow" });
    expect(roleTag({ ...item({ side: "client" }), status: "received" }, 4)).toEqual({ text: "Ready for review", tone: "ready" });
  });
});
