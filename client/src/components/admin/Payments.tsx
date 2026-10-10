import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savePdf } from "@/lib/savePdf";
import { trpc } from "@/lib/trpc";
import { CURRENT_STATE, formatNaira } from "@shared/businessSupport";
import { PAYMENT_DISPLAY_LABELS, PAYMENT_ITEM_DETAILS, PAYMENT_ITEMS, PAYMENT_WINDOW_HOURS, type PaymentDisplayStatus, type PaymentItem, type PaymentStatus } from "@shared/payments";
import React, { useState } from "react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "./format";

/**
 * Payment by bank transfer until online payment is ready: send the details (the owner is emailed the amount, account
 * and reference), note when proof arrives, and confirm when the money is in the account. The server checks the
 * permission (manage_payments) and records every step; confirming the Current State Assessment wins the business and sends the client
 * account invitation.
 */

type Payment = {
  id: number;
  item: PaymentItem;
  amountNaira: number;
  reference: string;
  status: PaymentStatus;
  /** "expired" once the details' 48 hours have passed without proof or payment. */
  displayStatus: PaymentDisplayStatus;
  payBy: Date | string;
  requestedAt: Date | string;
  deliveryStatus: "Sent" | "Failed" | "Simulated";
  proofReceivedAt: Date | string | null;
  confirmedAt: Date | string | null;
  note: string | null;
};

export type ReportState = { status: "awaiting_intake" | "delivered"; createdAt: Date | string; deliveredAt: Date | string | null; deliveryStatus: "Sent" | "Failed" | "Simulated" } | null;

/** Where the paid full report stands: waiting for the owner's form, or sent (and downloadable). */
function ReportLine({ businessCheckId, report }: { businessCheckId: number; report: ReportState }) {
  const utils = trpc.useUtils();
  const download = trpc.businessSupport.downloadReport.useMutation({
    onSuccess: result => savePdf(result.fileName, result.pdf),
    onError: error => toast.error(error.message),
  });
  const resend = trpc.businessSupport.resendReportLink.useMutation({
    onSuccess: result => {
      if (result.deliveryStatus === "Failed") toast.error("A new link was made, but the email failed. Try again.");
      else toast.success("A new Report Intake link is on its way to the owner.");
      void utils.businessSupport.checkDetail.invalidate({ businessCheckId });
    },
    onError: error => toast.error(error.message),
  });
  if (!report) return <p className="mt-2 text-[13px] text-ink-muted">Full Report: the Report Intake link is sent when the payment is confirmed.</p>;
  return (
    <div className="mt-3 space-y-2 border-t border-line-soft pt-3 text-[13px]">
      {report.status === "delivered" ? (
        <>
          <p className="text-ink">Full Report sent {report.deliveredAt ? formatDate(report.deliveredAt) : ""}{report.deliveryStatus === "Failed" ? " · the email failed" : ""}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" disabled={download.isPending} onClick={() => download.mutate({ businessCheckId })}>Download the Full Report</Button>
        </>
      ) : (
        <>
          <p className="text-ink">Report Intake sent {formatDate(report.createdAt)}. Waiting for the owner's answers; the Full Report goes out the moment they finish.</p>
          <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" disabled={resend.isPending} onClick={() => resend.mutate({ businessCheckId })}>Send the Report Intake link again</Button>
        </>
      )}
    </div>
  );
}

const SHORT_NAME: Record<PaymentItem, string> = { full_report: "Full Report", current_state: CURRENT_STATE.name };

const CHIP: Record<PaymentDisplayStatus, string> = {
  requested: "border-highlight-ink/30 bg-highlight-ink/5 text-highlight-ink",
  proof_received: "border-health-watch/30 bg-health-watch-tint text-health-watch",
  confirmed: "border-health-clear/30 bg-health-clear-tint text-health-clear",
  expired: "border-danger-line bg-danger-tint text-danger",
};

/** The payment state beside a business check in the lists: "Report paid", "Current State Assessment: proof received"… */
export function PaymentChips({ payments, reportRequestedAt }: { payments: Partial<Record<PaymentItem, PaymentDisplayStatus>>; reportRequestedAt: Date | string | null }) {
  const chips = PAYMENT_ITEMS.flatMap(item => {
    const status = payments[item];
    if (!status) return item === "full_report" && reportRequestedAt ? [{ item, text: "Full Report requested", className: CHIP.requested }] : [];
    const text = status === "confirmed" ? `${SHORT_NAME[item]} paid` : `${SHORT_NAME[item]}: ${PAYMENT_DISPLAY_LABELS[status].toLowerCase()}`;
    return [{ item, text, className: CHIP[status] }];
  });
  return <>{chips.map(chip => <span key={chip.item} className={`mt-1 block w-fit border px-1.5 py-0.5 text-[11px] font-medium ${chip.className}`}>{chip.text}</span>)}</>;
}

const INVITATION_RESULT = {
  sent: `Payment confirmed. The ${CURRENT_STATE.name} starts: the client account invitation is on its way.`,
  already_invited: "Payment confirmed. A client account invitation was already out, so no new one was sent.",
  has_account: "Payment confirmed. They already have a client account.",
} as const;

function PaymentRow({ businessCheckId, item, payment, report }: { businessCheckId: number; item: PaymentItem; payment: Payment | undefined; report: ReportState }) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const refresh = () => {
    void utils.businessSupport.checkDetail.invalidate({ businessCheckId });
    void utils.businessSupport.checks.invalidate();
    void utils.businessSupport.discoveryCalls.invalidate();
    void utils.onboarding.candidates.invalidate();
  };
  const send = trpc.businessSupport.requestPayment.useMutation({
    onSuccess: result => {
      if (result.deliveryStatus === "Failed") toast.error(`Saved as ${result.reference}, but the email failed. Try sending it again.`);
      else toast.success(`Payment details sent. Reference ${result.reference}.`);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const proof = trpc.businessSupport.markProofReceived.useMutation({
    onSuccess: () => {
      toast.success("Proof of payment noted. Confirm once the money is in the account.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const confirm = trpc.businessSupport.confirmPayment.useMutation({
    onSuccess: result => {
      setConfirming(false);
      setNote("");
      if (result.invitation === "failed") toast.error("Payment confirmed, but the client account invitation could not be sent. Send it from Client Onboarding.");
      else toast.success(result.invitation ? INVITATION_RESULT[result.invitation] : "Payment confirmed. The owner has been emailed.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const busy = send.isPending || proof.isPending || confirm.isPending;
  const { name, amount } = PAYMENT_ITEM_DETAILS[item];
  const open = payment && payment.status !== "confirmed";

  return (
    <li className="border border-line-soft p-3" aria-label={name}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">{name}</p>
        <p className="text-sm tabular-nums text-ink">{formatNaira(payment?.amountNaira ?? amount)}</p>
      </div>
      {payment ? (
        <div className="mt-1.5 space-y-0.5 text-[13px]">
          <p><span className={`inline-block border px-1.5 py-0.5 text-[11px] font-medium ${CHIP[payment.displayStatus]}`}>{PAYMENT_DISPLAY_LABELS[payment.displayStatus]}</span> <span className="ml-1 text-ink-muted">Reference</span> <span className="font-medium tabular-nums text-ink">{payment.reference}</span></p>
          <p className="text-ink-muted">Details sent {formatDate(payment.requestedAt)}{payment.deliveryStatus === "Failed" ? " · the email failed" : ""}{payment.status === "requested" ? ` · pay by ${formatDateTime(payment.payBy)}` : ""}</p>
          {payment.displayStatus === "expired" && (
            <p className="text-danger">The {PAYMENT_WINDOW_HOURS} hours have passed with no payment. Send the details again for a new window, or move the business to Lost. Money that still arrives can be confirmed.</p>
          )}
          {payment.proofReceivedAt && <p className="text-ink-muted">Proof received {formatDate(payment.proofReceivedAt)}</p>}
          {payment.confirmedAt && <p className="text-ink-muted">Paid, confirmed {formatDate(payment.confirmedAt)}</p>}
          {payment.note && <p className="text-ink">{payment.note}</p>}
        </div>
      ) : <p className="mt-1.5 text-[13px] text-ink-muted">Payment details not sent.</p>}

      {item === "full_report" && payment?.status === "confirmed" && <ReportLine businessCheckId={businessCheckId} report={report} />}

      {payment?.status !== "confirmed" && !confirming && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" disabled={busy} onClick={() => send.mutate({ businessCheckId, item })}>
            {payment ? "Send the details again" : "Send payment details"}
          </Button>
          {payment?.status === "requested" && (
            <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" disabled={busy} onClick={() => proof.mutate({ paymentRequestId: payment.id })}>Proof received</Button>
          )}
          {open && (
            <Button type="button" size="sm" className="rounded-none bg-ink text-xs text-paper hover:bg-charcoal" disabled={busy} onClick={() => setConfirming(true)}>Confirm payment</Button>
          )}
        </div>
      )}

      {confirming && payment && (
        <div className="mt-3 space-y-2 border-t border-line-soft pt-3">
          <p className="text-[13px] text-ink">
            Only confirm once you have seen {formatNaira(payment.amountNaira)} with reference {payment.reference} in the account. The owner is emailed
            {item === "current_state" ? ", the business moves to Won and they get a link to set up their client account, where the Current State Assessment starts." : " with the Report Intake link; their Full Report is emailed the moment they finish it."}
          </p>
          <div className="space-y-1">
            <Label htmlFor={`payment-note-${payment.id}`} className="text-xs text-ink-muted">Note (optional)</Label>
            <Textarea id={`payment-note-${payment.id}`} value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} placeholder="For example, the bank's transaction reference" className="rounded-none text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="rounded-none bg-ink text-xs text-paper hover:bg-charcoal" disabled={busy} onClick={() => confirm.mutate({ paymentRequestId: payment.id, note: note.trim() || undefined })}>Yes, the money is in</Button>
            <Button type="button" variant="outline" size="sm" className="rounded-none text-xs" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Both things an owner can pay for before the Current State Assessment, in journey order. */
export function PaymentsPanel({ businessCheckId, payments, report = null }: { businessCheckId: number; payments: Payment[] | null | undefined; report?: ReportState }) {
  if (payments === null) return <p className="text-sm text-ink-muted">Payments are not set up in the database yet (migration 0006).</p>;
  return (
    <ul className="space-y-2.5">
      {PAYMENT_ITEMS.map(item => <PaymentRow key={item} businessCheckId={businessCheckId} item={item} payment={(payments ?? []).find(payment => payment.item === item)} report={report} />)}
    </ul>
  );
}
