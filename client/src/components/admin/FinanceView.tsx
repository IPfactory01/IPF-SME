import { trpc } from "@/lib/trpc";
import { formatNaira } from "@shared/businessSupport";
import React, { useState } from "react";
import { formatDate } from "./format";

const TH = "px-3 py-2 text-left text-xs font-semibold text-ink-muted";
const TD = "px-3 py-2 align-top text-sm";

/**
 * Finance: money across every client. What has been paid, what is owed under accepted agreements, what is late, and
 * what is only proposed (an agreement not yet accepted). Payments are recorded where they belong: a payment request in
 * the check's record (Pipeline), a fee line in the engagement's agreement (Engagements).
 */
export default function FinanceView() {
  const finance = trpc.engagement.finance.list.useQuery(undefined, { retry: false });
  const [show, setShow] = useState<"owed" | "all">("owed");
  if (finance.error) return <p role="alert" className="p-6 text-sm text-danger">{finance.error.message}</p>;
  if (!finance.data) return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  const { totals, requests, fees } = finance.data;
  const feeRows = show === "owed" ? fees.filter(row => !row.paid) : fees;
  const requestRows = show === "owed" ? requests.filter(row => !row.paid) : requests;
  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Totals">
        {[
          { label: "Paid", value: totals.paid, tone: "text-health-clear" },
          { label: "Owed (agreed)", value: totals.owed, tone: "text-ink" },
          { label: "Late", value: totals.late, tone: totals.late ? "text-danger" : "text-ink" },
          { label: "Proposed, not yet agreed", value: totals.proposed, tone: "text-ink-muted" },
        ].map(item => (
          <div key={item.label} className="border border-line bg-white p-4">
            <p className="text-xs font-medium text-ink-muted">{item.label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${item.tone}`}>{formatNaira(item.value)}</p>
          </div>
        ))}
      </div>
      <div role="group" aria-label="Show" className="inline-flex border border-line bg-white p-0.5 text-sm">
        {(["owed", "all"] as const).map(value => (
          <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)} className={`px-3 py-1 ${show === value ? "bg-brand text-white" : "text-ink-600"}`}>{value === "owed" ? "Not yet paid" : "Everything"}</button>
        ))}
      </div>
      <section aria-label="Proposal fees" className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Proposal fees</h2>
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className={TH}>Client</th><th className={TH}>Engagement</th><th className={TH}>Fee</th><th className={TH}>Due</th><th className={`${TH} text-right`}>Amount</th><th className={TH}>Status</th></tr></thead>
            <tbody>
              {feeRows.map(row => (
                <tr key={row.id} className="border-b border-line-soft">
                  <td className={TD}>{row.client}</td><td className={TD}>{row.engagement}</td><td className={TD}>{row.label}</td>
                  <td className={TD}>{row.dueOn ? formatDate(`${row.dueOn}T12:00:00Z`) : "As agreed"}</td>
                  <td className={`${TD} text-right tabular-nums`}>{formatNaira(row.amount)}</td>
                  <td className={`${TD} ${row.late ? "font-semibold text-danger" : row.paid ? "text-health-clear" : "text-ink-muted"}`}>{row.paid ? `Paid ${formatDate(row.paidAt)}` : row.late ? "Late" : row.agreed ? "Owed" : "Proposed"}</td>
                </tr>
              ))}
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
                <tr key={row.id} className="border-b border-line-soft">
                  <td className={TD}>{row.client}</td><td className={TD}>{row.title}</td><td className={TD}>{formatDate(row.requestedAt)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{formatNaira(row.amount)}</td>
                  <td className={`${TD} ${row.paid ? "text-health-clear" : "text-ink-muted"}`}>{row.paid ? `Paid ${formatDate(row.confirmedAt)}` : row.status === "proof_received" ? "Proof received" : "Requested"}</td>
                </tr>
              ))}
              {requestRows.length === 0 && <tr><td colSpan={5} className={`${TD} text-ink-muted`}>Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-ink-muted">To record a payment: a payment request in the client's record under Pipeline; a proposal fee by ticking Paid in the engagement's Proposat and fees.</p>
    </div>
  );
}
