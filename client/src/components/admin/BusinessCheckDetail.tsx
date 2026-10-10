import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { AdminSectionId } from "@/lib/adminSections";
import { READINESS_LABELS } from "@shared/businessCheck/engine";
import { formatNaira, PRICES } from "@shared/businessSupport";
import { funnelStatus, isReadyToOnboard, stageDisplayName } from "@shared/businessCheck/funnelStatus";
import { PIPELINE_LABELS, PIPELINE_STAGES, type PipelineStage } from "@shared/businessCheck/pipeline";
import { AREA_NAMES, type Health } from "@shared/businessCheck/questions";
import React, { useState } from "react";
import { toast } from "sonner";
import { CopyButton, DetailField, DetailSection, StatusBadge } from "./AdminPrimitives";
import { formatDate, formatDateTime, ROUTE_LABELS, whatsappLink } from "./format";
import { PaymentsPanel } from "./Payments";
import { PAYMENT_ITEM_DETAILS } from "@shared/payments";

const HEALTH: Record<Health, { label: string; className: string }> = {
  clear: { label: "Clear", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  watch: { label: "Watch", className: "border-amber-200 bg-amber-50 text-amber-900" },
  stuck: { label: "Stuck", className: "border-rose-200 bg-rose-50 text-rose-900" },
};

/** Email and WhatsApp as plain, copyable contact lines. WhatsApp opens a chat only when the number is usable. */
export function ContactLines({ email, whatsapp }: { email: string; whatsapp: string | null }) {
  const link = whatsappLink(whatsapp);
  return (
    <dl className="space-y-2">
      <DetailField label="Email">
        <span className="flex items-center gap-1">
          <a href={`mailto:${email}`} className="break-all text-brand underline-offset-2 hover:underline">{email}</a>
          <CopyButton value={email} label="email" />
        </span>
      </DetailField>
      <DetailField label="WhatsApp">
        {whatsapp ? (
          <span className="flex items-center gap-1">
            {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">{whatsapp}</a> : <span>{whatsapp}</span>}
            <CopyButton value={whatsapp} label="WhatsApp number" />
          </span>
        ) : <span className="text-ink-muted">Not given</span>}
      </DetailField>
    </dl>
  );
}

/**
 * The whole business check for one prospect, as it was saved when they finished it. Nothing is recalculated, no
 * recommendation is created here, and the owner's raw answers are not shown.
 */
const stageName = (stage: string | null) => (stage && stage in PIPELINE_LABELS ? stageDisplayName(stage as PipelineStage) : stage ?? "-");
const PAYMENT_HISTORY = { payment_details_sent: "Payment details sent", payment_proof_received: "Proof of payment received", payment_confirmed: "Payment confirmed" } as const;
const REPORT_HISTORY = { full_report_link_sent: "Report Intake link sent again", full_report_delivered: "Full Report sent" } as const;
/** "lead" is where every check starts, so the team never moves a check back to it. */
const MOVABLE_STAGES = PIPELINE_STAGES.filter((stage): stage is Exclude<PipelineStage, "lead"> => stage !== "lead");

/**
 * Moves the check to any later stage, with an optional note for the team. The server checks the permission, refuses to
 * reopen a won business and records who moved it, from where, to where and why.
 */
function MoveStage({ businessCheckId, current }: { businessCheckId: number; current: PipelineStage }) {
  const utils = trpc.useUtils();
  const [note, setNote] = useState("");
  const move = trpc.businessSupport.setStage.useMutation({
    onSuccess: result => {
      toast.success(`Moved to ${stageName(result.pipelineStage)}.`);
      setNote("");
      void utils.businessSupport.checkDetail.invalidate({ businessCheckId });
      void utils.businessSupport.checks.invalidate();
      void utils.businessSupport.discoveryCalls.invalidate();
      void utils.onboarding.candidates.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (current === "won") return <p className="text-sm text-ink-muted">This business has been won, so its stage is final.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MOVABLE_STAGES.filter(stage => stage !== current).map(stage => (
          <Button key={stage} type="button" variant="outline" size="sm" title={PIPELINE_LABELS[stage].meaning} disabled={move.isPending}
            className={`rounded-none text-xs ${stage === "won" ? "border-emerald-300 text-emerald-900 hover:bg-emerald-50" : stage === "lost" ? "border-rose-200 text-rose-800 hover:bg-rose-50" : ""}`}
            onClick={() => move.mutate({ businessCheckId, stage, note: note.trim() || undefined })}>
            {stageDisplayName(stage)}
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`stage-note-${businessCheckId}`} className="text-xs text-ink-muted">Note (optional)</Label>
        <Textarea id={`stage-note-${businessCheckId}`} value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} placeholder="For example, what was agreed on the call" className="rounded-none text-sm" />
      </div>
    </div>
  );
}

export default function BusinessCheckDetail({ businessCheckId, onOpenSection, onClose }: { businessCheckId: number; onOpenSection: (section: AdminSectionId) => void; onClose: () => void }) {
  const detail = trpc.businessSupport.checkDetail.useQuery({ businessCheckId }, { retry: false, refetchOnWindowFocus: false });
  if (detail.isLoading) return <p className="text-sm text-ink-muted">Loading the record…</p>;
  if (detail.error || !detail.data) return <p role="alert" className="text-sm text-rose-900">{detail.error?.message ?? "This record is not available."}</p>;

  const check = detail.data;
  const status = funnelStatus(check);
  const mainArea = check.primaryAreaNumber !== null ? AREA_NAMES[check.primaryAreaNumber] ?? `Area ${check.primaryAreaNumber}` : null;
  const nextStep: { label: string; section: AdminSectionId; primary: boolean } | null =
    isReadyToOnboard(status) ? { label: "Continue to Client Onboarding", section: "onboarding", primary: true }
    : status === "onboarding" ? { label: "View the onboarding link", section: "onboarding", primary: false }
    : status === "call_requested" || status === "call_scheduled" ? { label: "Go to the Debrief", section: "calls", primary: false }
    : null;
  const go = (section: AdminSectionId) => {
    onClose();
    onOpenSection(section);
  };

  const history = [
    { label: check.completedAt ? "Business Check completed" : "Business Check started", at: check.completedAt ?? check.createdAt },
    ...(check.callRequestedAt ? [{ label: "Debrief requested", at: check.callRequestedAt }] : []),
    ...(check.reportRequestedAt ? [{ label: "Full Report requested", at: check.reportRequestedAt }] : []),
    ...(check.callScheduledFor ? [{ label: "Debrief booked for", at: check.callScheduledFor, withTime: true }] : []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status} />
        {!check.completedAt && <span className="text-xs text-ink-muted">The owner has not finished the Business Check.</span>}
      </div>

      <DetailSection title="Contact"><ContactLines email={check.email} whatsapp={check.whatsapp} /></DetailSection>

      <DetailSection title="Business Check">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          <DetailField label={check.completedAt ? "Completed" : "Started"}>{formatDate(check.completedAt ?? check.createdAt)}</DetailField>
          <DetailField label="Main area">{mainArea ?? "-"}</DetailField>
          <DetailField label="Readiness">{check.readiness ? READINESS_LABELS[check.readiness] : "-"}</DetailField>
          <DetailField label="Route">{check.route ? ROUTE_LABELS[check.route] ?? check.route : "-"}</DetailField>
          <DetailField label={`Full Report (${formatNaira(PRICES.fullReport)})`}>{check.reportRequestedAt ? `Requested ${formatDate(check.reportRequestedAt)}` : "Not requested"}</DetailField>
        </dl>
      </DetailSection>

      {check.summary ? (
        <DetailSection title="Findings">
          <div className="space-y-3 text-sm leading-relaxed text-ink">
            <p>{check.summary.found}</p>
            <p><span className="font-medium">What we think it is: </span>{check.summary.think}</p>
          </div>
        </DetailSection>
      ) : (
        <DetailSection title="Findings"><p className="text-sm text-ink-muted">No result yet.</p></DetailSection>
      )}

      {check.outline && check.outline.length > 0 && (
        <DetailSection title="Business outline">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {check.outline.map(row => (
              <li key={row.area} className={`flex items-center justify-between gap-2 border px-2.5 py-1.5 text-[13px] ${row.area === check.primaryAreaNumber ? "border-brand-line bg-brand-tint" : "border-line-soft"}`}>
                <span className="min-w-0 truncate">{row.name}{row.area === check.primaryAreaNumber && <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">Start here</span>}</span>
                <span className={`shrink-0 border px-1.5 py-0.5 text-[11px] font-medium ${HEALTH[row.health].className}`}>{HEALTH[row.health].label}</span>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      {check.summary && check.summary.offerings.length > 0 && (
        <DetailSection title="Recommended support">
          <ul className="space-y-2.5">
            {check.summary.offerings.map(offering => (
              <li key={offering.id} className="text-sm">
                <p className="font-medium text-ink">{offering.name}</p>
                <p className="text-[13px] text-ink-muted">{offering.why}</p>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}

      <DetailSection title="Funnel">
        <ol className="space-y-1.5 text-sm">
          {history.map(event => (
            <li key={event.label} className="flex justify-between gap-4"><span className="text-ink-muted">{event.label}</span><span>{"withTime" in event && event.withTime ? formatDateTime(event.at) : formatDate(event.at)}</span></li>
          ))}
          <li className="flex items-center justify-between gap-4 border-t border-line-soft pt-2"><span className="text-ink-muted">Current stage</span><StatusBadge status={status} /></li>
        </ol>
      </DetailSection>

      <DetailSection title="Payments">
        <PaymentsPanel businessCheckId={check.id} payments={check.payments} report={check.report} />
      </DetailSection>

      <DetailSection title="Move to">
        <MoveStage businessCheckId={check.id} current={check.pipelineStage} />
      </DetailSection>

      <DetailSection title="Stage history">
        {check.stageHistory.length ? (
          <ol className="space-y-2.5 text-sm" aria-label="Stage history">
            {check.stageHistory.map(event => (
              <li key={event.id} className="border-l-2 border-brand-line pl-3">
                <p className="text-ink">
                  {event.action === "payment_details_sent" || event.action === "payment_proof_received" || event.action === "payment_confirmed"
                    ? <>
                        {PAYMENT_HISTORY[event.action]}{event.item ? `: ${PAYMENT_ITEM_DETAILS[event.item].name}` : ""}{event.reference ? ` (${event.reference})` : ""}
                        {event.to && <span className="text-ink-muted"> · moved to {stageName(event.to)}</span>}
                      </>
                    : event.action === "full_report_link_sent" || event.action === "full_report_delivered"
                    ? <>{REPORT_HISTORY[event.action]}{event.reference ? ` (${event.reference})` : ""}</>
                    : event.action === "business_check_call_booked"
                    ? <>Booked on Calendly{event.scheduledFor ? ` for ${formatDateTime(event.scheduledFor)}` : ""}</>
                    : event.action === "business_check_call_scheduled"
                    ? <>Debrief time recorded{event.scheduledFor ? ` for ${formatDateTime(event.scheduledFor)}` : ""}</>
                    : <><span className="font-medium">{stageName(event.to)}</span> <span className="text-ink-muted">from {stageName(event.from)}</span></>}
                </p>
                <p className="text-xs text-ink-muted">{event.by ?? (event.action === "payment_details_sent" || event.action === "full_report_delivered" ? "Sent automatically" : "Team")} · {formatDateTime(event.at)}</p>
                {event.note && <p className="mt-0.5 text-[13px] text-ink">{event.note}</p>}
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-ink-muted">No changes by the team yet. The first stages move by themselves as the owner goes through the Business Check.</p>}
      </DetailSection>

      {/* Only the action that fits where this prospect is. A check with nothing to do next shows no actions. */}
      {nextStep && (
        <DetailSection title="Next step">
          <Button type="button" variant={nextStep.primary ? "default" : "outline"} className={`rounded-none text-xs uppercase tracking-wider ${nextStep.primary ? "bg-brand text-white" : ""}`} onClick={() => go(nextStep.section)}>{nextStep.label}</Button>
        </DetailSection>
      )}
    </>
  );
}
