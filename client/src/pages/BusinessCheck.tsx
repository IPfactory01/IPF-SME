/**
 * The free business check. One question per screen, grouped under broad headers: the business
 * profile, founder readiness, then the problem areas that apply to this owner. Each answer determines
 * what comes next (shared/businessCheck/engine.ts). Every area opens with what it means and an
 * example for the kind of business the owner described. The result is written on the server.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { CAPABILITIES, offeringById } from "@shared/businessCheck/catalogue";
import {
  areasNotAssessed,
  businessDetails,
  businessOutline,
  cleanAnswers,
  exampleFor,
  exampleHeading,
  isAnswered,
  nextStep,
  NOT_ASSESSED_NOTE,
  optionsFor,
  placeholderFor,
  promptFor,
  questionPath,
  sectionPath,
  type Step,
} from "@shared/businessCheck/engine";
import { AREA_NAMES, GAP_LABELS, SECTIONS, stageOf, type Answers, type Health, type Question, type SectionId } from "@shared/businessCheck/questions";
import { FULL_REPORT, formatNaira, PRICES, PROMISE } from "@shared/businessSupport";
import { bookingTarget, calendlyEventUri, isCalendlyBooking } from "@shared/booking";
import { describeFounder, STRENGTH_LABELS, type Strength } from "@shared/businessCheck/founderNarrative";
import { cleanNationalNumber, DEFAULT_COUNTRY, phoneProblem, toInternational } from "@shared/phone";
import PhoneField from "@/components/PhoneField";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Check, CheckCircle2, Clock3, FileText, Lightbulb, LockKeyhole, Mail, PencilLine, RotateCcw, type LucideIcon } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { EASE } from "@/components/motion";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type Variants } from "framer-motion";
import { Link } from "wouter";
import type { BusinessCheckResponse } from "../../../server/routers/businessCheck";

const STORAGE_KEY = "ipf-business-check-v1";

/** The owner, asked first. Everything about the business is asked inside the check. */
/** `whatsapp` is the national number as typed (no leading 0); `whatsappCountry` its ISO country. Sent in +234… form. */
type Contact = { fullName: string; email: string; whatsapp: string; whatsappCountry: string; heardFrom: string };
/** token: the saved check on the server, created when the details are given. */
type Saved = { started: boolean; token?: string; answers: Answers; seen: SectionId[]; history: string[]; contact: Contact; response?: BusinessCheckResponse };

const EMPTY_CONTACT: Contact = { fullName: "", email: "", whatsapp: "", whatsappCountry: DEFAULT_COUNTRY, heardFrom: "" };
const SAVE_DELAY_MS = 800;
const FRESH: Saved = { started: false, answers: {}, seen: [], history: [], contact: EMPTY_CONTACT };

const HEARD_FROM = ["A friend or business owner", "A past JUMP participant", "LinkedIn", "Instagram or Facebook", "WhatsApp", "An event", "Somewhere else"];

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return FRESH;
    const saved = { ...FRESH, ...JSON.parse(raw) } as Saved;
    const contact = { ...EMPTY_CONTACT, ...saved.contact };
    // Saved before the country picker existed: the number was free text, possibly "+234…" or "0803…".
    if (!saved.contact?.whatsappCountry && contact.whatsapp) {
      const { iso, national } = cleanNationalNumber(DEFAULT_COUNTRY, contact.whatsapp);
      Object.assign(contact, { whatsapp: national, whatsappCountry: iso });
    }
    return { ...saved, contact };
  } catch {
    return FRESH;
  }
}

function save(state: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the check still works, it just won't resume.
  }
}

/** Screens slide in from the side the owner is moving towards. */
const screenMotion: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 48 }),
  centre: { opacity: 1, x: 0, transition: { duration: 0.42, ease: EASE } },
  leave: (direction: number) => ({ opacity: 0, x: direction * -48, transition: { duration: 0.22, ease: "easeIn" } }),
};

const listMotion: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } };
const itemMotion: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

/** Founder readiness strengths use the outline's colours: strong is green, building amber, gap red. */
const STRENGTH_HEALTH: Record<Strength, Health> = { strong: "clear", building: "watch", gap: "stuck" };

const HEALTH_STYLE: Record<Health | "pending", { dot: string; row: string; label: string }> = {
  clear: { dot: "bg-health-clear", row: "border-health-clear/40 bg-health-clear-tint text-health-clear", label: "Clear" },
  watch: { dot: "bg-health-watch", row: "border-health-watch/40 bg-health-watch-tint text-health-watch", label: "Watch" },
  stuck: { dot: "bg-health-stuck", row: "border-health-stuck/40 bg-health-stuck-tint text-health-stuck", label: "Stuck" },
  pending: { dot: "bg-line-strong", row: "border-line bg-paper-raised text-ink-faint", label: "To come" },
};

export default function BusinessCheck() {
  const [state, setState] = useState<Saved>(load);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState(1);
  const update = (patch: Partial<Saved>) => setState((current) => ({ ...current, ...patch }));

  // Effects must return nothing: some hosts (the claude.ai preview frame) make scrollTo return a value.
  useEffect(() => {
    save(state);
  }, [state]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [editing, state.history.length, state.seen.length, state.started, state.response]);

  const answers = useMemo(() => cleanAnswers(state.answers), [state.answers]);
  const path = useMemo(() => questionPath(answers), [answers]);
  const step: Step | null = editing ? path.find((item) => item.question.id === editing) ?? null : nextStep(answers);

  const start = trpc.businessCheck.start.useMutation({
    onSuccess: ({ token }) => {
      setError("");
      setDirection(1);
      update({ token });
    },
    onError: (err) => setError(err.message || "We could not start your Business Check. Kindly try again."),
  });
  const saveProgress = trpc.businessCheck.saveProgress.useMutation();
  const submit = trpc.businessCheck.submit.useMutation({
    onSuccess: (response) => update({ response }),
    onError: (err) => setError(err.message || "We could not send your answers. Kindly try again."),
  });

  // Answers are saved to the server shortly after each change, so an unfinished check is still a lead.
  const savedAnswers = useRef("");
  useEffect(() => {
    const serialised = JSON.stringify(answers);
    if (!state.token || state.response || serialised === savedAnswers.current) return undefined;
    const timer = window.setTimeout(() => {
      savedAnswers.current = serialised;
      saveProgress.mutate({ token: state.token!, answers });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answers, state.token, state.response]); // eslint-disable-line react-hooks/exhaustive-deps

  // After the last question the check is sent once; a retry is offered if it fails.
  const finished = Boolean(state.started && state.token && !state.response && !step);
  const submittedFor = useRef("");
  useEffect(() => {
    const key = `${state.token}:${JSON.stringify(answers)}`;
    if (!finished || submittedFor.current === key) return;
    submittedFor.current = key;
    setError("");
    submit.mutate({ token: state.token!, answers });
  }, [finished, answers, state.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const retrySubmit = () => {
    setError("");
    submit.mutate({ token: state.token!, answers });
  };

  const restart = () => {
    setEditing(null);
    setError("");
    submit.reset();
    savedAnswers.current = "";
    submittedFor.current = "";
    // The owner's details are kept for convenience; a new check gets a new record.
    setState({ ...FRESH, started: true, contact: state.contact });
  };

  const answer = (question: Question, value: string | string[], advance = true) => {
    const at = state.history.indexOf(question.id);
    const history = at >= 0 ? state.history.slice(0, at) : state.history;
    update({ answers: { ...state.answers, [question.id]: value }, history: advance ? [...history, question.id] : state.history });
    if (advance) {
      setDirection(1);
      setEditing(null);
    }
  };

  const back = () => {
    setDirection(-1);
    const previous = state.history[state.history.length - 1];
    if (!previous) {
      update({ started: false });
      return;
    }
    update({ history: state.history.slice(0, -1) });
    setEditing(previous);
  };

  let screen: React.ReactNode;
  let screenKey: string;
  if (state.response) {
    screenKey = "result";
    screen = <Result response={state.response} contact={state.contact} answers={answers} businessName={businessDetails(answers).businessName} onRestart={restart} />;
  } else if (!state.started) {
    screenKey = "intro";
    screen = <Intro hasProgress={state.history.length > 0} onStart={() => update({ started: true })} onRestart={restart} />;
  } else if (!state.token) {
    screenKey = "details";
    screen = (
      <DetailsScreen
        contact={state.contact}
        pending={start.isPending}
        error={error}
        onChange={(contact) => update({ contact })}
        onBack={() => { setDirection(-1); update({ started: false }); }}
        onSubmit={() => {
          setError("");
          const { fullName, email, whatsapp, whatsappCountry, heardFrom } = state.contact;
          start.mutate({ fullName: fullName.trim(), email: email.trim(), whatsapp: toInternational(whatsappCountry, whatsapp) || undefined, heardFrom: heardFrom || undefined });
        }}
      />
    );
  } else if (step && !state.seen.includes(step.section.id)) {
    screenKey = `section-${step.section.id}`;
    screen = <SectionIntro step={step} answers={answers} onContinue={() => { setDirection(1); update({ seen: [...state.seen, step.section.id] }); }} onBack={back} />;
  } else if (step) {
    screenKey = `question-${step.question.id}`;
    screen = step.question.kind === "text"
      ? <TextQuestionScreen key={step.question.id} step={step} answers={answers} onAnswer={answer} onBack={back} />
      : <QuestionScreen key={step.question.id} step={step} answers={answers} onAnswer={answer} onBack={back} />;
  } else {
    screenKey = "finishing";
    screen = submit.isError ? <SubmitFailed error={error} onRetry={retrySubmit} onBack={back} /> : <Reading />;
  }

  const showOutline = state.started && state.token && !state.response && stageOf(answers);

  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col">
      <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3" aria-label={`${BRAND.organisationName} home`}>
            <img src={BRAND.markUrl} alt={BRAND.organisationName} className="h-9 w-auto" />
            <span className="border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">Business Check</span>
          </Link>
          <Link href="/" className="text-xs font-semibold uppercase tracking-wider text-brand hover:text-brand-deep">Back to site</Link>
        </div>
        {showOutline && (
          <SectionRail
            answers={answers}
            current={step?.section.id}
            onChangeStage={step?.question.id === "p_stage" ? undefined : () => { setDirection(-1); setEditing("p_stage"); }}
          />
        )}
      </header>

      <main className="flex-1 py-8 md:py-12">
        <div className={`container ${showOutline ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] max-w-6xl" : "max-w-3xl"} mx-auto`}>
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={screenKey}
                custom={direction}
                variants={screenMotion}
                initial="enter"
                animate="centre"
                exit="leave"
              >
                {screen}
              </motion.div>
            </AnimatePresence>
          </div>
          {showOutline && <OutlinePanel answers={answers} />}
        </div>
      </main>
    </div>
  );
}

/** The broad headers along the top: where the owner is in the check. */
const STAGE_LABELS: Record<string, string> = { operating: "Full-time business", side: "Side business", idea: "Idea, not started" };
const AGE_LABELS: Record<string, string> = { under2: "under 2 years", "2to5": "2 to 5 years", "5to10": "5 to 10 years", over10: "over 10 years" };

function SectionRail({ answers, current, onChangeStage }: { answers: Answers; current?: SectionId; onChangeStage?: () => void }) {
  const stage = stageOf(answers);
  const age = typeof answers.p_age === "string" ? AGE_LABELS[answers.p_age] : undefined;
  const sections = sectionPath(answers);
  const path = questionPath(answers);
  const done = path.filter((item) => isAnswered(item.question, answers)).length;
  const currentIndex = current ? sections.indexOf(current) : sections.length;
  const sectionDone = current ? path.filter((item) => item.section.id === current && isAnswered(item.question, answers)).length : 0;
  const sectionTotal = current ? path.filter((item) => item.section.id === current).length : 1;
  return (
    <div className="border-t border-line bg-paper-raised">
      <div className="container py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          {sections.map((id, index) => (
            <motion.span key={id} layout className="relative h-1 flex-1 overflow-hidden rounded-full bg-line" transition={{ duration: 0.4, ease: EASE }}>
              <motion.span
                className={`absolute inset-0 origin-left rounded-full ${index < currentIndex ? "bg-brand" : "bg-highlight"}`}
                initial={false}
                animate={{ scaleX: index < currentIndex ? 1 : index === currentIndex ? Math.max(0.08, sectionDone / sectionTotal) : 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </motion.span>
          ))}
        </div>
        <p className="mt-2 flex justify-between gap-4 text-[11px] uppercase tracking-wider text-ink-muted">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={current ?? "details"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="truncate font-semibold text-brand">
              {current ? SECTIONS[current].title : "Your details"}
            </motion.span>
          </AnimatePresence>
          <span className="flex shrink-0 items-center gap-3">
            {stage && onChangeStage && (
              <button type="button" onClick={onChangeStage} className="group hidden items-center gap-1.5 border border-brand-line bg-brand-tint px-2 py-0.5 normal-case tracking-normal text-brand transition-colors hover:border-brand sm:inline-flex" title="Change where you are">
                {STAGE_LABELS[stage]}{age ? `, ${age}` : ""}
                <PencilLine className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <span className="tabular-nums">{done} of {path.length} answered</span>
          </span>
        </p>
        {stage && onChangeStage && (
          <button type="button" onClick={onChangeStage} className="mt-2 inline-flex items-center gap-1.5 border border-brand-line bg-brand-tint px-2 py-0.5 text-[11px] text-brand sm:hidden">
            {STAGE_LABELS[stage]}{age ? `, ${age}` : ""} <PencilLine className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function Intro({ hasProgress, onStart, onRestart }: { hasProgress: boolean; onStart: () => void; onRestart: () => void }) {
  return (
    <motion.div className="space-y-10" variants={listMotion} initial="hidden" animate="show">
      <motion.div variants={itemMotion}>
        <h1 className="font-serif text-4xl font-black leading-[1.08] sm:text-6xl">
          {PROMISE[0]} {PROMISE[1]} <span className="font-normal italic">{PROMISE[2]}</span>
        </h1>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-highlight-ink">The free Business Check</p>
        <p className="mt-6 text-lg leading-relaxed text-ink-600">
          Some owners know exactly what is wrong. Many can only feel it: busy every day, money in and out, and no clear picture of why it isn't working. This check is for both.
        </p>
        <p className="mt-4 font-serif text-lg italic leading-relaxed text-ink-soft">
          It starts with you, the founder, then walks through the parts of the business that apply to you. Each answer determines the next question, so you only see what is relevant. At the end you get a short read: what we found, what we think the real problem is, and where to start.
        </p>
      </motion.div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { title: "Your business", body: "Stage, size and how you make money." },
          { title: "Founder readiness", body: "How you lead, what you know, the time you have." },
          { title: "The areas that apply", body: "From strategic intent to financials, chosen by your answers." },
        ].map((item, index) => (
          <motion.li key={item.title} variants={itemMotion} whileHover={{ y: -4 }} className="border border-line bg-paper-raised p-5 transition-shadow hover:shadow-lg">
            <span className="font-serif text-2xl font-black text-highlight-ink">{index + 1}</span>
            <p className="mt-2 font-semibold">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.body}</p>
          </motion.li>
        ))}
      </ol>

      <motion.div variants={itemMotion} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <PrimaryButton onClick={onStart} large>{hasProgress ? "Continue where you left off" : "Take the Business Check"}</PrimaryButton>
        {hasProgress && (
          <button type="button" onClick={onRestart} className="text-sm font-semibold text-brand underline underline-offset-4">Start again</button>
        )}
        <p className="text-sm text-ink-muted">About ten minutes. Free. Ranges are fine.</p>
      </motion.div>

      <motion.p variants={itemMotion} className="flex items-start gap-3 border border-brand-line bg-brand-tint p-4 text-xs leading-relaxed text-brand">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your answers are private to {BRAND.organisationName}. Progress is kept on this device until you send it, so you can stop and come back.</span>
      </motion.p>
    </motion.div>
  );
}

function SectionIntro({ step, answers, onContinue, onBack }: { step: Step; answers: Answers; onContinue: () => void; onBack: () => void }) {
  const { section } = step;
  const example = exampleFor(section, answers);
  const count = questionPath(answers).filter((item) => item.section.id === section.id).length;
  useKeys((key) => {
    if (key === "Enter") onContinue();
  });
  return (
    <motion.div className="space-y-8" variants={listMotion} initial="hidden" animate="show">
      <motion.div variants={itemMotion}>
        <p className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">
          {section.area !== undefined && (
            <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }} className="flex h-8 w-8 items-center justify-center rounded-full bg-highlight-ink font-serif text-sm text-paper">
              {section.area}
            </motion.span>
          )}
          {section.area === undefined ? "To begin" : "Of ten areas"}
        </p>
        <h2 className="font-serif text-3xl font-black leading-tight sm:text-5xl">{section.title}</h2>
      </motion.div>
      <motion.div variants={itemMotion} className="relative pl-5">
        <motion.span aria-hidden className="absolute inset-y-0 left-0 w-1 origin-top bg-brand" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, ease: EASE, delay: 0.2 }} />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">What this means</p>
        <p className="mt-2 text-lg leading-relaxed text-ink-700">{section.means}</p>
      </motion.div>
      {example && (
        <motion.div variants={itemMotion} className="border border-line bg-paper-raised p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{exampleHeading(section, answers)}</p>
          <p className="mt-2 font-serif text-lg italic leading-relaxed text-ink-soft">{example}</p>
        </motion.div>
      )}
      <motion.div variants={itemMotion} className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={onContinue}>{count === 1 ? "One question" : `${count} questions`}</PrimaryButton>
      </motion.div>
    </motion.div>
  );
}

/** Keyboard shortcuts for the current screen: number keys pick options, Enter continues. */
function useKeys(handler: (key: string) => void) {
  const ref = React.useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      ref.current(event.key);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

/** A short typed answer, such as the business's name. Optional ones can be skipped. */
function TextQuestionScreen({ step, answers, onAnswer, onBack }: { step: Step; answers: Answers; onAnswer: (question: Question, value: string) => void; onBack: () => void }) {
  const { question, section } = step;
  const [value, setValue] = useState(typeof answers[question.id] === "string" ? (answers[question.id] as string) : "");
  const trimmed = value.trim();
  return (
    <motion.form className="space-y-7" variants={listMotion} initial="hidden" animate="show" onSubmit={(event) => { event.preventDefault(); if (trimmed || question.optional) onAnswer(question, trimmed); }}>
      <motion.div variants={itemMotion}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">{section.title}</p>
        <h2 className="font-serif text-2xl font-bold leading-snug sm:text-3xl">{promptFor(question, answers)}</h2>
        {question.help && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{question.help}</p>}
      </motion.div>
      <motion.div variants={itemMotion}>
        <Input
          autoFocus
          aria-label={promptFor(question, answers)}
          value={value}
          maxLength={question.maxLength}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholderFor(question, answers)}
          className="h-14 rounded-none text-base transition-shadow focus-visible:shadow-[0_0_0_4px_rgba(28,78,126,0.12)]"
        />
      </motion.div>
      <motion.div variants={itemMotion} className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <span className="flex items-center gap-5">
          {question.optional && (
            <button type="button" onClick={() => onAnswer(question, "")} className="text-sm font-semibold text-ink-muted underline underline-offset-4 hover:text-brand">Skip</button>
          )}
          <PrimaryButton type="submit" disabled={!trimmed}>Continue</PrimaryButton>
        </span>
      </motion.div>
    </motion.form>
  );
}

function QuestionScreen({ step, answers, onAnswer, onBack }: { step: Step; answers: Answers; onAnswer: (question: Question, value: string | string[], advance?: boolean) => void; onBack: () => void }) {
  const { question, section } = step;
  const options = optionsFor(question, answers);
  const current = answers[question.id];
  const [multi, setMulti] = useState<string[]>(Array.isArray(current) ? current : []);
  const [picked, setPicked] = useState<string | null>(null);

  const choose = (value: string) => {
    if (picked) return;
    setPicked(value);
    // A short pause so the owner sees their choice land before the next question.
    window.setTimeout(() => onAnswer(question, value), 320);
  };

  const toggle = (value: string) => {
    const option = options.find((item) => item.value === value);
    setMulti((selected) => {
      if (selected.includes(value)) return selected.filter((item) => item !== value);
      if (option?.exclusive) return [value];
      const exclusive = new Set(options.filter((item) => item.exclusive).map((item) => item.value));
      return [...selected.filter((item) => !exclusive.has(item)), value];
    });
  };

  useKeys((key) => {
    const index = Number(key) - 1;
    if (Number.isInteger(index) && index >= 0 && index < Math.min(options.length, 9)) {
      if (question.kind === "multi") toggle(options[index].value);
      else choose(options[index].value);
    } else if (key === "Enter" && question.kind === "multi" && multi.length) {
      onAnswer(question, multi);
    } else if (key === "Backspace" || key === "ArrowLeft") {
      onBack();
    }
  });

  const cards = question.display === "cards";
  const grid = cards ? "grid gap-3 md:grid-cols-3" : question.kind === "select" ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3" : "grid gap-2.5";

  return (
    <div className="space-y-7">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">{section.title}</p>
        <h2 className="font-serif text-2xl font-bold leading-snug sm:text-3xl">{promptFor(question, answers)}</h2>
        {question.help && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{question.help}</p>}
        {question.kind === "multi" && !question.help && <p className="mt-3 text-sm text-ink-muted">Choose all that apply.</p>}
      </div>

      <motion.div className={grid} variants={listMotion} initial="hidden" animate="show">
        {options.map((option, index) => {
          const on = question.kind === "multi" ? multi.includes(option.value) : (picked ?? current) === option.value;
          const dimmed = question.kind !== "multi" && picked !== null && !on;
          return (
            <motion.button
              key={option.value}
              type="button"
              variants={itemMotion}
              onClick={() => (question.kind === "multi" ? toggle(option.value) : choose(option.value))}
              aria-pressed={on}
              whileHover={{ x: cards || question.kind === "select" ? 0 : 4, y: cards ? -4 : question.kind === "select" ? -2 : 0 }}
              whileTap={{ scale: 0.98 }}
              animate={dimmed ? { opacity: 0.45 } : { opacity: 1 }}
              className={`group relative flex overflow-hidden border text-left transition-colors duration-200 ${cards ? "min-h-48 flex-col items-start gap-3 p-5" : "min-h-14 items-center gap-3 px-4 py-3"} ${on ? "border-brand text-ink" : "border-line bg-paper-raised hover:border-brand hover:shadow-md"}`}
            >
              {/* The fill sweeps in from the left when chosen. */}
              <motion.span aria-hidden className="absolute inset-0 origin-left bg-brand-tint" initial={false} animate={{ scaleX: on ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE }} />
              {question.kind === "multi" ? (
                <span className={`relative flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${on ? "border-brand bg-brand text-paper" : "border-line-strong bg-paper-raised"}`}>
                  <AnimatePresence>{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}><Check className="h-3.5 w-3.5" /></motion.span>}</AnimatePresence>
                </span>
              ) : cards ? (
                <CardIcon value={option.value} on={on} />
              ) : (
                index < 9 && <span aria-hidden className={`relative hidden h-6 w-6 shrink-0 items-center justify-center border text-[11px] font-semibold tabular-nums transition-colors sm:flex ${on ? "border-brand bg-brand text-paper" : "border-line text-ink-faint group-hover:border-brand group-hover:text-brand"}`}>{index + 1}</span>
              )}
              <span className="relative flex-1">
                <span className={`block leading-snug ${cards ? "font-serif text-xl font-bold" : "text-[15px]"}`}>{option.label}</span>
                {option.description && <span className={`mt-1 block leading-relaxed text-ink-muted ${cards ? "text-sm" : "text-[13px]"}`}>{option.description}</span>}
              </span>
              <AnimatePresence>
                {on && question.kind !== "multi" && (
                  <motion.span className={cards ? "absolute right-4 top-4" : "relative"} initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.div>

      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        {question.kind === "multi" ? (
          <PrimaryButton disabled={!multi.length} onClick={() => onAnswer(question, multi)}>Continue</PrimaryButton>
        ) : (
          <p className="hidden text-xs text-ink-faint sm:block">Tip: press 1 to {Math.min(options.length, 9)} to answer</p>
        )}
      </div>
    </div>
  );
}

const CARD_ICONS: Record<string, LucideIcon> = { operating: BriefcaseBusiness, side: Clock3, idea: Lightbulb };

function CardIcon({ value, on }: { value: string; on: boolean }) {
  const Icon = CARD_ICONS[value] ?? Check;
  return (
    <motion.span animate={{ rotate: on ? [0, -8, 0] : 0 }} transition={{ duration: 0.4 }} className={`relative flex h-11 w-11 items-center justify-center transition-colors ${on ? "bg-brand text-paper" : "bg-brand-tint text-brand group-hover:bg-brand group-hover:text-paper"}`}>
      <Icon className="h-5 w-5" />
    </motion.span>
  );
}

const READING_STEPS = ["Reading your answers", "Building your business outline", "Checking it against what we offer", "Writing your summary"];

function Reading() {
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStepIndex((current) => Math.min(current + 1, READING_STEPS.length - 1)), 1400);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col items-center gap-8 py-14 text-center">
      <div className="relative h-20 w-20">
        <motion.span className="absolute inset-0 rounded-full border-4 border-brand-line border-t-brand" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        <motion.span className="absolute inset-3 rounded-full bg-gradient-to-br from-brand-plum to-highlight" animate={{ scale: [0.8, 1, 0.8], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
      </div>
      <ul className="w-full max-w-sm space-y-3 text-left">
        {READING_STEPS.map((label, index) => (
          <motion.li key={label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: index <= stepIndex ? 1 : 0.35, x: 0 }} transition={{ delay: index * 0.1, duration: 0.4 }} className="flex items-center gap-3 text-sm">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-300 ${index < stepIndex ? "border-brand bg-brand text-paper" : index === stepIndex ? "border-brand" : "border-line"}`}>
              {index < stepIndex ? <Check className="h-3 w-3" /> : index === stepIndex ? <motion.span className="h-1.5 w-1.5 rounded-full bg-brand" animate={{ scale: [1, 1.6, 1] }} transition={{ duration: 0.9, repeat: Infinity }} /> : null}
            </span>
            {label}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function DetailsScreen({ contact, pending, error, onChange, onBack, onSubmit }: { contact: Contact; pending: boolean; error: string; onChange: (contact: Contact) => void; onBack: () => void; onSubmit: () => void }) {
  const set = (key: keyof Contact) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...contact, [key]: event.target.value });
  const valid = contact.fullName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(contact.email.trim()) && !phoneProblem(contact.whatsappCountry, contact.whatsapp);

  return (
    <motion.form className="space-y-7" variants={listMotion} initial="hidden" animate="show" onSubmit={(event) => { event.preventDefault(); if (valid && !pending) onSubmit(); }}>
      <motion.div variants={itemMotion}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">Before we start</p>
        <h2 className="font-serif text-3xl font-black leading-tight">First, who are we talking to?</h2>
        <p className="mt-3 leading-relaxed text-ink-muted">So we can save your progress and send you your summary at the end.</p>
      </motion.div>
      <motion.div variants={itemMotion} className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required><Input value={contact.fullName} onChange={set("fullName")} autoComplete="name" className="h-12 rounded-none transition-shadow focus-visible:shadow-[0_0_0_4px_rgba(28,78,126,0.12)]" /></Field>
        <Field label="Email" required><Input type="email" value={contact.email} onChange={set("email")} autoComplete="email" className="h-12 rounded-none transition-shadow focus-visible:shadow-[0_0_0_4px_rgba(28,78,126,0.12)]" /></Field>
        <Field label="WhatsApp number (optional, for a quicker reply)">
          <PhoneField label="WhatsApp number" iso={contact.whatsappCountry} national={contact.whatsapp} onChange={({ iso, national }) => onChange({ ...contact, whatsappCountry: iso, whatsapp: national })} />
        </Field>
        <Field label="How did you hear about us? (optional)">
          <select aria-label="How did you hear about us?" value={contact.heardFrom} onChange={set("heardFrom")} className="h-12 w-full border border-input bg-paper-raised px-3 text-sm">
            <option value="">Choose one</option>
            {HEARD_FROM.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
      </motion.div>
      <motion.p variants={itemMotion} className="flex items-start gap-3 border border-brand-line bg-brand-tint p-4 text-xs leading-relaxed text-brand">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <span>We save your answers as you go, so you can pick up where you left off, and so our team can follow up if you don't finish. Your details stay with {BRAND.organisationName}; we never sell or share them.</span>
      </motion.p>
      <AnimatePresence>
        {error && <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} className="border border-danger-line bg-danger-tint p-3 text-sm text-danger-strong">{error}</motion.p>}
      </AnimatePresence>
      <motion.div variants={itemMotion} className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <PrimaryButton type="submit" disabled={!valid || pending}>{pending ? "Starting…" : "Start the Business Check"}</PrimaryButton>
      </motion.div>
    </motion.form>
  );
}

function SubmitFailed({ error, onRetry, onBack }: { error: string; onRetry: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6 py-10">
      <h2 className="font-serif text-2xl font-bold">We could not send your answers.</h2>
      <p className="border border-danger-line bg-danger-tint p-3 text-sm text-danger-strong">{error || "Kindly try again."}</p>
      <p className="text-sm text-ink-muted">Your answers are safe on this device.</p>
      <div className="flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
      </div>
    </div>
  );
}

/** The outline building up as the owner answers: one row per area on their path. */
function OutlinePanel({ answers }: { answers: Answers }) {
  const outline = businessOutline(answers);
  const areas = sectionPath(answers).map((id) => SECTIONS[id].area).filter((area): area is number => area !== undefined);
  if (!areas.length) return null;
  return (
    <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE }} className="h-fit border border-line bg-paper-raised p-5 lg:sticky lg:top-40">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{businessDetails(answers).businessName ? `Outline for ${businessDetails(answers).businessName}` : "Your business outline"}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-faint">It fills in as you answer.</p>
      <ul className="mt-4 space-y-2">
        <AnimatePresence initial={false}>
          {areas.map((area) => {
            const row = outline.find((item) => item.area === area);
            const health = row?.health ?? "pending";
            const style = HEALTH_STYLE[health];
            return (
              <motion.li key={area} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    {health !== "pending" && <motion.span key={`ring-${health}`} className={`absolute inset-0 rounded-full ${style.dot}`} initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 3, opacity: 0 }} transition={{ duration: 0.8 }} />}
                    <motion.span key={health} className={`relative h-2.5 w-2.5 rounded-full ${style.dot}`} initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} />
                  </span>
                  <span className={health === "pending" ? "text-ink-muted" : "text-ink"}>{AREA_NAMES[area]}</span>
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={health} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`text-[11px] font-semibold uppercase tracking-wider ${health === "pending" ? "text-ink-faint" : style.row.split(" ").find((name) => name.startsWith("text-"))}`}>
                    {style.label}
                  </motion.span>
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.aside>
  );
}

function CountUp({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  useEffect(() => {
    const controls = animate(count, value, { duration: 1, ease: EASE, delay: 0.4 });
    return () => controls.stop();
  }, [count, value]);
  return <motion.span>{rounded}</motion.span>;
}

function Result({ response, contact, answers, businessName, onRestart }: { response: BusinessCheckResponse; contact: Contact; answers: Answers; businessName: string; onRestart: () => void }) {
  const { result, summary } = response;
  const founder = result.founder;
  const narrative = founder.instinct ? describeFounder(answers, founder) : undefined;
  const [requested, setRequested] = useState<{ call?: boolean; report?: boolean }>({});
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** The owner opened Calendly in a new tab (the embedded calendar was blocked or not showing). */
  const [openedInTab, setOpenedInTab] = useState(false);
  const requestNext = trpc.businessCheck.requestNext.useMutation({
    onSuccess: (data) => setRequested((current) => ({ ...current, [data.choice]: true })),
  });
  const tally = (["stuck", "watch", "clear"] as const).map((health) => ({ health, count: result.outline.filter((row) => row.health === health).length }));
  // Areas the check left out for this business sit in the outline, greyed, so the whole method shows.
  const notAssessed = areasNotAssessed(answers);
  const outlineRows = notAssessed.length ? [...result.outline, ...notAssessed].sort((a, b) => a.area - b.area) : result.outline;
  const booking = bookingTarget(response.discoveryCallUrl, { name: contact.fullName, email: contact.email, host: window.location.host });
  const recordCall = (eventUri?: string) => {
    if (!requested.call && !requestNext.isPending) requestNext.mutate({ token: response.token, choice: "call", ...(eventUri ? { calendlyEventUri: eventUri } : {}) });
  };

  // Calendly tells the page when a time has been booked; that is when the call counts as booked.
  useEffect(() => {
    if (booking.kind !== "calendly") return undefined;
    const listener = (event: MessageEvent) => {
      if (isCalendlyBooking(event)) recordCall(calendlyEventUri(event.data));
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const bookCall = () => {
    if (booking.kind === "calendly") {
      setCalendarOpen(true);
      return;
    }
    if (booking.kind === "link") window.open(booking.pageUrl, "_blank", "noopener,noreferrer");
    recordCall();
  };
  const scrollToOffers = () => document.getElementById("next-steps")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <motion.div className="space-y-10" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }} initial="hidden" animate="show">
      <motion.div variants={itemMotion}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">Your Business Check{businessName ? ` · ${businessName}` : ""}</p>
        <h1 className="font-serif text-4xl font-black leading-tight sm:text-5xl">Here is what we see.</h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted"><Mail className="h-4 w-4" />{response.emailStatus === "Sent" ? `A copy has been sent to ${contact.email}.` : "Your result has been saved. Email delivery is not active yet."}</p>
      </motion.div>

      {result.outline.length > 1 && (
        <motion.div variants={itemMotion} className="grid grid-cols-3 gap-3">
          {tally.map(({ health, count }) => (
            <div key={health} className={`border p-4 text-center ${HEALTH_STYLE[health].row}`}>
              <p className="font-serif text-4xl font-black tabular-nums"><CountUp value={count} /></p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider">{HEALTH_STYLE[health].label}</p>
            </div>
          ))}
        </motion.div>
      )}

      <motion.section variants={itemMotion} className="grid gap-4 md:grid-cols-2">
        <SummaryCard title="Findings" body={summary.found} />
        <SummaryCard title="What we think it is" body={summary.think} accent />
      </motion.section>

      <motion.button
        type="button"
        variants={itemMotion}
        onClick={scrollToOffers}
        whileHover={{ y: -2 }}
        className="group flex w-full flex-col gap-3 border-2 border-highlight-ink/30 bg-paper-raised p-5 text-left transition-colors hover:border-highlight-ink sm:flex-row sm:items-center sm:justify-between"
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">This is the summary</span>
          <span className="mt-1 block font-serif text-xl font-bold text-ink">{FULL_REPORT.pitch}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 font-semibold text-highlight-ink">
          Get the Full Report · {formatNaira(PRICES.fullReport)} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </motion.button>

      {result.outline.length > 0 && (
        <motion.section variants={itemMotion}>
          <SectionHeading>Your business outline</SectionHeading>
          <motion.ul className="grid gap-2" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } } }} initial="hidden" whileInView="show" viewport={{ once: true }}>
            {outlineRows.map((row) => {
              const rowMotion = { hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } } };
              if (!("health" in row)) {
                return (
                  <motion.li key={row.area} variants={rowMotion} className="flex flex-col gap-1 border border-dashed border-line bg-paper px-4 py-3 text-ink-muted sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-line-strong" />
                      <span><span className="font-semibold">{row.area}. {row.name}</span><span className="block text-xs text-ink-faint">{row.reason}</span></span>
                    </span>
                    <span className="text-xs uppercase tracking-wider text-ink-faint">Not assessed</span>
                  </motion.li>
                );
              }
              const isMain = result.primaryArea?.area === row.area;
              return (
                <motion.li key={row.area} variants={rowMotion} whileHover={{ x: 4 }} className={`flex flex-col gap-1 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${HEALTH_STYLE[row.health].row} ${isMain ? "ring-2 ring-offset-2 ring-brand" : ""}`}>
                  <span className="flex items-center gap-2.5 font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${HEALTH_STYLE[row.health].dot}`} />{row.area}. {row.name}{isMain && <span className="ml-1 bg-brand px-2 py-0.5 text-[10px] uppercase tracking-wider text-paper">Start here</span>}</span>
                  <span className="text-xs uppercase tracking-wider">{HEALTH_STYLE[row.health].label}{row.gap && row.health !== "clear" ? ` · ${GAP_LABELS[row.gap].name}` : ""}</span>
                </motion.li>
              );
            })}
          </motion.ul>
          {result.primaryGap && (
            <p className="mt-4 text-sm leading-relaxed text-ink-soft"><span className="font-semibold text-ink">Main gap: {GAP_LABELS[result.primaryGap].name}.</span> {GAP_LABELS[result.primaryGap].meaning}</p>
          )}
          {notAssessed.length > 0 && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{NOT_ASSESSED_NOTE}</p>}
        </motion.section>
      )}

      {narrative && (
        <motion.section variants={itemMotion} className="border border-line bg-paper-raised p-6">
          <SectionHeading>Founder readiness</SectionHeading>
          <p className="font-serif text-2xl font-bold">{narrative.heading}</p>
          <p className="mt-2 leading-relaxed text-ink-700">{narrative.summary}</p>
          <ul className="mt-5 grid gap-3">
            {narrative.lines.map((line, index) => (
              <motion.li key={line.key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.2 + index * 0.1 }} className="flex flex-col gap-2 border-l-4 bg-paper p-4 sm:flex-row sm:items-start sm:gap-4" style={{ borderLeftColor: `var(--color-health-${STRENGTH_HEALTH[line.strength]})` }}>
                <span className="flex shrink-0 items-center gap-2 sm:w-60">
                  <span className="whitespace-nowrap font-semibold text-ink">{line.title}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${HEALTH_STYLE[STRENGTH_HEALTH[line.strength]].row}`}>{STRENGTH_LABELS[line.strength]}</span>
                </span>
                <span className="text-sm leading-relaxed text-ink-soft">{line.text}</span>
              </motion.li>
            ))}
          </ul>
          {narrative.lead && (
            <p className="mt-5 text-sm leading-relaxed text-ink-soft"><span className="font-semibold text-ink">How you lead.</span> {narrative.lead}</p>
          )}
          {founder.needsDriver && (
            <p className="mt-3 border-l-4 border-health-watch bg-health-watch-tint p-3 text-sm leading-relaxed text-ink-700">
              Nobody in the business reliably makes the hard call: chasing the debt, closing the deal, letting someone go. Every team needs that person. It doesn't have to be you, but it has to be someone.
            </p>
          )}
        </motion.section>
      )}

      {summary.offerings.length > 0 && (
        <motion.section variants={itemMotion}>
          <SectionHeading>Where we could help</SectionHeading>
          <ul className="grid gap-3">
            {summary.offerings.map((item, index) => {
              const offering = offeringById(item.id);
              return (
                <motion.li key={item.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, ease: EASE, delay: index * 0.08 }} whileHover={{ y: -3 }} className="group relative border border-line bg-paper-raised p-5 transition-shadow hover:shadow-lg">
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-highlight-ink transition-transform duration-300 group-hover:scale-y-100" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-highlight-ink">{offering ? CAPABILITIES[offering.capability] : ""}</p>
                  <p className="mt-1 font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{item.why}</p>
                </motion.li>
              );
            })}
          </ul>
        </motion.section>
      )}

      <motion.section variants={itemMotion} id="next-steps" className="scroll-mt-24">
        <SectionHeading>Your next steps</SectionHeading>
        <div className="grid gap-4 lg:grid-cols-2">
          {/* The free call */}
          <div className="relative flex flex-col overflow-hidden bg-gradient-to-br from-brand-plum via-brand-deep to-brand-deep p-6 text-paper sm:p-8">
            <motion.div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-highlight/25 blur-3xl" animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} />
            <div className="relative flex flex-1 flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">Free · 20 minutes</p>
              <p className="mt-3 font-serif text-2xl font-bold leading-snug">{summary.next}</p>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-on-dark-muted">By phone or video. If we're not the right fit, we'll say so and point you to who is.</p>
              <AnimatePresence mode="wait" initial={false}>
                {requested.call ? (
                  <motion.p key="booked" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }} className="mt-6 flex items-start gap-3 border border-highlight/40 p-4 text-sm leading-relaxed">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-highlight" />
                    {booking.kind === "none"
                      ? "Thank you. Your request has been sent to the IPF team. We'll email you to agree a time."
                      : openedInTab
                        ? `We've opened the calendar in a new tab. Pick a time there and Calendly will email your confirmation to ${contact.email}.`
                        : `Booked. The confirmation is on its way to ${contact.email}.`}
                  </motion.p>
                ) : (
                  <motion.button key="book" type="button" onClick={bookCall} disabled={requestNext.isPending} exit={{ opacity: 0, scale: 0.96 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="group mt-6 inline-flex h-14 w-full items-center justify-center bg-highlight px-8 text-sm font-semibold uppercase tracking-widest text-brand-deep shadow-[0_18px_40px_-18px_rgba(54,183,224,0.9)] transition-colors hover:bg-highlight-hover disabled:opacity-60">
                    <CalendarDays className="mr-2 h-4 w-4" /> {booking.kind === "calendly" && calendarOpen ? "Choose a time below" : booking.kind === "none" ? "Request my free Debrief" : "Book my free Debrief"}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* The paid full report */}
          <div className="flex flex-col border-2 border-highlight-ink bg-paper-raised p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">The Full Report</p>
            <p className="mt-3 font-serif text-2xl font-bold leading-snug text-ink">{FULL_REPORT.name}</p>
            <p className="mt-3 font-serif text-5xl font-black tracking-tight text-ink">{formatNaira(PRICES.fullReport)}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {FULL_REPORT.includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-highlight-ink" />{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink-muted">{FULL_REPORT.delivery}</p>
            <AnimatePresence mode="wait" initial={false}>
              {requested.report ? (
                <motion.p key="requested" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 flex items-start gap-3 border border-highlight-ink/40 bg-paper p-4 text-sm leading-relaxed text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-highlight-ink" />
                  Thank you. The payment details are on their way to {contact.email}. Once your payment is confirmed, you complete the Report Intake and your Full Report arrives straight away.
                </motion.p>
              ) : (
                <motion.button key="get" type="button" onClick={() => requestNext.mutate({ token: response.token, choice: "report" })} disabled={requestNext.isPending} exit={{ opacity: 0, scale: 0.96 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="group mt-6 inline-flex h-14 w-full items-center justify-center bg-highlight-ink px-8 text-sm font-semibold uppercase tracking-widest text-paper shadow-[0_18px_40px_-18px_rgba(203,55,86,0.8)] transition-opacity hover:opacity-90 disabled:opacity-60">
                  <FileText className="mr-2 h-4 w-4" /> Get my Full Report
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {booking.kind === "calendly" && calendarOpen && !requested.call && (
            <motion.div key="calendar" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: EASE }} className="mt-4 overflow-hidden border border-line bg-paper-raised">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
                <p className="text-sm font-semibold text-ink">Choose a time for your free Debrief</p>
                {/* Some browsers, blockers and networks stop embedded calendars; the same calendar opens in a new tab. */}
                <a href={booking.openUrl} target="_blank" rel="noopener noreferrer" onClick={() => { setOpenedInTab(true); recordCall(); }} className="text-xs font-semibold text-brand underline underline-offset-2 hover:text-brand-deep">
                  Calendar not showing? Open it in a new tab
                </a>
              </div>
              <iframe title="Book your free Debrief" src={booking.embedUrl} className="h-[720px] w-full" />
            </motion.div>
          )}
        </AnimatePresence>
        {requestNext.error && <p className="mt-4 text-sm text-danger-strong">{requestNext.error.message}</p>}
      </motion.section>

      <motion.p variants={itemMotion} className="text-xs leading-relaxed text-ink-faint">
        {response.summarySource === "AI" ? "This summary was written by AI from your answers and checked against the services we offer. The outline itself comes from fixed rules, so the same answers always give the same outline." : "This summary was written from your answers using fixed rules, so the same answers always give the same result."}{" "}
        <button type="button" onClick={onRestart} className="inline-flex items-center gap-1 font-semibold text-brand underline underline-offset-2"><RotateCcw className="h-3 w-3" />Take the Business Check again</button>
      </motion.p>
    </motion.div>
  );
}

function SummaryCard({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <motion.div whileHover={{ y: -3 }} className={`border p-6 transition-shadow hover:shadow-lg ${accent ? "border-brand bg-brand-tint" : "border-line bg-paper-raised"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</p>
      <p className="mt-3 leading-relaxed text-ink-700">{body}</p>
    </motion.div>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button", large }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; large?: boolean }) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`group inline-flex items-center justify-center bg-ink font-semibold uppercase tracking-widest text-paper shadow-[0_14px_30px_-16px_rgba(18,50,79,0.8)] transition-colors hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${large ? "h-14 px-8 text-sm" : "h-12 px-7 text-xs"}`}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">{children}</h2>;
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}{required && <span className="text-highlight-ink"> *</span>}</Label>
      {children}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-brand">
      <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" /> Back
    </button>
  );
}
