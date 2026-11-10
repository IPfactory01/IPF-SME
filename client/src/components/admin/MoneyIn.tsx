import { Button } from "@/components/ui/button";
import { saveCsv, toCsv } from "@/lib/csv";
import { formatNaira } from "@shared/businessSupport";
import { LEDGER_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type LedgerPaymentMethod } from "@shared/ledger";
import type { inferRouterOutputs } from "@trpc/server";
import React, { useState } from "react";
import type { AppRouter } from "../../../../server/routers";
import { formatDate } from "./format";

/**
 * Money in (F4, App flow 4.7): every payment that counts, from the payments ledger, newest first, with the refunds
 * against it, how it came, its receipt number and Paystack reference. Test payments are kept apart from real money.
 * Finance narrows it by month, by how the money came and by a reference, receipt number or client, to match Paystack's
 * settlements; each row opens to its fee or payment request, and the list downloads as a spreadsheet (CSV).
 */
export type MoneyInRow = inferRouterOutputs<AppRouter>["engagement"]["finance"]["list"]["moneyIn"][number];

const TH = "px-3 py-2 text-left text-xs font-semibold text-ink-muted";
const TD = "px-3 py-2 align-top text-sm";
const FIELD = "h-9 border border-line bg-white px-2 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const dayOf = (day: string | null) => (day ? formatDate(`${day}T12:00:00Z`) : "-");
const monthOf = (day: string | null) => day?.slice(0, 7) ?? "";
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** What a payment is for, as the row and the spreadsheet name it. */
export const moneyInFor = (row: Pick<MoneyInRow, "feeLineId" | "engagement" | "label">) => (row.feeLineId !== null ? `${row.engagement} · ${row.label}` : `${row.label} (payment request)`);

const statusOf = (row: Pick<MoneyInRow, "amount" | "refunded" | "beforeLedger">) =>
  row.refunded >= row.amount ? "Refunded" : row.refunded > 0 ? "Part refunded" : row.beforeLedger ? "Paid before the ledger" : "Paid";

/** The rows as a spreadsheet: one line per payment, amounts in whole naira so they add up. */
export function moneyInCsv(rows: readonly MoneyInRow[]) {
  return toCsv([
    ["Received", "Receipt", "Client", "Engagement", "For", "How", "Mode", "Paystack reference", "Note", "Recorded by", "Amount (NGN)", "Refunded (NGN)", "Net (NGN)", "Status"],
    ...rows.map(row => [
      row.receivedOn, row.receipt, row.client, row.engagement, row.feeLineId !== null ? row.label : `${row.label} (payment request)`, row.methodLabel,
      row.method === "paystack" ? (row.test ? "Test" : "Live") : "", row.paystackReference, row.note, row.recordedBy,
      row.amount, row.refunded, row.amount - row.refunded, statusOf(row),
    ]),
  ]);
}

export default function MoneyIn({ entries, onOpen }: { entries: readonly MoneyInRow[]; onOpen: (row: MoneyInRow) => void }) {
  const [kind, setKind] = useState<"real" | "test">("real");
  const [month, setMonth] = useState("");
  const [how, setHow] = useState<LedgerPaymentMethod | "">("");
  const [find, setFind] = useState("");
  const testCount = entries.filter(row => row.test).length;
  const shown = testCount ? kind : "real";
  const months = Array.from(new Set(entries.map(row => monthOf(row.receivedOn)).filter(Boolean))).sort().reverse();
  const needle = find.trim().toLowerCase();
  const rows = entries.filter(row =>
    row.test === (shown === "test") && (!month || monthOf(row.receivedOn) === month) && (!how || row.method === how)
    && (!needle || [row.paystackReference, row.receipt, row.note, row.client, row.label, row.engagement].some(value => value?.toLowerCase().includes(needle))));
  const received = sum(rows.map(row => row.amount));
  const refunded = sum(rows.map(row => row.refunded));
  const summary = shown === "test"
    ? `${plural(rows.length, "test payment")}: ${formatNaira(received - refunded)}. No real money moved.`
    : refunded ? `${plural(rows.length, "payment")}: ${formatNaira(received)} received, ${formatNaira(refunded)} refunded, ${formatNaira(received - refunded)} in.` : `${plural(rows.length, "payment")}: ${formatNaira(received)} in.`;
  const download = () => saveCsv(`money-in-${shown === "test" ? "test-" : ""}${month || "all"}.csv`, moneyInCsv(rows));
  return (
    <section aria-label="Money in" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {testCount > 0 && (
          <div role="group" aria-label="Real or test" className="inline-flex border border-line bg-white p-0.5 text-sm">
            {(["real", "test"] as const).map(value => (
              <button key={value} type="button" aria-pressed={shown === value} onClick={() => setKind(value)} className={`px-3 py-1 ${shown === value ? "bg-brand text-white" : "text-ink-600"}`}>{value === "real" ? "Real money" : `Test payments (${testCount})`}</button>
            ))}
          </div>
        )}
        <label>
          <span className={LABEL}>Month</span>
          <select className={FIELD} value={month} onChange={event => setMonth(event.target.value)}>
            <option value="">Every month</option>
            {months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
          </select>
        </label>
        <label>
          <span className={LABEL}>How it came</span>
          <select className={FIELD} value={how} onChange={event => setHow(event.target.value as LedgerPaymentMethod | "")}>
            <option value="">Every way</option>
            {LEDGER_PAYMENT_METHODS.map(value => <option key={value} value={value}>{PAYMENT_METHOD_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="min-w-0 flex-1 sm:max-w-xs">
          <span className={LABEL}>Find</span>
          <input className={`${FIELD} w-full`} value={find} onChange={event => setFind(event.target.value)} placeholder="Reference, receipt number or client" />
        </label>
        <Button type="button" size="sm" variant="outline" className="h-9 rounded-none" disabled={!rows.length} onClick={download}>Download CSV</Button>
      </div>
      <p className="text-sm text-ink" role="status">{summary}</p>
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-line"><th className={TH}>Received</th><th className={TH}>Receipt</th><th className={TH}>Client</th><th className={TH}>For</th><th className={TH}>How</th><th className={TH}>Reference</th><th className={`${TH} text-right`}>Amount</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key} className="border-b border-line-soft">
                <td className={`${TD} whitespace-nowrap`}>{dayOf(row.receivedOn)}</td>
                <td className={`${TD} whitespace-nowrap`}>{row.receipt ?? <span className="text-ink-muted">{row.beforeLedger ? "Before the ledger" : "None"}</span>}</td>
                <td className={TD}>{row.client}</td>
                <td className={TD}><button type="button" className="text-left font-semibold text-brand underline" title={row.feeLineId !== null ? "Open the fee" : "Open the payment request"} onClick={() => onOpen(row)}>{moneyInFor(row)}</button></td>
                <td className={`${TD} whitespace-nowrap`}>{row.methodLabel}{row.test ? " test" : ""}</td>
                <td className={`${TD} break-all`}>
                  {row.paystackReference ?? row.note ?? "-"}
                  {row.paystackReference && row.note && <span className="block text-xs text-ink-muted">{row.note}</span>}
                  {row.recordedBy && <span className="block text-xs text-ink-muted">Recorded by {row.recordedBy}</span>}
                </td>
                <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
                  {formatNaira(row.amount)}
                  {row.refunded > 0 && <span className="block text-xs text-danger">{row.refunded >= row.amount ? "Refunded" : `${formatNaira(row.refunded)} refunded`}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className={`${TD} text-ink-muted`}>No payments here.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
