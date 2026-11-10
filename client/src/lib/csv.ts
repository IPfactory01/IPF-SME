/**
 * A spreadsheet (CSV) from rows, and saving it as a download: Finance's Money in list, to match against Paystack's own
 * export (App flow 4.7). Text a visitor typed (a business name on the free check) can reach a cell, so a cell that a
 * spreadsheet would run as a formula (it starts with =, +, -, @, a tab or a return) is written with a leading apostrophe,
 * and every text cell is quoted.
 */
export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: numbers as they are, text quoted with its quotes doubled, a formula kept as text. */
export function csvCell(value: CsvCell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

/** The file's text: a byte-order mark so Excel reads ₦ and accented names, then one line per row. */
export const toCsv = (rows: readonly (readonly CsvCell[])[]) => `﻿${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

/** Saves the text as a .csv file in the browser. */
export function saveCsv(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
