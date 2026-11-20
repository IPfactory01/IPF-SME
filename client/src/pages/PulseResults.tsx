/**
 * /pulse/results/:sessionId — on-screen results BEFORE contact collection
 * (PRD §7.4, the core "show first, ask later" rule).
 *
 * Shows: overall score with classification, per-dimension bars with
 * explanations, evidence warning, triggered gates with required actions,
 * eligible routes, and 90-day recommendations. The emailed-report and
 * consultation steps are presented afterwards as optional follow-ups
 * (see PulseFollowUp component).
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import PulseLayout from "@/components/pulse/PulseLayout";
import { InviteTeamBox, ShareResultsRow } from "@/components/pulse/PulseShare";
import { PathwayConversionSection } from "@/components/pulse/PathwayConversionSection";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

function classificationTone(label: string): { accent: string; note: string } {
  if (/ready to scale/i.test(label)) return { accent: "var(--color-brand)", note: "Mature foundations — focus on evidence and risk controls." };
  if (/deployment-ready/i.test(label)) return { accent: "var(--color-brand)", note: "Strong footing — validate critical items before structured rollout." };
  if (/pilot-ready/i.test(label)) return { accent: "var(--color-brand)", note: "A narrow, controlled pilot may be possible after confirming risks." };
  if (/foundations required/i.test(label)) return { accent: "var(--color-danger)", note: "Address material foundations before any AI or automation pilot." };
  return { accent: "var(--color-brand)", note: "Some foundations exist — close the priority gaps first." };
}

function dimTone(score: number): string {
  if (score >= 66) return "var(--color-brand)";
  if (score >= 34) return "var(--color-brand)";
  return "var(--color-danger)";
}

function timeframeLabel(tf: string): string {
  if (tf === "0-30 days") return "Days 0–30";
  if (tf === "31-60 days") return "Days 31–60";
  if (tf === "61-90 days") return "Days 61–90";
  return tf;
}


export default function PulseResults() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/pulse/results/:sessionId");
  // Extract sessionId from the route (/pulse/results/:sessionId)
  const pathSessionId = params?.sessionId ?? "";

  const resultsQuery = trpc.pulse.getResults.useQuery(
    { sessionId: pathSessionId },
    { enabled: Boolean(pathSessionId) },
  );

  useEffect(() => {
    if (pathSessionId) {
      sessionStorage.setItem("pulse.sessionId", pathSessionId);
      // Keep the flag until results are confirmed so the wizard knows this
      // session was started in the same visit (suppresses the resume hint).
      if (!sessionStorage.getItem("pulse.assessmentStarted")) {
        sessionStorage.setItem("pulse.assessmentStarted", pathSessionId);
      }
    }
  }, [pathSessionId]);
  // The session behind this results page is completed by definition
  // (getResults only serves completed sessions), so clear resume-related
  // flags: a same-tab revisit of the wizard must show the completion screen,
  // never a stale "resume your draft" prompt.
  useEffect(() => {
    if (resultsQuery.data) {
      sessionStorage.setItem("pulse.assessmentFinished", "1");
      sessionStorage.removeItem("pulse.resumeHintShown");
    }
  }, [Boolean(resultsQuery.data)]);

  const versionQuery = trpc.pulse.getActiveVersion.useQuery(
    pathSessionId ? { sessionId: pathSessionId } : undefined,
  );
  const results = resultsQuery.data;
  // Server returns classification as a label string; join interpretation from the
  // projected version config.
  const classificationLabel = results?.classification ?? "";
  const interpretation =
    versionQuery.data?.classification_labels.find((c) => c.label === classificationLabel)?.interpretation ??
    "";
  const tone = useMemo(() => classificationTone(classificationLabel), [classificationLabel]);

  if (resultsQuery.isLoading) {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <div className="h-12 w-12 animate-pulse rounded-full bg-brand-tint" />
          <p className="text-sm text-ink-muted">Preparing your results…</p>
        </div>
      </PulseLayout>
    );
  }

  if (resultsQuery.error || !results) {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="max-w-md text-sm text-ink-muted">
            {resultsQuery.error?.message || "We could not find these results."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="border-brand-line bg-paper-raised text-brand hover:bg-brand-tint" onClick={() => navigate("/pulse")}>Start the Pulse</Button>
            <Link href="/"><Button variant="ghost">Go home</Button></Link>
          </div>
        </div>
      </PulseLayout>
    );
  }

  return (
    <PulseLayout>
      <div className="container max-w-3xl py-10 space-y-8">
        {/* ---------- Hero: score + classification ---------- */}
        <section className="fade-up rounded-2xl bg-gradient-to-br from-brand-deep to-brand-plum p-7 text-white shadow-lg sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            Your Pulse result
          </p>
          <div className="mt-5 flex flex-wrap items-end gap-5">
            <span
              className="font-display text-6xl font-bold leading-none sm:text-7xl"
              style={{ color: "var(--color-on-dark-muted)" }}
            >
              {results.overallScore}
            </span>
            <div className="pb-1.5">
              <p className="font-display text-2xl font-semibold">{classificationLabel}</p>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-white/75">{interpretation}</p>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-white/10 p-3 text-xs leading-relaxed text-white/80">
            Scored out of 100 across six dimensions: strategy, process, data,
            technology, people and governance — built from your {Number(results.answeredCount)}{" "}
            foundation answers{Number(results.unknownCount) > 0 ? ` (${Number(results.unknownCount)} “don't know”)` : ""}. Your six opportunity answers
            shaped the pathway fit below rather than the score.
          </div>
        </section>

        {/* ---------- Share your result ---------- */}
        <ShareResultsRow
          sessionId={pathSessionId}
          classificationLabel={classificationLabel}
          shortCode={results.shortCode ?? null}
        />

        {/* ---------- Evidence warning ---------- */}
        {results.showEvidenceWarning && (
          <div className="fade-up flex gap-3 rounded-xl border border-health-watch-strong bg-health-watch-tint p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <p className="leading-relaxed">
              <strong>Evidence gap:</strong> some questions were answered
              “I don't know”. Those areas score zero until verified, so the
              true readiness may be higher than shown. A consultant can
              validate these with you.
            </p>
          </div>
        )}

        {/* ---------- Dimension bars ---------- */}
        <section>
          <h2 className="font-display text-xl font-semibold">Readiness by dimension</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Each area is scored independently so you can see exactly where the
            gaps are.
          </p>
          <div className="mt-5 space-y-4">
            {results.dimensions.map((d) => (
              <div key={d.dimension_id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-ink-muted tabular-nums">{d.score}/100</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-paper-muted">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${d.score}%`, backgroundColor: dimTone(d.score) }}
                  />
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">{d.explanation}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Gates ---------- */}
        {results.gates.length > 0 && (
          <section>
            <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
              <ShieldAlert className="h-5 w-5 text-danger" />
              Risks flagged by your answers
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              These specific conditions in your answers trigger governance or
              workflow rules in the Pulse method. They must be addressed
              before the related route.
            </p>
            <div className="mt-4 space-y-3">
              {results.gates.map((g) => (
                <div key={g.gateId} className="rounded-xl border border-health-watch bg-health-watch-tint p-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-danger">{g.gateId}</p>
                  <p className="mt-1.5 text-sm leading-relaxed">{g.riskText}</p>
                  <p className="mt-2 flex gap-1.5 text-xs font-medium text-ink/80">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    Required before proceeding: {g.requiredAction}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Routes: free-method view ---------- */}
        {results.routes.length > 0 && !results.pathwayResult && (
          <section>
            <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
              <Compass className="h-5 w-5 text-brand" />
              Which Pulse pathway fits your business
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Based on the opportunity questions you answered, these pathways
              are eligible for a structured IPF engagement. Priority 1 is
              your primary eligibility; priority 2 is supporting.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {results.routes.map((r) => (
                <div key={r.routeId} className="rounded-xl border bg-paper-raised p-4 border-line">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{r.label}</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.priority === 1 ? "bg-brand-tint text-brand" : "bg-paper-muted text-ink-soft"}`}>
                      {r.priority === 1 ? "Primary" : "Supporting"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Recommendations / 90-day plan ---------- */}
        <section>
          <h2 className="font-display flex items-center gap-2 text-xl font-semibold">
            <Sparkles className="h-5 w-5 text-brand" />
            Your 90-day action plan
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            The method matched your answers to concrete actions. Work them in
            order — each timeframe builds on the last.
          </p>
          {results.recommendations.length > 0 ? (
            <Accordion type="single" collapsible className="mt-4">
              {["0-30 days", "31-60 days", "61-90 days"].map((tf) => {
                const recs = results.recommendations.filter((r) => r.timeframe === tf);
                if (recs.length === 0) return null;
                return (
                  <AccordionItem key={tf} value={tf} className="border-line">
                    <AccordionTrigger className="font-display text-sm font-semibold hover:no-underline">
                      {timeframeLabel(tf)}
                      <span className="text-xs font-normal text-ink-muted">
                        {" "}{recs.length} action{recs.length > 1 ? "s" : ""}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="space-y-4">
                        {recs.map((r) => (
                          <li key={r.recommendationId} className="rounded-lg bg-paper-muted/60 p-4 text-sm">
                            <p className="font-semibold">{r.title}</p>
                            <p className="mt-1 leading-relaxed text-ink-muted">{r.action}</p>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No timeframe-specific actions were triggered by your answers. The
              general guidance above still applies.
            </p>
          )}
        </section>

        {/* ---------- Invite someone (immediately after the 90-day plan) ---------- */}
        <div className="fade-up rounded-xl border border-line bg-paper-raised p-5">
          <InviteTeamBox
            sessionId={results.sessionId}
            organisationName={results.companyName ?? "your organisation"}
            shortCode={results.shortCode ?? null}
          />
        </div>

        {/* ---------- COM-001: pathway conversion hierarchy ---------- */}
        {results.pathwayResult && (
          <PathwayConversionSection
            sessionId={results.sessionId}
            pathway={results.pathwayResult}
          />
        )}

      </div>
    </PulseLayout>
  );
}

