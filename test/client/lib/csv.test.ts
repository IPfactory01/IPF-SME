/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { csvCell, saveCsv, toCsv } from "@/lib/csv";

afterEach(() => vi.restoreAllMocks());

/**
 * The spreadsheet Finance downloads from Money in (F4, App flow 4.7). A visitor types their business name on the free
 * check, so it can reach a cell: nothing a spreadsheet would run as a formula is written as one.
 */
describe("a spreadsheet (CSV)", () => {
  it("quotes text, doubles its quotes and writes numbers as they are, so the amounts add up", () => {
    expect(csvCell("Crown Studio")).toBe('"Crown Studio"');
    expect(csvCell('Ada "Mama" Foods, Ikeja')).toBe('"Ada ""Mama"" Foods, Ikeja"');
    expect(csvCell(470000)).toBe("470000");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("keeps text that would run as a formula as text", () => {
    for (const typed of ["=HYPERLINK(\"https://example.com\")", "+2348000000001", "-5000 discount", "@SUM(A1)", "\tTabbed", "\rReturned"]) {
      expect(csvCell(typed), typed).toBe(`"'${typed.replace(/"/g, '""')}"`);
    }
    expect(csvCell("TS-RC-000004")).toBe('"TS-RC-000004"');
  });

  it("starts with a byte-order mark, so Excel reads ₦ and accented names, and ends each line as Windows does", () => {
    expect(toCsv([["Client", "Amount (NGN)"], ["Zoë Bakes ₦", 1500]])).toBe('﻿"Client","Amount (NGN)"\r\n"Zoë Bakes ₦",1500\r\n');
  });

  it("saves the text as a .csv file in the browser", () => {
    const blobs: Blob[] = [];
    Object.assign(URL, { createObjectURL: (blob: Blob) => { blobs.push(blob); return "blob:money-in"; }, revokeObjectURL: () => undefined });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("money-in-2026-11.csv");
      expect(this.href).toBe("blob:money-in");
    });
    saveCsv("money-in-2026-11.csv", toCsv([["Received"], ["2026-11-10"]]));
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs[0]!.type).toBe("text/csv;charset=utf-8");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
