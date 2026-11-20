/**
 * The single Engagement layer of the Pulse result experience.
 *
 * It deliberately owns the one recommended IPF engagement, its practical
 * outline and all commercial choices. Insight (scores and risks) and Action
 * (the 90-day plan) render earlier on the result page and are not repeated.
 */
import React, { useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileText,
  Mail,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { PathwayResult } from "@shared/pulse/pathwayEngine";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { EmailReportForm } from "@/components/pulse/PulseFollowUp";

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink/85">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PathwayConversionSection({
  sessionId,
  pathway,
}: {
  sessionId: string;
  pathway: PathwayResult;
}) {
  const scopeMutation = trpc.pulse.requestScope.useMutation();
  const [actionState, setActionState] = useState<"idle" | "requesting" | "requested" | "error">("idle");
  const [showEmailForm, setShowEmailForm] = useState(false);

  const primary = pathway.primary;
  const step = pathway.paidNextStep;
  const busy = actionState === "requesting";

  const askForScope = () => {
    if (busy || !step) return;
    setActionState("requesting");
    scopeMutation.mutate(
      { sessionId },
      {
        onSuccess: () => {
          setActionState("requested");
          toast.success("Your request for the scope and fee has reached IP Factory.");
        },
        onError: (error: { message?: string }) => {
          setActionState("error");
          toast.error(error.message || "Something went wrong. Kindly try again.");
        },
      },
    );
  };

  if (!primary && !step && pathway.supporting.length === 0) {
    return (
      <section className="rounded-2xl border bg-paper-raised p-6 text-sm leading-relaxed text-ink-muted border-line">
        Your 90-day action plan is the right place to start. If you would like help deciding what to do first,{" "}
        <a href={BRAND.discoveryCallUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">book a free Discovery Call</a>.
      </section>
    );
  }

  return (
    <section className="fade-up rounded-2xl border-2 border-highlight/60 bg-brand-tint-softest p-6 sm:p-7">
      <div className="flex gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Recommended next step with IPF</p>
          <h2 className="font-display mt-1 text-xl font-semibold">
            {step?.productName ?? primary?.label ?? "Clarify your priority foundations"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            This is an indicative starting point based on your responses. IPF would confirm fit, detailed scope and commercial terms with you before work begins.
          </p>
        </div>
      </div>

      {step?.productTagline && (
        <p className="mt-5 rounded-xl border border-brand-tint bg-white/80 p-4 text-sm font-medium leading-relaxed text-brand">
          {step.productTagline}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <Target className="h-3.5 w-3.5" /> Why this is recommended
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/85">
            {primary?.reasonText ?? primary?.meaningText ?? "Your responses indicate that this is the most useful focus for an IPF discussion."}
          </p>
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <ShieldCheck className="h-3.5 w-3.5" /> Engagement objective
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/85">
            {primary
              ? `Clarify the priorities and evidence behind the ${primary.label} pathway identified by your responses.`
              : "Clarify the priority foundations and evidence needed before selecting a broader AI or workflow-improvement path."}
          </p>
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <Target className="h-3.5 w-3.5" /> What IPF would examine
          </p>
          {step ? <List items={step.examine} /> : <p className="mt-2 text-sm text-ink-muted">The focus would be agreed in an initial IPF conversation.</p>}
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <FileText className="h-3.5 w-3.5" /> What you could receive
          </p>
          {step ? <List items={step.receive} /> : <p className="mt-2 text-sm text-ink-muted">IPF would agree the appropriate outputs after the initial scope conversation.</p>}
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-brand-tint-soft p-4 text-sm leading-relaxed text-ink/85">
        <p className="font-semibold text-brand">How IPF would approach it</p>
        <p className="mt-1.5">Confirm the relevant business context and evidence with your team, review the workflow and operating conditions that matter, then prioritise practical next actions before any broader implementation work.</p>
      </div>

      {step && (
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-brand-line pt-4 text-sm text-ink-muted">
          {step.indicativeDelivery && <p><span className="font-medium text-ink/70">Indicative delivery:</span> {step.indicativeDelivery}</p>}
          <p>
            <span className="font-medium text-ink/70">Fee:</span>{" "}
            {step.feeNaira != null ? `₦${Math.round(step.feeNaira).toLocaleString("en-NG")}` : "Scope-dependent — confirmed after scoping"}
          </p>
        </div>
      )}

      {step && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Choose your preferred next step</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Button asChild size="lg" variant="outline" className="h-auto min-h-14 border-brand text-brand hover:bg-brand-tint">
              <a href={BRAND.discoveryCallUrl} target="_blank" rel="noopener noreferrer">
                <CalendarDays className="mr-2 h-4 w-4" /> Book a Discovery Call
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-auto min-h-14 border-brand text-brand hover:bg-brand-tint" disabled={busy || actionState === "requested"} onClick={askForScope}>
              {busy ? "Sending…" : "Ask for the scope and fee"}
            </Button>
          </div>
          {actionState === "requested" && (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand">
              <CheckCircle2 className="h-4 w-4" /> Your request is recorded. The team will reply to the email you gave at the start.
            </p>
          )}
          {actionState === "error" && <p className="mt-3 text-sm text-danger">The request could not be sent. Kindly try again or book a Discovery Call.</p>}
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">Fees are confirmed in writing before any work begins under IPF terms ({step.termsVersion}).</p>
        </div>
      )}

      {pathway.supporting.length > 0 && (
        <Accordion type="multiple" className="mt-5 border-t border-brand-tint pt-2">
          <AccordionItem value="supporting" className="border-none">
            <AccordionTrigger className="font-display py-3 text-left text-sm font-semibold hover:no-underline">
              <span className="flex items-center gap-2"><ChevronDown className="h-4 w-4 text-ink-muted" /> Also relevant to consider</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-1">
              {pathway.supporting.map((item) => (
                <div key={item.pathwayId} className="rounded-lg border border-dashed border-line bg-white/70 p-3">
                  <p className="font-medium text-brand">{item.label}</p>
                  {item.reasonText && <p className="mt-1 text-sm leading-relaxed text-ink/85">{item.reasonText}</p>}
                  {item.meaningText && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.meaningText}</p>}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <div className="mt-5 border-t border-brand-tint pt-4">
        <Button variant="ghost" size="sm" className="text-brand hover:bg-transparent hover:underline" onClick={() => setShowEmailForm((value) => !value)}>
          <Mail className="mr-1.5 h-4 w-4" /> {showEmailForm ? "Hide email form" : "Email a copy of these results"}
        </Button>
        {showEmailForm && <div className="mt-4"><EmailReportForm sessionId={sessionId} /></div>}
      </div>
    </section>
  );
}
