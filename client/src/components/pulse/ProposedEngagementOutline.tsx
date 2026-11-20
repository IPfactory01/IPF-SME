/**
 * A proposal-style bridge between the free Pulse result and IPF's governed
 * commercial next step. It is an indicative engagement outline, not a binding
 * scope, quote or commitment: full scope remains subject to consultation.
 */
import React from "react";
import {
  ClipboardList,
  Compass,
  FileCheck2,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { PathwayResult } from "@shared/pulse/pathwayEngine";

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

export function ProposedEngagementOutline({ pathway }: { pathway: PathwayResult }) {
  const primary = pathway.primary;
  const step = pathway.paidNextStep;
  const supporting = pathway.supporting;

  if (!primary && !step && pathway.prerequisites.length === 0) return null;

  return (
    <section className="fade-up rounded-2xl border border-brand-line bg-brand-tint-softest p-6 sm:p-7">
      <div className="flex gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Indicative engagement outline</p>
          <h2 className="font-display mt-1 text-xl font-semibold">A proposed next engagement with IPF</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            This translates your responses into a starting outline for discussion. It is not a final scope, quote or commitment; IPF would confirm the right approach with you first.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <Target className="h-3.5 w-3.5" /> Objective
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/85">
            {primary
              ? `Clarify the priorities and evidence behind the ${primary.label} pathway identified by your responses.`
              : "Clarify the priority foundations and evidence needed before selecting a broader AI or workflow-improvement path."}
          </p>
          {primary?.meaningText && (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{primary.meaningText}</p>
          )}
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <Compass className="h-3.5 w-3.5" /> Proposed scope of work
          </p>
          {step ? (
            <List items={step.examine} />
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Scope would be agreed after IPF has reviewed the priority conditions identified above.
            </p>
          )}
          {supporting.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Secondary considerations: {supporting.map((item) => item.label).join("; ")}.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <ClipboardList className="h-3.5 w-3.5" /> Methodology
          </p>
          <List
            items={[
              "Confirm the relevant business context, stakeholders and evidence with your team.",
              "Review the current workflow, controls and operating conditions that matter to the proposed scope.",
              "Prioritise findings and agree practical next actions before any broader implementation work.",
            ]}
          />
        </div>

        <div className="rounded-xl border border-brand-tint bg-white/80 p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <FileCheck2 className="h-3.5 w-3.5" /> Outputs to discuss
          </p>
          {step ? (
            <List items={step.receive} />
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              IPF would agree the appropriate outputs after the initial scope conversation.
            </p>
          )}
        </div>
      </div>

      {pathway.prerequisites.length > 0 && (
        <div className="mt-4 rounded-xl border border-health-watch bg-health-watch-tint p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-danger">
            <ShieldCheck className="h-3.5 w-3.5" /> Conditions to address first
          </p>
          <ul className="mt-2 space-y-1.5">
            {pathway.prerequisites.map((item) => (
              <li key={item.gateId} className="text-sm leading-relaxed text-ink/85">
                <strong>{item.gateId}:</strong> {item.requiredAction}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step && (
        <p className="mt-5 border-t border-brand-tint pt-4 text-sm leading-relaxed text-ink-muted">
          <strong className="text-ink">Next step:</strong> discuss the <strong className="text-brand">{step.productName}</strong> with IPF to confirm fit, detailed scope and commercial terms. The governed service options appear below.
        </p>
      )}
    </section>
  );
}

