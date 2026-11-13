import { describe, expect, it } from "vitest";
import { matchesSearch, matchesWhose, whoseFrom, whoseValue } from "@/lib/planFilter";

const item = (over: Record<string, unknown> = {}) => ({ side: "ipf", title: "Prepare the first month's content calendar", ref: "2.01", detail: null, owners: [{ userId: 7 }, { userId: 9 }], reviewer: { userId: 4 }, ...over });

describe("whose items and the search (ET, 13 November 2026)", () => {
  it("shows everyone's, the client's side, or one person's: what they own, as lead or with others, or review", () => {
    expect(matchesWhose(item(), "everyone", null)).toBe(true);
    expect(matchesWhose(item(), "mine", 9)).toBe(true);
    expect(matchesWhose(item(), "mine", 4)).toBe(true);
    expect(matchesWhose(item(), "mine", 5)).toBe(false);
    expect(matchesWhose(item(), "mine", null)).toBe(false);
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
    for (const whose of ["everyone", "mine", "client", 12] as const) expect(whoseFrom(whoseValue(whose))).toBe(whose);
  });
});
