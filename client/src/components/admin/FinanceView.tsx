import { Failed, Loading, StaleLine } from "@/components/states";
import { trpc } from "@/lib/trpc";
import { formatNaira } from "@shared/businessSupport";
import React, { useEffect, useState } from "react";
import { FeePaymentList, RecordPaymentForm, WriteOffControls } from "./FeePayments";
import { formatDate } from "./format";
import MoneyIn, { type MoneyInRow } from "./MoneyIn";

const TH = "px-3 py-2 text-left text-xs font-semibold text-ink-muted";
const TD = "px-3 py-2 align-top text-sm";

/**
 * Finance: money across every client, from one source, the payments ledger (F4). Paid is real money in, less refunds;
 * test payments are kept apart. Owed is what is left on the fees, after write-offs, and the payment requests not yet
 * paid; late is what is left once a fee's date has passed. Payments that need a look come first. Two views: the fees
 * and payment requests, and Money in, where each payment opens to its fee and Paystack's settlements are reconciled.
 * Finance and the Super Admin record money that came another way on the fee (Record a payment), cancel one recorded by
 * mistake, accept a payment that needs a look, and record a refund against a payment; a Partner or the Super Admin
 * writes off what is left of a fee (App flow 3.1 and 4.7). A payment request is still confirmed in the client's record
 * under Pipeline.
 */
export default function FinanceView() {
  const utils = trpc.useUtils();
  const finance = trpc.engagement.finance.list.useQuery(undefined);
  const [view, setView] = useState<"fees" | "money">("fees");
  const [show, setShow] = useState<"owed" | "all">("owed");
  const [recording, setRecording] = useState<number | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [writingOff, setWritingOff] = useState<Set<number>>(new Set());
  // The fee or payment request a row of Money in opened: brought into view and marked until another is opened.
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView?.({ block: "center" });
  }, [focus]);
  if (finance.error && finance.data === undefined) return <div className="p-6"><Failed error={finance.error} onRetry={() => void finance.refetch()} retrying={finance.isFetching} /></div>;
  if (!finance.data) return <div className="p-6"><Loading label="Loading Finance" /></div>;
  const { totals, requests, fees, needsALook, moneyIn, can } = finance.data;
  const refresh = () => { void utils.engagement.finance.list.invalidate(); void utils.engagement.staff.fees.invalidate(); };
  const feeRows = show === "owed" ? fees.filter(row => !row.paid) : fees;
  const requestRows = show === "owed" ? requests.filter(row => !row.paid) : requests;
  const flip = (set: Set<number>, id: number) => { const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); return next; };
  const toggle = (id: number) => setOpen(previous => flip(previous, id));
  const openFrom = (row: MoneyInRow) => {
    setView("fees");
    setShow("all");
    if (row.feeLineId !== null) {
      const feeLineId = row.feeLineId;
      setOpen(previous => new Set(previous).add(feeLineId));
      setFocus(`fee-${feeLineId}`);
    } else setFocus(`request-${row.paymentRequestId}`);
  };
  const owedNote = [totals.owedOnRequests ? `${formatNaira(totals.owedOnRequests)} of it on payment requests` : null, totals.writtenOff ? `${formatNaira(totals.writtenOff)} written off` : null].filter(Boolean).join(" · ");
  const realCount = moneyIn.filter(row => !row.test).length;
  const tab = (value: "fees" | "money", label: string, count?: number) => (
    <button
      type="button"
      role="tab"
      id={`finance-tab-${value}`}
      aria-selected={view === value}
      aria-controls={`finance-panel-${value}`}
      onClick={() => setView(value)}
      className={`shrink-0 border px-3 py-1.5 text-xs font-medium ${view === value ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand-line-strong"}`}
    >
      {label}{count !== undefined && <> <span className={view === value ? "text-white/80" : "text-ink-muted"}>{count}</span></>}
    </button>
  );
  return (
    <div className="space-y-5 p-6">
      <StaleLine read={finance} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-label="Totals">
        {[
          { label: "Paid", value: totals.paid, tone: "text-health-clear", note: totals.refunded ? `${formatNaira(totals.paid + totals.refunded)} received, ${formatNaira(totals.refunded)} refunded` : "" },
          { label: "Owed", value: totals.owed, tone: "text-ink", note: owedNote },
          { label: "Late", value: totals.late, tone: totals.late ? "text-danger" : "text-ink", note: "" },
        ].map(item => (
          <div key={item.label} className="border border-line bg-white p-4">
            <p className="text-xs font-medium text-ink-muted">{item.label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${item.tone}`}>{formatNaira(item.value)}</p>
            {item.note && <p className="mt-1 text-xs text-ink-muted">{item.note}</p>}
          </div>
        ))}
      </div>
      {totals.test.count > 0 && (
        <p className="text-xs text-ink-muted">Test payments are kept apart: {totals.test.count === 1 ? "1 payment" : `${totals.test.count} payments`}, {formatNaira(totals.test.paid)}. No real money moved, so they are not in Paid.</p>
      )}
      {needsALook.length > 0 && (
        <section aria-label="Payments that need a look" className="space-y-2 border border-danger bg-white p-4">
          <h2 className="text-sm font-semibold text-ink">Payments that need a look</h2>
          <p className="text-xs text-ink-muted">Paystack took this money, but it did not fit the fee, so it does not count yet. Check each in Paystack, then accept it, or refund it in Paystack.</p>
          <ul className="space-y-3">
            {needsALook.map(payment => (
              <li key={payment.id} className="space-y-1">
                <p className="text-sm text-ink">{payment.client} · {payment.engagement} · {payment.label} <span className="text-ink-muted">({formatNaira(payment.left)} left on it)</span></p>
                <FeePaymentList payments={[payment]} canRecord={can.record} onChanged={refresh} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div role="tablist" aria-label="Finance" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {tab("fees", "Fees and requests")}
        {tab("money", "Money in", realCount)}
      </div>
      {view === "money" ? (
        <div role="tabpanel" id="finance-panel-money" aria-labelledby="finance-tab-money">
          <MoneyIn entries={moneyIn} onOpen={openFrom} />
        </div>
      ) : (
        <div role="tabpanel" id="finance-panel-fees" aria-labelledby="finance-tab-fees" className="space-y-5">
          <div role="group" aria-label="Show" className="inline-flex border border-line bg-white p-0.5 text-sm">
            {(["owed", "all"] as const).map(value => (
              <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)} className={`px-3 py-1 ${show === value ? "bg-brand text-white" : "text-ink-600"}`}>{value === "owed" ? "Not yet paid" : "Everything"}</button>
            ))}
          </div>
          <section aria-label="Engagement fees" className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Engagement fees</h2>
            <div className="overflow-x-auto border border-line bg-white">
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className={TH}>Client</th><th className={TH}>Engagement</th><th className={TH}>Fee</th><th className={TH}>Due</th><th className={`${TH} text-right`}>Amount</th><th className={TH}>Status</th></tr></thead>
                <tbody>
                  {feeRows.map(row => {
                    const counted = row.payments.filter(payment => payment.status !== "needs_a_look");
                    const status = row.writtenOff && row.left === 0 ? `Written off ${formatNaira(row.writtenOff.amount)}` : row.paid ? `Paid ${formatDate(row.paidAt)}` : row.paidAmount > 0 ? `${formatNaira(row.paidAmount)} paid, ${formatNaira(row.left)} left` : row.late ? "Late" : "Owed";
                    const showsWriteOff = writingOff.has(row.id) || (row.writtenOff !== null && open.has(row.id));
                    const focused = focus === `fee-${row.id}`;
                    return (
                      <React.Fragment key={row.id}>
                        <tr id={`fee-${row.id}`} className={`border-b border-line-soft ${focused ? "bg-brand-tint" : ""}`}>
                          <td className={TD}>{row.client}</td><td className={TD}>{row.engagement}</td><td className={TD}>{row.label}</td>
                          <td className={TD}>{row.dueOn ? formatDate(`${row.dueOn}T12:00:00Z`) : "No date set"}</td>
                          <td className={`${TD} text-right tabular-nums`}>{formatNaira(row.amount)}</td>
                          <td className={TD}>
                            <span className={row.late ? "font-semibold text-danger" : row.paid && !row.writtenOff ? "text-health-clear" : "text-ink-muted"}>{row.late && row.paidAmount > 0 ? `Late: ${status}` : status}</span>
                            <span className="mt-1 flex flex-wrap gap-x-2 text-xs">
                              {counted.length > 0 && <button type="button" className="font-semibold text-brand underline" aria-expanded={open.has(row.id)} onClick={() => toggle(row.id)}>{open.has(row.id) ? "Hide payments" : `Payments (${counted.length})`}</button>}
                              {can.record && row.left > 0 && recording !== row.id && <button type="button" className="font-semibold text-brand underline" onClick={() => setRecording(row.id)}>Record a payment</button>}
                              {can.writeOff && (row.left > 0 || row.writtenOff) && !showsWriteOff && <button type="button" className="font-semibold text-danger underline" onClick={() => setWritingOff(previous => flip(previous, row.id))}>{row.writtenOff ? "The write-off" : "Write off"}</button>}
                            </span>
                          </td>
                        </tr>
                        {(open.has(row.id) || recording === row.id || showsWriteOff) && (
                          <tr className={`border-b border-line-soft ${focused ? "bg-brand-tint" : "bg-paper-sunken/40"}`}>
                            <td colSpan={6} className={TD}>
                              {/* On a phone the table scrolls sideways: the payments and the form keep to the width in view. */}
                              <div className="sticky left-3 max-w-[calc(100vw-5rem)] space-y-2 sm:static sm:max-w-none">
                                {open.has(row.id) && <FeePaymentList payments={counted} canRecord={can.record} onChanged={refresh} />}
                                {recording === row.id && <RecordPaymentForm feeLineId={row.id} label={row.label} left={row.left} onDone={recorded => { setRecording(null); if (recorded) refresh(); }} />}
                                {showsWriteOff && <WriteOffControls fee={row} canWriteOff={can.writeOff} startOpen={writingOff.has(row.id)} onChanged={() => { setWritingOff(previous => { const next = new Set(previous); next.delete(row.id); return next; }); refresh(); }} />}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {feeRows.length === 0 && <tr><td colSpan={6} className={`${TD} text-ink-muted`}>Nothing here.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-label="Payment requests" className="space-y-2">
            <h2 className="text-sm font-semibold text-ink">Payment requests (Business Health Check route)</h2>
            <div className="overflow-x-auto border border-line bg-white">
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className={TH}>Client</th><th className={TH}>For</th><th className={TH}>Requested</th><th className={`${TH} text-right`}>Amount</th><th className={TH}>Status</th></tr></thead>
                <tbody>
                  {requestRows.map(row => (
                    <tr key={row.id} id={`request-${row.id}`} className={`border-b border-line-soft ${focus === `request-${row.id}` ? "bg-brand-tint" : ""}`}>
                      <td className={TD}>{row.client}</td><td className={TD}>{row.title}</td><td className={TD}>{formatDate(row.requestedAt)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{formatNaira(row.amount)}</td>
                      <td className={`${TD} ${row.paid ? "text-health-clear" : "text-ink-muted"}`}>{row.paid ? `Paid ${formatDate(row.confirmedAt)}${row.receipt ? ` · ${row.receipt}` : ""}` : row.status === "proof_received" ? "Proof received" : "Requested"}</td>
                    </tr>
                  ))}
                  {requestRows.length === 0 && <tr><td colSpan={5} className={`${TD} text-ink-muted`}>Nothing here.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-xs text-ink-muted">{can.record ? "Money that came another way: Record a payment on the fee. " : "Money that came another way is recorded by Finance. "}A payment request is confirmed in the client's record under Pipeline.</p>
        </div>
      )}
    </div>
  );
}
