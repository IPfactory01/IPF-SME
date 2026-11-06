import { describe, expect, it } from "vitest";
import { DATA_REQUEST_TEMPLATES, DUE_DAYS, parseDate, parsePastedDataRequest, templateById } from "@shared/dataRequestTemplates";

describe("Data Request templates", () => {
  it("offers a small business baseline written for an owner-run business, not a corporate", () => {
    const baseline = templateById("small_business_baseline")!;
    expect(baseline.items).toHaveLength(18);
    expect(new Set(baseline.items.map(item => item.section)).size).toBe(6);
    expect(new Set(baseline.items.map(item => item.ref)).size).toBe(18);
    const words = JSON.stringify(baseline);
    // What a small business has, in forms it can send.
    for (const term of ["Bank statements", "price list", "voice note", "POS"]) expect(words).toContain(term);
    // What it does not have: corporate artefacts stay out.
    expect(words).not.toMatch(/board|audited|subsidiar|legal entit|OEM|management committee|org(anisation|anization)al chart/i);
    for (const template of DATA_REQUEST_TEMPLATES) for (const item of template.items) expect(item.title.length, item.title).toBeLessThanOrEqual(200);
  });

  it("dates by priority, high first", () => {
    expect(DUE_DAYS).toEqual({ high: 4, medium: 6, low: 7 });
  });
});

describe("pasting a client's own Data Request from Excel", () => {
  const sheet = [
    "ID\tItem requested\tDetail\tWhat it informs\tFormat\tPriority\tDate required\tStatus",
    "1  Sales\t\t\t\t\t\t\t",
    "1.1\tSales by month\tLast 12 months.\tHow the business is doing\tExcel\tHigh\t10 Nov 2026\tRequested",
    "1.2\tTop customers\t\tWho it depends on\tList\tmedium\t\tRequested",
    "",
    "2  Costs",
    "2.1\tMonthly costs\tRent, staff, diesel.\tBreak-even\tList\tLow\t13/11/2026\tRequested",
  ].join("\n");

  it("reads the header, keeps the sections, priorities and dates, and skips the status", () => {
    expect(parsePastedDataRequest(sheet)).toEqual([
      { section: "1 Sales", ref: "1.1", title: "Sales by month", detail: "Last 12 months.", informs: "How the business is doing", format: "Excel", priority: "high", dueOn: "2026-11-10" },
      { section: "1 Sales", ref: "1.2", title: "Top customers", detail: null, informs: "Who it depends on", format: "List", priority: "medium", dueOn: null },
      { section: "2 Costs", ref: "2.1", title: "Monthly costs", detail: "Rent, staff, diesel.", informs: "Break-even", format: "List", priority: "low", dueOn: "2026-11-13" },
    ]);
  });

  it("takes the usual column order when there is no header, and ignores rows without an item", () => {
    expect(parsePastedDataRequest("A1\tCAC certificate\tPhoto is fine\t\t\tHigh\t\n\t\t\n")).toEqual([
      { section: null, ref: "A1", title: "CAC certificate", detail: "Photo is fine", informs: null, format: null, priority: "high", dueOn: null },
    ]);
  });

  it("reads Nigerian day-first dates and the sheet's own format", () => {
    expect(parseDate("12 Nov 2026")).toBe("2026-11-12");
    expect(parseDate("3 November 2026")).toBe("2026-11-03");
    expect(parseDate("05/11/2026")).toBe("2026-11-05");
    expect(parseDate("2026-11-05")).toBe("2026-11-05");
    expect(parseDate("next week")).toBeNull();
  });
});
