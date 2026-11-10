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
 * a reason; Accept one that needs a look; Record a refund against a payment, and cancel a refund recorded by mistake.
 * For a Partner or the Super Admin (write_off_fees): Write off what is left of a fee, and reverse a write-off.
 */
const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SMALL_BUTTON = "rounded-none text-xs";

export type FeeRefund = {
  id: number; amount: number; refundedOn: string; reason: string; reference: string | null; recordedBy: string | null;
  cancelledAt: string | Date | null; cancelReason: string | null; cancelledBy: string | null;
};
export type FeePayment = {
  id: number; status: LedgerPaymentStatus; methodLabel: string; amount: number; receipt: string | null; receivedOn: string | null;
  note: string | null; recordedBy: string | null; cancelledBy: string | null; cancelReason: string | null; canCancel: boolean;
  paystackReference: string | null; mode: LedgerPaymentMode | null; refundable: number; refunds: FeeRefund[];
};
export type FeeWriteOff = { amount: number; at: string | Date; by: string | null; note: string | null } | null;

const dayOf = (day: string) => formatDate(`${day}T12:00:00Z`);

/** A short reason, typed in place, then the act: for cancelling a payment or a refund, or reversing a write-off. */
function ReasonForm({ label, placeholder, confirm, danger, pending, onConfirm, onClose }: { label: string; placeholder: string; confirm: string; danger?: boolean; pending: boolean; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className={LABEL}>{label}</span>
        <input className={FIELD} value={reason} onChange={event => setReason(event.target.value)} placeholder={placeholder} />
      </label>
      <Button type="button" size="sm" className={`${SMALL_BUTTON} ${danger ? "bg-danger" : "bg-brand"} text-white`} disabled={pending || reason.trim().length < 3} onClick={() => onConfirm(reason)}>{confirm}</Button>
      <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onClose}>Keep it</Button>
    </div>
  );
}

/** A refund against a payment, once the money has gone back: the amount, the day, the reason and the reference. */
function RefundForm({ payment, onDone }: { payment: FeePayment; onDone: (recorded: boolean) => void }) {
  const today = lagosDay();
  const [amount, setAmount] = useState(String(payment.refundable));
  const [refundedOn, setRefundedOn] = useState(today);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const record = trpc.engagement.finance.recordRefund.useMutation({
    onSuccess: result => { toast.success(`Refund recorded. The client is told.${result.left ? ` ${formatNaira(result.left)} is owed on the fee again.` : ""}`); onDone(true); },
    onError: error => toast.error(error.message),
  });
  const value = Math.round(Number(amount) || 0);
  const ready = value > 0 && value <= payment.refundable && Boolean(refundedOn) && refundedOn <= today && reason.trim().length >= 3;
  return (
    <form aria-label={`Record a refund of ${payment.receipt ?? "this payment"}`} className="grid grid-cols-1 gap-2 border border-line bg-paper-raised p-2 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); if (ready) record.mutate({ paymentId: payment.id, amount: value, refundedOn, reason, reference: reference.trim() || null }); }}>
      <label>
        <span className={LABEL}>Amount refunded (up to {formatNaira(payment.refundable)})</span>
        <input aria-label="Amount refunded" type="number" min={1} max={payment.refundable} className={FIELD} value={amount} onChange={event => setAmount(event.target.value)} />
      </label>
      <label>
        <span className={LABEL}>Day of the refund</span>
        <input aria-label="Day of the refund" type="date" max={today} className={FIELD} value={refundedOn} onChange={event => setRefundedOn(event.target.value)} />
      </label>
      <label>
        <span className={LABEL}>Why it was refunded</span>
        <input aria-label="Why it was refunded" className={FIELD} value={reason} onChange={event => setReason(event.target.value)} placeholder="Paid twice" />
      </label>
      <label>
        <span className={LABEL}>Paystack's or the bank's reference (if any)</span>
        <input aria-label="Refund reference" className={FIELD} value={reference} onChange={event => setReference(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={!ready || record.isPending}>Record the refund of {value > 0 ? formatNaira(value) : "it"}</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => onDone(false)}>Close</Button>
      </div>
      <p className="text-xs text-ink-muted sm:col-span-2">Refund the money in Paystack or from the bank first; this records it. The amount is owed on the fee again unless a Partner writes it off.</p>
    </form>
  );
}

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
  const [refunding, setRefunding] = useState<number | null>(null);
  const [cancellingRefund, setCancellingRefund] = useState<number | null>(null);
  const cancelRefund = trpc.engagement.finance.cancelRefund.useMutation({
    onSuccess: () => { setCancellingRefund(null); onChanged(); toast.success("Refund cancelled. It stays on the record, marked cancelled."); },
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
              {canRecord && payment.refundable > 0 && refunding !== payment.id && (
                <button type="button" className="font-semibold text-brand underline" onClick={() => setRefunding(payment.id)}>Record a refund</button>
              )}
            </div>
            {payment.note && <p className="text-ink-muted">{payment.note}{payment.status === "needs_a_look" && payment.paystackReference ? ` Paystack reference ${payment.paystackReference}.` : ""}</p>}
            {cancelled && <p className="text-ink-muted">Cancelled{payment.cancelledBy ? ` by ${payment.cancelledBy}` : ""}: {payment.cancelReason}</p>}
            {payment.refunds.length > 0 && (
              <ul aria-label="Refunds" className="space-y-1 pl-3">
                {payment.refunds.map(refund => {
                  const off = refund.cancelledAt !== null;
                  return (
                    <li key={refund.id} className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className={off ? "text-ink-muted line-through" : "text-ink"}>Refund · {dayOf(refund.refundedOn)}{refund.reference ? ` · ${refund.reference}` : ""}</span>
                        <span className={`tabular-nums ${off ? "text-ink-muted line-through" : "font-semibold text-ink"}`}>{formatNaira(refund.amount)}</span>
                        {refund.recordedBy && <span className="text-ink-muted">recorded by {refund.recordedBy}</span>}
                        {canRecord && !off && cancellingRefund !== refund.id && <button type="button" className="font-semibold text-danger underline" onClick={() => setCancellingRefund(refund.id)}>Cancel</button>}
                      </div>
                      {refund.reason && <p className="text-ink-muted">{refund.reason}</p>}
                      {off && <p className="text-ink-muted">Cancelled{refund.cancelledBy ? ` by ${refund.cancelledBy}` : ""}: {refund.cancelReason}</p>}
                      {cancellingRefund === refund.id && <ReasonForm label="Why is the refund cancelled?" placeholder="Recorded twice" confirm="Cancel the refund" danger pending={cancelRefund.isPending} onConfirm={reason => cancelRefund.mutate({ refundId: refund.id, reason })} onClose={() => setCancellingRefund(null)} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {refunding === payment.id && <RefundForm payment={payment} onDone={recorded => { setRefunding(null); if (recorded) onChanged(); }} />}
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

/**
 * A fee's write-off: closing what is left without the money, a Partner's or the Super Admin's decision (write_off_fees),
 * with a note; and its reversal, with a reason. The client then sees "Nothing more to pay", never the team's word.
 */
export function WriteOffControls({ fee, canWriteOff, onChanged, startOpen = false }: { fee: { id: number; label: string; left: number; writtenOff: FeeWriteOff }; canWriteOff: boolean; onChanged: () => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [note, setNote] = useState("");
  const writeOff = trpc.engagement.finance.writeOff.useMutation({
    onSuccess: result => { setOpen(false); setNote(""); onChanged(); toast.success(`${formatNaira(result.writtenOff)} written off. Tell the client: they see "Nothing more to pay".`); },
    onError: error => toast.error(error.message),
  });
  const reverse = trpc.engagement.finance.reverseWriteOff.useMutation({
    onSuccess: result => { setOpen(false); onChanged(); toast.success(`Write-off reversed: ${formatNaira(result.left)} is owed again.`); },
    onError: error => toast.error(error.message),
  });
  if (fee.writtenOff) {
    return (
      <div className="space-y-1 text-xs">
        <p className="text-ink">Written off: {formatNaira(fee.writtenOff.amount)}, {formatDate(fee.writtenOff.at)}{fee.writtenOff.by ? `, by ${fee.writtenOff.by}` : ""}.{fee.writtenOff.note ? ` ${fee.writtenOff.note}` : ""}</p>
        {canWriteOff && !open && <button type="button" className="font-semibold text-brand underline" onClick={() => setOpen(true)}>Reverse the write-off</button>}
        {canWriteOff && open && <ReasonForm label="Why is the write-off reversed?" placeholder="The client agreed to pay" confirm="Reverse the write-off" pending={reverse.isPending} onConfirm={reason => reverse.mutate({ feeLineId: fee.id, reason })} onClose={() => setOpen(false)} />}
      </div>
    );
  }
  if (!canWriteOff || fee.left === 0) return null;
  return open ? (
    <form aria-label={`Write off ${fee.label}`} className="space-y-2 border border-line bg-paper-raised p-2 text-xs" onSubmit={event => { event.preventDefault(); if (note.trim().length >= 3) writeOff.mutate({ feeLineId: fee.id, note }); }}>
      <label className="block">
        <span className={LABEL}>Why is it written off?</span>
        <input aria-label="Why it is written off" className={FIELD} value={note} onChange={event => setNote(event.target.value)} placeholder="Agreed with the client on the call" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className={`${SMALL_BUTTON} bg-danger text-white`} disabled={writeOff.isPending || note.trim().length < 3}>Write off {formatNaira(fee.left)}</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setOpen(false)}>Close</Button>
      </div>
      <p className="text-ink-muted">Nothing more is owed on it, it is never late and it never pauses the work. The client is not emailed: tell them yourself. It can be reversed.</p>
    </form>
  ) : <button type="button" className="text-xs font-semibold text-danger underline" onClick={() => setOpen(true)}>Write off {formatNaira(fee.left)}</button>;
}
