import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { lagosDay } from "@shared/agreement";
import { formatNaira } from "@shared/businessSupport";
import type { LedgerPaymentMode, LedgerPaymentStatus } from "@shared/ledger";
import React, { useState } from "react";
import { toast } from "sonner";
import { formatDate } from "./format";

/**
 * A fee's payments as the team and Finance see them (App flow 3.1): receipt number, day, how, amount and who recorded
 * it; a cancelled payment stays, struck through, with who cancelled it and why. For Finance and the Super Admin
 * (manage_payments; the server checks again): Record a payment, in part or in full; Cancel one recorded by mistake, with
 * a reason; Accept one that needs a look.
 */
const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SMALL_BUTTON = "rounded-none text-xs";

export type FeePayment = {
  id: number; status: LedgerPaymentStatus; methodLabel: string; amount: number; receipt: string | null; receivedOn: string | null;
  note: string | null; recordedBy: string | null; cancelledBy: string | null; cancelReason: string | null; canCancel: boolean;
  paystackReference: string | null; mode: LedgerPaymentMode | null;
};

const STATUS_WORDS: Record<LedgerPaymentStatus, string> = { started: "Started", paid: "Paid", failed: "Failed", needs_a_look: "Needs a look", refunded: "Refunded", cancelled: "Cancelled" };
const statusTone = (status: LedgerPaymentStatus) => (status === "needs_a_look" ? "font-semibold text-danger" : status === "paid" ? "text-health-clear-strong" : "text-ink-muted");

export function FeePaymentList({ payments, canRecord, onChanged }: { payments: readonly FeePayment[]; canRecord: boolean; onChanged: () => void }) {
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const cancel = trpc.engagement.finance.cancelPayment.useMutation({
    onSuccess: () => { setCancelling(null); setReason(""); onChanged(); toast.success("Payment cancelled. It stays on the record, marked cancelled, and the client is told."); },
    onError: error => toast.error(error.message),
  });
  const accept = trpc.engagement.finance.acceptPayment.useMutation({
    onSuccess: result => { onChanged(); toast.success(`Payment accepted: receipt ${result.receipt} is emailed to the client.`); },
    onError: error => toast.error(error.message),
  });
  if (!payments.length) return null;
  return (
    <ul aria-label="Payments" className="space-y-1.5 border-l-2 border-line pl-3 text-xs">
      {payments.map(payment => {
        const cancelled = payment.status === "cancelled";
        const day = payment.receivedOn ? formatDate(`${payment.receivedOn}T12:00:00Z`) : null;
        return (
          <li key={payment.id} className="space-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={cancelled ? "text-ink-muted line-through" : "text-ink"}>{[payment.receipt, day, payment.methodLabel, payment.mode === "test" ? "Paystack test" : null].filter(Boolean).join(" · ")}</span>
              <span className={`tabular-nums ${cancelled ? "text-ink-muted line-through" : "font-semibold text-ink"}`}>{formatNaira(payment.amount)}</span>
              <span className={statusTone(payment.status)}>{STATUS_WORDS[payment.status]}</span>
              {payment.recordedBy && <span className="text-ink-muted">recorded by {payment.recordedBy}</span>}
              {canRecord && payment.canCancel && cancelling !== payment.id && (
                <button type="button" className="font-semibold text-danger underline" onClick={() => { setCancelling(payment.id); setReason(""); }}>Cancel</button>
              )}
              {canRecord && payment.status === "needs_a_look" && (
                <button type="button" className="font-semibold text-brand underline" disabled={accept.isPending} onClick={() => accept.mutate({ paymentId: payment.id })}>Accept</button>
              )}
            </div>
            {payment.note && <p className="text-ink-muted">{payment.note}{payment.status === "needs_a_look" && payment.paystackReference ? ` Paystack reference ${payment.paystackReference}.` : ""}</p>}
            {cancelled && <p className="text-ink-muted">Cancelled{payment.cancelledBy ? ` by ${payment.cancelledBy}` : ""}: {payment.cancelReason}</p>}
            {cancelling === payment.id && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className={LABEL}>Why is it cancelled?</span>
                  <input className={FIELD} value={reason} onChange={event => setReason(event.target.value)} placeholder="Recorded against the wrong fee" />
                </label>
                <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-danger text-white`} disabled={cancel.isPending || reason.trim().length < 3} onClick={() => cancel.mutate({ paymentId: payment.id, reason })}>Cancel the payment</Button>
                <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setCancelling(null)}>Keep it</Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Money that came another way: the amount (what is left, or part of it), the day it arrived, how it came, and a note. */
export function RecordPaymentForm({ feeLineId, label, left, onDone }: { feeLineId: number; label: string; left: number; onDone: (recorded: boolean) => void }) {
  const today = lagosDay();
  const [amount, setAmount] = useState(String(left));
  const [receivedOn, setReceivedOn] = useState(today);
  const [method, setMethod] = useState<"bank_transfer" | "cash" | "other">("bank_transfer");
  const [note, setNote] = useState("");
  const record = trpc.engagement.finance.recordPayment.useMutation({
    onSuccess: result => {
      toast.success(`${result.left ? `Part payment recorded: ${formatNaira(result.left)} is left.` : "Payment recorded: the fee is paid."} Receipt ${result.receipt} is emailed to the client.${result.opened ? " Their room is now open." : ""}`);
      onDone(true);
    },
    onError: error => toast.error(error.message),
  });
  const value = Math.round(Number(amount) || 0);
  const ready = value > 0 && value <= left && Boolean(receivedOn) && receivedOn <= today && note.trim().length > 0;
  return (
    <form aria-label={`Record a payment for ${label}`} className="grid grid-cols-1 gap-2 border border-brand-line bg-brand-tint p-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (ready) record.mutate({ feeLineId, amount: value, receivedOn, method, note }); }}>
      <label>
        <span className={LABEL}>Amount received ({formatNaira(left)} left)</span>
        <input aria-label="Amount received" type="number" min={1} max={left} className={FIELD} value={amount} onChange={event => setAmount(event.target.value)} />
      </label>
      <label>
        <span className={LABEL}>Day it arrived</span>
        <input aria-label="Day it arrived" type="date" max={today} className={FIELD} value={receivedOn} onChange={event => setReceivedOn(event.target.value)} />
      </label>
      <label>
        <span className={LABEL}>How it came</span>
        <select aria-label="How it came" className={FIELD} value={method} onChange={event => setMethod(event.target.value as typeof method)}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        <span className={LABEL}>The bank's reference, or how it came</span>
        <input aria-label="Reference or note" className={FIELD} value={note} onChange={event => setNote(event.target.value)} placeholder="Transfer reference 123456" />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!ready || record.isPending}>Record {value > 0 ? formatNaira(value) : "the payment"}</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => onDone(false)}>Close</Button>
      </div>
      <p className="text-xs text-ink-muted sm:col-span-2">Only money that has reached the account. The client gets a receipt by email; a payment recorded by mistake can be cancelled, and stays on the record.</p>
    </form>
  );
}
