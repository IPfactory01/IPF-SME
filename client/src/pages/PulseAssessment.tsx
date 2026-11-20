/**
 * /pulse/assessment — anonymous 24-question wizard (PRD §7.2–7.3).
 *
 * One question per screen, section headers, progress across the whole
 * assessment, "I don't know" handling, auto-advance on selection, draft
 * auto-save after every answer, resume within the 24h window, and a clear
 * restart path when the draft has expired. Keyboard accessible (arrow keys
 * to navigate options, number keys 1–4, Enter to confirm).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "wouter";
import PulseLayout from "@/components/pulse/PulseLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, HelpCircle, RotateCcw, Timer, CircleHelp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
type QuestionGuidanceResolved = {
  plainLanguage: string;
  example: string;
  /** Staff-size framing clause; empty when no industry match applied. */
  sizeFraming?: string;
  isPersonalised?: boolean;
};

type Question = {
  question_id: string;
  section: string;
  text: string;
  help_text: string;
  guidance: QuestionGuidanceResolved | null;
  required: boolean;
  display_order: number;
  options: { option_id: string; label: string; unknown_flag: boolean }[];
};

type SectionMeta = { key: string; title: string };

const SECTION_TITLES: Record<string, string> = {
  strategy: "Strategy & value",
  process: "Process & workflow",
  data: "Data readiness",
  technology: "Technology & security",
  people: "People & adoption",
  governance: "Governance & responsible AI",
  opportunity: "Opportunity",
};

function formatExpiry(draftExpiry: string | Date | undefined): string {
  if (!draftExpiry) return "";
  return new Date(draftExpiry).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PulseAssessment() {
  const [searchParams] = useSearchParams();
  const sessionIdFromUrl = searchParams.get("session") ?? "";
  const [, navigate] = useLocation();

  // Session token stored by /pulse entry screen; falls back to URL param.
  const sessionId = useMemo(() => {
    const stored = sessionStorage.getItem("pulse.sessionId") ?? "";
    return sessionIdFromUrl || stored;
  }, [sessionIdFromUrl]);
  // Phase 4: distinguish a brand-new session (created moments ago on the
  // start page, passed via URL) from a genuine saved draft. The resume hint
  // must never fire for a fresh session — only when the respondent returns
  // to a draft from an earlier visit. "pulse.assessmentStarted" is set by
  // PulseStart on createSession success and cleared by PulseResults.
  const startedThisVisit = useMemo(() => {
    if (!sessionIdFromUrl) return false;
    return Boolean(sessionStorage.getItem("pulse.assessmentStarted"));
  }, [sessionIdFromUrl]);

  const versionQuery = trpc.pulse.getActiveVersion.useQuery(
    // The active version is rendered with persona-tailored guidance for this
    // respondent's industry and staff size (server-side resolution). The
    // generic build renders for every respondent when no session exists yet.
    sessionId ? { sessionId } : undefined,
  );
  const sessionQuery = trpc.pulse.getSession.useQuery(
    { sessionId },
    { enabled: Boolean(sessionId) && !versionQuery.isLoading, staleTime: 30_000 },
  );

  const saveDraft = trpc.pulse.saveDraft.useMutation();
  // Mark that the respondent has completed the Pulse in this tab so a later
  // visit (e.g. reopening the tab) does not treat the finished session as a
  // draft needing a "resume" prompt.
  const markFinished = useCallback((sid: string) => {
    sessionStorage.setItem("pulse.sessionId", sid);
    sessionStorage.setItem("pulse.assessmentFinished", "1");
  }, []);
  // DEF-001 (Mark One QA): a failed submission must never navigate — the
  // respondent stays on the last answered question with a clear error and
  // can retry. Blind navigation on failure was the class of defect the
  // audit traced to the manus.im off-site landing (stale session + failed
  // navigate).
  const submit = trpc.pulse.submitAssessment.useMutation({
    onSuccess: (data) => {
      markFinished(data.sessionId);
      navigate(`/pulse/results/${encodeURIComponent(data.sessionId)}`);
    },
    onError: (e) => {
      advanceDuring.current = false;
      toast.error(`Submission could not be completed: ${e.message}`);
    },
  });
  const restart = trpc.pulse.restartExpiredSession.useMutation({
    onSuccess: (data) => {
      sessionStorage.removeItem("pulse.assessmentFinished");
      sessionStorage.setItem("pulse.sessionId", data.newSessionId);
      toast.success("Fresh session started — your business details are kept.");
      navigate(`/pulse/assessment?session=${encodeURIComponent(data.newSessionId)}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const questions = versionQuery.data?.questions ?? [];
  // Phase 4 user review: finish ALL questions in one section before moving
  // to the next section, using the section_order declared in the active
  // method config. Within a section, questions keep display_order.
  const ordered = useMemo(() => {
    const sectionOrder = (versionQuery.data?.section_order ?? []) as string[];
    const orderIndex = new Map<string, number>(sectionOrder.map((s, i) => [s, i]));
    return [...questions].sort((a, b) => {
      const ai = orderIndex.has(a.section) ? (orderIndex.get(a.section) ?? 0) : 999;
      const bi = orderIndex.has(b.section) ? (orderIndex.get(b.section) ?? 0) : 999;
      if (ai !== bi) return ai - bi;
      return a.display_order - b.display_order;
    });
  }, [questions, versionQuery.data]);

  // Rules of hooks: every hook must run on every render, even when the
  // guards below (loading / error / expired / completed) return early.
  const sectionKeys = useMemo(() => (versionQuery.data?.section_order ?? []) as string[], [versionQuery.data]);

  // ---- Index state -----------------------------------------------------
  const [index, setIndex] = useState(0);
  // This state must remain above every loading/error guard. The wizard first
  // renders while its queries are loading, then re-renders with session data;
  // keeping it here preserves React's hook order across that transition.
  // "next" slides the incoming question in from the right, "prev" from left.
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");
  const current = ordered[index];

  // Restore position when a draft resumes.
  useEffect(() => {
    if (!sessionQuery.data || ordered.length === 0) return;
    const answered = new Set(sessionQuery.data.answers.map((a) => a.questionId));
    const firstUnanswered = ordered.findIndex((q) => !answered.has(q.question_id));
    setIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionQuery.data?.answers?.length, ordered.length]);

  // Clean up any pending save timer on unmount.
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  // ---- Answers store (ref-backed) ------------------------------------------
  // A single ref is the source of truth for answers so fast consecutive
  // selections (click option, click Next, click next option) never lose
  // entries through stale render closures. `version` forces re-renders.
  type AnswerEntry = { selectedOptionId: string | null; isUnknown: boolean };
  const [version, setVersion] = useState(0);
  const answersRef = useRef(new Map<string, AnswerEntry>());
  const saveTimer = useRef<number | undefined>(undefined);
  const draftPending = useRef(false);
  // DEF-003/006 (Mark One QA): transitions are serialised. While a
  // selection is being persisted and the screen is changing, option
  // targets are disabled so a click cannot land on the NEXT question's
  // option list (wrong-answer misfires) and the pending draft can never
  // be written with the PREVIOUS question's state (lag-1 persistence).
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef<number | undefined>(undefined);
  const advanceDuring = useRef(false);

  // Seed the store from a resumed draft when the session query lands.
  const seededFrom = useRef<string | null>(null);
  const resumeAnswers = sessionQuery.data?.answers;
  if (resumeAnswers && seededFrom.current !== sessionId) {
    const map = new Map<string, AnswerEntry>();
    resumeAnswers.forEach((a) => map.set(a.questionId, { selectedOptionId: a.selectedOptionId, isUnknown: a.isUnknown }));
    answersRef.current = map;
    seededFrom.current = sessionId;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const answers = useMemo(() => {
    void version;
    return answersRef.current;
  }, [version]);

  // Synchronous (promise-returning) draft flush used whenever the wizard
  // needs to guarantee the persisted draft matches the visible state
  // before moving on (DEF-006 lag-1 fix). `saveDraft.mutateAsync` is
  // awaited inside the guarded async paths below.
  const flushDraftSync = useCallback((): Promise<boolean> => {
    draftPending.current = false;
    return saveDraft
      .mutateAsync({
        sessionId,
        answers: Array.from(answersRef.current.entries()).map(([questionId, a]) => ({
          questionId,
          selectedOptionId: a.selectedOptionId,
          isUnknown: a.isUnknown,
        })),
      })
      .then(() => true)
      .catch((e: unknown) => { throw e; });
  }, [saveDraft, sessionId]);

  const flushDraft = useCallback(
    (map: Map<string, AnswerEntry>) => {
      saveDraft.mutate({
        sessionId,
        answers: Array.from(map.entries()).map(([questionId, a]) => ({
          questionId,
          selectedOptionId: a.selectedOptionId,
          isUnknown: a.isUnknown,
        })),
      });
    },
    [saveDraft, sessionId],
  );

  const setAnswer = useCallback(
    (questionId: string, optionId: string | null, isUnknown: boolean) => {
      // DEF-003: while a transition is in flight, ignore new option clicks
      // so they cannot misfire onto the next question's option list.
      if (locked || advanceDuring.current) return;
      const next = new Map(answersRef.current);
      if (optionId === null) next.delete(questionId);
      else next.set(questionId, { selectedOptionId: optionId, isUnknown });
      answersRef.current = next;
      setVersion((v) => v + 1);
      // DEF-006: persist IMMEDIATELY (fire-and-forget) instead of the old
      // 400 ms debounce, which could write the previous question's state
      // when the respondent advanced before the timer fired (lag-1).
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveDraft.mutate({
        sessionId,
        answers: Array.from(next.entries()).map(([qid, a]) => ({
          questionId: qid,
          selectedOptionId: a.selectedOptionId,
          isUnknown: a.isUnknown,
        })),
      });
      // Short disable window covers the 200 ms settle + render transition.
      if (lockTimer.current) window.clearTimeout(lockTimer.current);
      setLocked(true);
      lockTimer.current = window.setTimeout(() => setLocked(false), 250);
    },
    [locked, saveDraft, sessionId],
  );

  // ---- Section helpers --------------------------------------------------
  const sections = useMemo<SectionMeta[]>(() => {
    const seen = new Map<string, SectionMeta>();
    for (const q of ordered) {
      if (!seen.has(q.section)) seen.set(q.section, { key: q.section, title: SECTION_TITLES[q.section] ?? q.section });
    }
    return Array.from(seen.values());
  }, [ordered]);

  // Within-section auto-advance: the next step after answering is the next
  // unanswered question inside the same section; only when none remains do
  // we cross the section boundary. Used both on selection and by Next.
  // DEF-002/003: computed over the ref at call time — never over render
  // state — so rapid selections cannot skip or revisit questions.
  const jumpToNext = useCallback(() => {
    const cur = ordered[index];
    if (!cur) return;
    setSlideDir("next");
    for (let i = index + 1; i < ordered.length; i++) {
      if (ordered[i].section === cur.section && !answersRef.current.has(ordered[i].question_id)) {
        setIndex(i);
        return;
      }
    }
    const sectionIdx = sectionKeys.indexOf(cur.section);
    if (sectionIdx >= 0 && sectionIdx < sectionKeys.length - 1) {
      const nextSection = sectionKeys[sectionIdx + 1];
      for (let i = index + 1; i < ordered.length; i++) {
        if (ordered[i].section === nextSection && !answersRef.current.has(ordered[i].question_id)) {
          setIndex(i);
          return;
        }
      }
    }
    // At the latest progress point — move forward one or show finish.
    setIndex((i) => Math.min(i + 1, ordered.length - 1));
  }, [ordered, index, sectionKeys]);

  // DEF-002 (Mark One QA): completion gate validates the PERSISTED (or
  // immediately-flushed) answer set, not the render-time map, and the
  // flush is awaited so the server always receives exactly what the
  // respondent saw on screen.
  const finish = async () => {
    if (locked || advanceDuring.current || submit.isPending || saveDraft.isPending) return;
    // Flush any in-flight draft synchronously so persisted = displayed.
    const ok = await flushDraftSync();
    if (!ok) {
      toast.error("Your progress could not be saved — please try again.");
      return;
    }
    const map = answersRef.current;
    const remaining = ordered.filter((q) => !map.has(q.question_id) && q.required);
    if (remaining.length > 0) {
      toast.error(`Please answer the remaining ${remaining.length} required question${remaining.length > 1 ? "s" : ""} before finishing.`);
      const missing = ordered.findIndex((q) => remaining.includes(q));
      if (missing >= 0) setIndex(missing);
      return;
    }
    submit.mutate({
      sessionId,
      answers: ordered.map((q) => {
        const a = map.get(q.question_id);
        return {
          questionId: q.question_id,
          selectedOptionId: a?.selectedOptionId ?? null,
          isUnknown: a?.isUnknown ?? false,
        };
      }),
    });
  };

  const total = ordered.length;
  const answeredCount = answersRef.current.size;
  const progressPct = Math.round((answeredCount / total) * 100);
  const currentSectionIdx = sections.findIndex((s) => s.key === current?.section);

  // ---- Keyboard navigation ---------------------------------------------
  // Keyboard navigation uses refs so handlers never see stale answers.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setSlideDir("next");
        setIndex((i) => Math.min(i + 1, ordered.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setSlideDir("prev");
        setIndex((i) => Math.max(i - 1, 0));
      }
    },
    [ordered.length],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ---- Guards -----------------------------------------------------------
  const expired = sessionQuery.data?.expired === true || sessionQuery.data?.status === "expired";

  if (!sessionId || versionQuery.isLoading || sessionQuery.isLoading) {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <div className="h-10 w-10 animate-pulse rounded-full bg-brand-tint" />
          <p className="text-sm text-ink-muted">Preparing your assessment…</p>
        </div>
      </PulseLayout>
    );
  }

  if (versionQuery.error || sessionQuery.error) {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <p className="max-w-md text-sm text-ink-muted">
            {versionQuery.error?.message || sessionQuery.error?.message || "Something went wrong loading the assessment."}
          </p>
          <Button className="border-brand-line bg-paper-raised text-brand hover:bg-brand-tint" onClick={() => navigate("/pulse")} variant="outline">
            Start again
          </Button>
        </div>
      </PulseLayout>
    );
  }

  if (sessionQuery.data?.status === "expired") {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
          <Timer className="h-10 w-10 text-ink-muted" />
          <h1 className="font-display text-3xl font-semibold">Your saved session has expired</h1>
          <p className="max-w-md text-sm text-ink-muted leading-relaxed">
            Draft sessions are kept for 24 hours. We can start a fresh session
            using your business profile from before — no answers are carried
            over, but the setup is quick.
          </p>
          <Button className="bg-brand text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-muted"
            size="lg"
            disabled={restart.isPending}
            onClick={() => restart.mutate({ expiredSessionId: sessionId })}
          >
            {restart.isPending ? "Starting fresh session…" : (
              <>
                <RotateCcw className="mr-1 h-4 w-4" /> Start a fresh Pulse
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={() => navigate("/pulse")}>
            Back to the start
          </Button>
        </div>
      </PulseLayout>
    );
  }

  // Completed sessions are forwarded to results.
  if (sessionQuery.data?.status === "completed") {
    return (
      <PulseLayout>
        <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <Check className="h-10 w-10 text-brand" />
          <h1 className="font-display text-3xl font-semibold">Assessment complete</h1>
          <p className="max-w-md text-sm text-ink-muted">
            Your results are ready. Nothing is lost — you can view them again anytime with your session reference.
          </p>
          <Button className="bg-brand text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-muted" size="lg" onClick={() => navigate(`/pulse/results/${encodeURIComponent(sessionId)}`)}>
            View results
          </Button>
        </div>
      </PulseLayout>
    );
  }

  // ---- Wizard -------------------------------------------------------------
  const selected = answers.get(current?.question_id ?? "");
  // Phase 4: Next only while reviewing an earlier question (there is a later
  // answered question, or unanswered questions remain after the current one).
  // Auto-advance on selection replaces Next for the forward path.
  const answeredAfterCurrent = ordered
    .slice(index + 1)
    .some((q) => answersRef.current.has(q.question_id));
  const canNext = index < ordered.length - 1 && answeredAfterCurrent;
  const answeredBeforeCurrent = ordered
    .slice(0, index)
    .some((q) => answersRef.current.has(q.question_id));
  const canPrev = index > 0 && (answeredBeforeCurrent || Boolean(answersRef.current.has(current?.question_id ?? "")));
  const isSubmitting = submit.isPending || saveDraft.isPending;

  const jumpToPrev = () => {
    setSlideDir("prev");
    setIndex((i) => Math.max(i - 1, 0));
  };

  // NEW-001: advance-deferral — the wizard must not jump to the next question
  // until the just-selected answer is durably persisted (draft flushed to the
  // server). On flush failure the advance is cancelled, the lock is released,
  // and the selection remains visible so the user can retry.
  // NEW-001 fix: the lockout guard was previously raised BEFORE setAnswer ran,
  // so setAnswer's own DEF-003 guard (`locked || advanceDuring`) rejected every
  // selection — the answer was never written to the store and the 200 ms flush
  // then persisted an empty map, overwriting any good draft (dead-code path).
  // Order now: write + persist the answer FIRST (unlocked), THEN raise the flag
  // so the in-flight advance window blocks stray clicks, and release it once
  // the persisted round-trip completes.
  const onOptionSelected = (questionId: string, optionId: string, isUnknown: boolean) => {
    if (locked || advanceDuring.current) return; // DEF-003 lockout
    setAnswer(questionId, optionId, isUnknown); // write + fire-and-forget persist
    advanceDuring.current = true;
    // Auto-advance after the persisted draft round-trip, so the selection
    // ring is visible while the write is in flight.
    window.setTimeout(async () => {
      try {
        // Double-flush: the fire-and-forget save in setAnswer is normally enough,
        // but this flush guarantees persisted == visible before advancing and
        // cancels the advance if the write failed (NEW-001 advance-deferral).
        const ok = await flushDraftSync();
        advanceDuring.current = false;
        if (ok) {
          jumpToNext();
        } else {
          toast.error(
            "Your answer was registered locally but could not be saved yet. Please select it again so it is safely stored.",
          );
        }
      } catch {
        advanceDuring.current = false;
        toast.error(
          "Your answer could not be saved — please select it again so it is safely stored.",
        );
      }
    }, 200);
  };

  return (
    <PulseLayout>
      {/* ---------- Pinned tracker + question heading — one sticky block sitting flush directly beneath
            the page header on all viewports. Kept OUTSIDE the padded container below so the container's
            top padding can never push it away from the header chrome. Chrome height: nav h-14 (56px) +
            no privacy strip in The Shift → top-[64px]. Everything below (guidance, example, options,
            nav) scrolls naturally in the flow. ---------- */}
      <div className="sticky top-[64px] z-30 border-b border-line/70 bg-paper-raised/95">
        <div className="container max-w-3xl px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between text-xs font-medium text-ink-muted">
            <span>
              Question {Math.min(index + 1, total)} of {total}
              {current ? ` · ${current.section === "opportunity" ? SECTION_TITLES.opportunity : SECTION_TITLES[current.section] ?? current.section}` : ""}
            </span>
            <span>{answeredCount} answered</span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
          {/* Section stepper — single scrollable row on mobile so the pinned block stays compact, full row on desktop */}
          <nav
            className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:overflow-visible"
            aria-label="Assessment sections"
          >
            {sections.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  const at = ordered.findIndex((q) => q.section === s.key);
                  if (at >= 0) {
                    setSlideDir(at > index ? "next" : "prev");
                    setIndex(at);
                  }
                }}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors sm:shrink ${
                  i === currentSectionIdx
                    ? "bg-brand-deep text-white"
                    : "bg-paper-muted text-ink-soft hover:bg-brand-tint"
                }`}
              >
                {s.title}
              </button>
            ))}
          </nav>
          {/* Question heading — pinned inside the same flush block, directly beneath the tracker */}
          {current && (
            <div className="border-t border-line/60 pb-4 pt-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                {SECTION_TITLES[current.section] ?? current.section}
              </p>
              <h2 className="font-display mt-1.5 text-xl font-semibold leading-snug sm:text-[26px]">
                {current.text}
              </h2>
              {current.help_text && (
                <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink-muted">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {current.help_text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Question card (in-flow, scrollable) ---------- */}
      <div className="container max-w-3xl px-4 sm:px-6">
        {current && (
          <div className="space-y-6 pb-10">
            {/* In-flow content: accent strip, guidance and example scroll with the options */}
            <div
              key={current.question_id}
              className={`fade-up ${slideDir === "next" ? "slide-next" : "slide-prev"}`}
            >
              {current.guidance && (
                <div className="rounded-xl border border-brand-line bg-brand-tint-softest p-4 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-brand">
                    <BookOpen className="h-4 w-4" /> In plain terms
                  </p>
                  <p className="mt-1.5 leading-relaxed text-ink/85">
                    {current.guidance.plainLanguage}
                  </p>
                  {current.guidance.sizeFraming && (
                    <p className="mt-2 rounded-lg border-l-2 border-highlight bg-white/80 px-3 py-2 text-xs leading-relaxed text-ink-muted">
                      {current.guidance.sizeFraming}
                    </p>
                  )}
                  <details className="mt-3 rounded-lg bg-white/80 px-3 py-2.5 text-xs text-ink-muted">
                    <summary className="cursor-pointer font-semibold text-brand marker:text-highlight">
                      See an example
                    </summary>
                    <p className="mt-2 leading-relaxed">{current.guidance.example}</p>
                  </details>
                </div>
              )}
            </div>

            <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
              {current.options.map((opt, oi) => {
                const isSelected = selected?.selectedOptionId === opt.option_id;
                return (
                  <button
                    key={opt.option_id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onOptionSelected(current.question_id, opt.option_id, opt.unknown_flag === true)}
                    disabled={locked || advanceDuring.current}
                    className={`w-full rounded-lg border px-4 py-3.5 text-left text-sm transition-[transform,opacity,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                      isSelected
                        ? "scale-[1.01] border-brand bg-brand-tint-soft font-semibold shadow-md ring-2 ring-highlight/60"
                        : selected
                          ? "border-line/80 bg-paper-raised/80 opacity-70"
                          : "border-line bg-paper-raised hover:border-brand hover:bg-brand-tint/50"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {opt.unknown_flag ? (
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-ink-muted ${
                            isSelected ? "border-highlight bg-highlight text-white" : "border-dashed border-ink-muted/60"
                          }`}
                        >
                          {isSelected ? <Check className="h-3 w-3" /> : <CircleHelp className="h-3.5 w-3.5" />}
                        </span>
                      ) : (
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors ${
                            isSelected
                              ? "border-highlight bg-highlight text-white"
                              : "border-line text-ink-muted"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                          {!isSelected && oi + 1}
                        </span>
                      )}
                      {opt.unknown_flag ? (
                        <span className="inline-flex items-center gap-1.5 text-ink-muted">
                          <CircleHelp className="h-4 w-4" /> {opt.label}
                        </span>
                      ) : (
                        opt.label
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* ---------- Nav ---------- */}
            <div className="flex items-center justify-between border-t pt-5 border-line">
              <Button
                type="button"
                variant="outline"
                className="border-brand-line bg-paper-raised text-brand hover:bg-brand-tint"
                disabled={!canPrev}
                onClick={() => jumpToPrev()}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              {canNext ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-brand-line bg-paper-raised text-brand hover:bg-brand-tint"
                  onClick={() => jumpToNext()}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button className="bg-brand text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-muted"
                  type="button"
                  size="lg"
                  disabled={isSubmitting || answeredCount === 0}
                  onClick={finish}
                >
                                {submit.isPending ? "Calculating…" : (
                    <>
                      See my results <ArrowRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="text-center text-[11px] text-ink-muted">
              Progress saves automatically · Draft kept for 24 hours{sessionQuery.data?.draftExpiry ? ` (until ${formatExpiry(sessionQuery.data.draftExpiry)})` : ""} · Selecting an answer moves you forward — use ← to review previous questions
            </p>
          </div>
        )}
      </div>
      {/* Fallback if no question is active */}
      {!current && (
        <div className="container flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-ink-muted">Loading question…</p>
        </div>
      )}

      {/* Resume confirmation dialog — offered once when returning to a draft */}
      <ResumeHintDialog
        resumeAvailable={
          sessionQuery.data?.status === "draft" && answeredCount > 0 && !startedThisVisit
        }
      />
    </PulseLayout>
  );
}

/**
 * Small hint that a draft is available; rendered once per visit. It never
 * fires for a brand-new session (startedThisVisit) — the start page sets
 * "pulse.assessmentStarted" immediately after creating the session, and
 * PulseResults clears it. This prevents the wrong "you previously completed
 * a Pulse" message the user saw right after answering the first question.
 */
function ResumeHintDialog({
  resumeAvailable,
}: {
  resumeAvailable: boolean;
}) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!resumeAvailable) return;
    if (sessionStorage.getItem("pulse.resumeHintShown")) return;
    sessionStorage.setItem("pulse.resumeHintShown", "1");
    setSeen(true);
  }, [resumeAvailable]);
  return (
    <AlertDialog open={seen} onOpenChange={setSeen}>
      <AlertDialogContent className="border-line bg-paper-raised text-ink">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Welcome back</AlertDialogTitle>
          <AlertDialogDescription>
            You started this Pulse on an earlier visit. Your answers are saved, so you can carry on where you stopped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-brand-line bg-paper-raised text-brand hover:bg-brand-tint">Start fresh</AlertDialogCancel>
          <AlertDialogAction className="bg-brand text-white hover:bg-brand-deep">Continue my draft</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
