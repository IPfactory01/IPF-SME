/**
 * A clickable mock of the client's room as the room brief describes it (docs/product/07-engagement-room-brief.md):
 * now, your one thing, the next call, and the journey numbered one to seven. Preview only, sample data only, nothing
 * saved. Five moments in one owner's engagement, switched at the top. Becomes the real room once ET approves it.
 */
import AccountLayout from "@/components/AccountLayout";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarClock, Check, ChevronDown, Download, Paperclip } from "lucide-react";
import React, { useState } from "react";

type State = "done" | "now" | "next";
type Who = "You" | "Us" | "Together";
type Activity = { n: number; title: string; who: Who; when: string; state: State | "needs_more"; factor?: "internal" | "external"; note?: string; action?: "upload" | "confirm" | "book" | "sign" };
type Step = { n: number; title: string; state: State; when: string; summary: string; body?: React.ReactNode };
type Moment = {
  id: string;
  label: string;
  today: string;
  now: { title: string; progress?: { done: number; total: number; unit: string }; line: string };
  oneThing: { title: string; detail: string; due: string; action: string } | null;
  nextCall: { title: string; when: string } | null;
  steps: Step[];
};

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.2em] text-highlight-ink";
const KICKER = "text-xs font-semibold uppercase tracking-widest text-ink-muted";
const WHO: Record<Who, string> = { You: "bg-brand-tint text-brand border-brand-line", Us: "bg-paper-muted text-ink-muted border-line", Together: "bg-health-clear-tint text-health-clear border-health-clear" };

const check = (
  <div className="space-y-2 text-sm">
    <p>Main finding: <strong>Financials</strong>. Readiness: <strong>intermediate</strong>. The problem you named: <em>"Sales are steady but cash runs out before month end."</em></p>
    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline underline-offset-2"><Download className="h-3.5 w-3.5" aria-hidden />See your results</button>
  </div>
);
const debrief = (
  <div className="space-y-3 text-sm">
    <div><p className={KICKER}>What we heard</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        <li>Two outlets, a kitchen and a van. Sales of about ₦4,000,000 a month, steady for a year.</li>
        <li>Money runs out in week three; you borrow from the second outlet's takings to pay salaries.</li>
        <li>Prices were last set in 2024. Delivery is charged by guess.</li>
      </ol></div>
    <div><p className={KICKER}>What success looks like, in your words</p><p className="mt-1">"I want to pay salaries on the 25th without moving money around, and know which outlet actually makes money."</p></div>
    <div><p className={KICKER}>What you have tried</p><p className="mt-1">A bookkeeper for three months in 2025. Stopped when the reports came late.</p></div>
    <div><p className={KICKER}>Next steps we agreed</p><p className="mt-1">The full report, then the Current State Assessment starting the week of 19 October.</p></div>
  </div>
);
const report = (
  <div className="space-y-2 text-sm">
    <p>Twelve pages on where Ada Foods stands across the ten problem areas, from your check.</p>
    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline underline-offset-2"><Download className="h-3.5 w-3.5" aria-hidden />Download the report (PDF)</button>
  </div>
);

const PLAN_WEEK_1: Activity[] = [
  { n: 1, title: "Six quick questions before your first call", who: "You", when: "By Tue 20 Oct", state: "done", factor: "internal", action: "confirm" },
  { n: 2, title: "Your sales for the last 12 months, and what you spend each month", who: "You", when: "By Wed 21 Oct", state: "done", factor: "internal", action: "upload" },
  { n: 3, title: "Your price list, with delivery charges", who: "You", when: "By Thu 22 Oct", state: "needs_more", factor: "internal", note: "We need a bit more: the delivery charges too.", action: "upload" },
  { n: 4, title: "Call 1: your business in your words, the numbers, how a normal week runs", who: "Together", when: "Fri 23 Oct, 10:00 am", state: "next", action: "book" },
  { n: 5, title: "Your three main competitors and what they charge", who: "Us", when: "By Fri 23 Oct", state: "now", factor: "external" },
];
const PLAN_WEEK_2: Activity[] = [
  { n: 6, title: "Bank statements for the last 6 months; money owed to you and by you", who: "You", when: "By Tue 27 Oct", state: "next", factor: "internal", action: "upload" },
  { n: 7, title: "Profit by outlet and by product, from your numbers", who: "Us", when: "By Wed 28 Oct", state: "next", factor: "internal" },
  { n: 8, title: "Ten customers: why they buy, why they left", who: "Together", when: "By Thu 29 Oct", state: "next", factor: "external" },
  { n: 9, title: "Call 2: what we found, and the one problem to fix first", who: "Together", when: "Fri 30 Oct, 10:00 am", state: "next", action: "book" },
];

function plan(week1: Activity[], week2: Activity[], onAct: (n: number) => void, acted: Set<number>) {
  const row = (item: Activity) => {
    const done = item.state === "done" || acted.has(item.n);
    return (
      <li key={item.n} className={`flex gap-3 border-t border-line-soft py-3 ${done ? "text-ink-muted" : ""}`}>
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold ${done ? "border-brand bg-brand text-white" : item.state === "now" || item.state === "needs_more" ? "border-brand text-brand" : "border-line text-ink-muted"}`}>{done ? <Check className="h-3.5 w-3.5" aria-hidden /> : item.n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-medium ${done ? "line-through decoration-line-strong" : "text-ink"}`}>{item.title}</span>
            <span className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${WHO[item.who]}`}>{item.who}</span>
            {item.factor && <span className="text-[10px] uppercase tracking-wider text-ink-faint">{item.factor}</span>}
          </div>
          <p className="text-xs text-ink-muted">{done ? "Done" : item.when}</p>
          {!done && item.state === "needs_more" && item.note && <p className="mt-1 text-sm text-danger">{item.note}</p>}
          {!done && item.who !== "Us" && item.action && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.action === "upload" && <button type="button" onClick={() => onAct(item.n)} className="inline-flex items-center gap-1.5 border border-brand bg-brand px-3 py-1.5 text-xs font-medium text-white"><Paperclip className="h-3.5 w-3.5" aria-hidden />Upload a file</button>}
              {item.action === "upload" && <button type="button" onClick={() => onAct(item.n)} className="border border-line bg-white px-3 py-1.5 text-xs font-medium">I sent it another way</button>}
              {item.action === "confirm" && <button type="button" onClick={() => onAct(item.n)} className="border border-brand bg-brand px-3 py-1.5 text-xs font-medium text-white">Answer the six questions</button>}
              {item.action === "book" && <button type="button" className="border border-brand bg-brand px-3 py-1.5 text-xs font-medium text-white">Join the call</button>}
              {item.action === "sign" && <button type="button" onClick={() => onAct(item.n)} className="border border-brand bg-brand px-3 py-1.5 text-xs font-medium text-white">Sign this off</button>}
            </div>
          )}
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-4 text-sm">
      <p className="text-ink-muted">Two weeks that test both inside the business (your numbers, prices, people, how the week runs) and outside it (customers, competitors, the market) to find where the problem is and what to do about it.</p>
      <div><p className={KICKER}>Week 1 · 19 to 23 October</p><ol className="mt-1">{week1.map(row)}</ol></div>
      <div><p className={KICKER}>Week 2 · 26 to 30 October</p><ol className="mt-1">{week2.map(row)}</ol></div>
    </div>
  );
}

const findings = (
  <div className="space-y-3 text-sm">
    <div className="border-l-2 border-highlight-ink pl-3"><p className={KICKER}>The one problem to fix first</p><p className="mt-1 font-serif text-lg">Delivery is sold below what it costs. Every van order loses money, and the van does 60% of your sales.</p></div>
    <ol className="list-decimal space-y-1 pl-5 text-ink">
      <li>Your business at a glance</li>
      <li>What the numbers say: outlet 1 makes ₦310,000 a month, outlet 2 breaks even, the van loses ₦180,000</li>
      <li>How the business runs: every price change and every supplier payment waits for you</li>
      <li>Your customers and prices: last set in 2024; delivery charged at ₦500 against a cost of ₦1,400</li>
      <li>Other problems we found, for later: stock counts, the second account</li>
      <li>What we looked at, and what we could not check</li>
    </ol>
    <p className={KICKER}>What we propose for the fix</p>
    <p>One number: <strong>cash in the bank on the 25th</strong>, from ₦150,000 to ₦400,000 in six weeks, by pricing delivery at cost plus and moving the two largest van customers to a weekly order.</p>
  </div>
);

function Number({ readings, closed }: { readings: { week: number; date: string; value: string; step: string }[]; closed?: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-muted">Cash in the bank on the 25th. The business account balance after salaries.</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="border border-line-soft p-3"><p className={KICKER}>Started</p><p className="mt-1 font-serif text-lg">₦150,000</p></div>
        <div className="border-2 border-brand bg-brand-tint p-3"><p className={KICKER}>{closed ? "Day 30" : "This week"}</p><p className="mt-1 font-serif text-2xl font-black text-health-clear">{readings[readings.length - 1].value}</p></div>
        <div className="border border-line-soft p-3"><p className={KICKER}>Going to</p><p className="mt-1 font-serif text-lg">₦400,000</p></div>
      </div>
      <table className="w-full text-left text-sm" aria-label="Week by week">
        <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted"><th className="py-1 pr-3">Week</th><th className="pr-3">The number</th><th>Next step</th></tr></thead>
        <tbody>{readings.map(row => <tr key={row.week} className="border-b border-line-soft align-top"><td className="py-1 pr-3">{row.week}<span className="block text-xs text-ink-muted">{row.date}</span></td><td className="pr-3 tabular-nums">{row.value}</td><td>{row.step}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const READINGS = [
  { week: 1, date: "Fri 13 Nov", value: "₦160,000", step: "Price every van order at cost plus 20%." },
  { week: 2, date: "Fri 20 Nov", value: "₦210,000", step: "Move Chidi's and Mama B's to a weekly order." },
  { week: 3, date: "Fri 27 Nov", value: "₦265,000", step: "Stop the second account; one account, one week's cash count." },
];
const READINGS_END = [...READINGS, { week: 4, date: "Fri 4 Dec", value: "₦300,000", step: "Hold prices; chase the two late invoices." }, { week: 5, date: "Fri 11 Dec", value: "₦350,000", step: "Train Bola to run the cash count." }, { week: 6, date: "Fri 18 Dec", value: "₦405,000", step: "Keep the Friday count. Day 30 on 17 January." }, { week: 10, date: "Sat 17 Jan", value: "₦390,000", step: "It held. Delivery price kept; the weekly count still runs." }];

function steps(at: number, extra: Partial<Record<number, Partial<Step>>>, bodies: Partial<Record<number, React.ReactNode>>): Step[] {
  const base: Omit<Step, "state">[] = [
    { n: 1, title: "Business check", when: "Fri 9 Oct", summary: "Ten minutes on your phone. A first sense of where the business stands." },
    { n: 2, title: "Debrief call", when: "Tue 13 Oct", summary: "Twenty minutes: you told us, we listened, we agreed the next steps." },
    { n: 3, title: "Your report", when: "Wed 14 Oct", summary: "Where you stand across the ten problem areas." },
    { n: 4, title: "Current State Assessment", when: "19 to 30 Oct", summary: "Two weeks and two calls to find the one problem to fix first." },
    { n: 5, title: "What we found", when: "Mon 2 Nov", summary: "The findings, the one problem, and what we propose to do about it." },
    { n: 6, title: "The fix", when: "9 Nov to 18 Dec", summary: "One number to move, six weeks, a check-in every week." },
    { n: 7, title: "Day 30", when: "Sat 17 Jan", summary: "Did it hold? What support looks like from here." },
  ];
  return base.map(item => ({ ...item, state: item.n < at ? "done" : item.n === at ? "now" : "next", body: bodies[item.n], ...extra[item.n] }));
}

function moments(onAct: (n: number) => void, acted: Set<number>): Moment[] {
  return [
    {
      id: "day1", label: "Day 1", today: "Fri 16 Oct",
      now: { title: "Getting set up", line: "Your Current State Assessment starts on Monday 19 October. Before then we name your team and book both calls." },
      oneThing: { title: "Answer six quick questions", detail: "A few words each. They start your first call where you are, not from a blank page.", due: "By Tue 20 Oct", action: "Answer the six questions" },
      nextCall: { title: "Current State Assessment call 1", when: "Fri 23 Oct, 10:00 am (Lagos time), 90 minutes" },
      steps: steps(4, { 4: { state: "now", when: "Starts Mon 19 Oct" } }, { 1: check, 2: debrief, 3: report, 4: plan(PLAN_WEEK_1.map(a => ({ ...a, state: "next" as const, note: undefined })), PLAN_WEEK_2, onAct, acted) }),
    },
    {
      id: "week1", label: "Week 1", today: "Thu 22 Oct",
      now: { title: "Current State Assessment, week 1 of 2", progress: { done: 4, total: 14, unit: "Day" }, line: "This week is about your numbers and how a normal week runs. Call 1 is tomorrow." },
      oneThing: { title: "Your price list, with delivery charges", detail: "We have the list. We need the delivery charges too, so the van's numbers add up.", due: "By Thu 22 Oct", action: "Upload a file" },
      nextCall: { title: "Current State Assessment call 1", when: "Fri 23 Oct, 10:00 am (Lagos time), 90 minutes" },
      steps: steps(4, {}, { 1: check, 2: debrief, 3: report, 4: plan(PLAN_WEEK_1, PLAN_WEEK_2, onAct, acted) }),
    },
    {
      id: "findings", label: "Findings", today: "Mon 2 Nov",
      now: { title: "What we found", line: "The findings are in your room. Read them, and sign off the one problem to fix first, so the fix can start on Monday 9 November." },
      oneThing: { title: "Read the findings and sign off the one problem", detail: "If you disagree, say so in a comment: the fix starts from what you sign off, not from what we wrote.", due: "By Wed 4 Nov", action: "Sign this off" },
      nextCall: { title: "The fix: week 1 check-in", when: "Fri 13 Nov, 10:00 am (Lagos time), 30 minutes" },
      steps: steps(5, {}, { 1: check, 2: debrief, 3: report, 4: plan(PLAN_WEEK_1.map(a => ({ ...a, state: "done" as const })), PLAN_WEEK_2.map(a => ({ ...a, state: "done" as const })), onAct, acted), 5: findings }),
    },
    {
      id: "fix3", label: "Fix week 3", today: "Fri 27 Nov",
      now: { title: "The fix, week 3 of 6", progress: { done: 3, total: 6, unit: "Week" }, line: "Cash on the 25th is up ₦115,000 since the start. This week: one account, and a cash count every Friday." },
      oneThing: { title: "Close the second account and count cash this Friday", detail: "Bola counts with you the first time. Send a photo of the count sheet after.", due: "By Fri 27 Nov", action: "Upload a file" },
      nextCall: { title: "The fix: week 4 check-in", when: "Fri 4 Dec, 10:00 am (Lagos time), 30 minutes" },
      steps: steps(6, {}, { 1: check, 2: debrief, 3: report, 5: findings, 6: <Number readings={READINGS} /> }),
    },
    {
      id: "day30", label: "Day 30", today: "Sat 17 Jan",
      now: { title: "Day 30: it held", line: "Thirty days after the fix ended, cash on the 25th is ₦390,000 against ₦150,000 when we started. The delivery price and the Friday count are still in use." },
      oneThing: { title: "Tell us what is still in use, and what slipped", detail: "Three questions, two minutes. It is how we close the engagement honestly.", due: "By Fri 23 Jan", action: "Answer the three questions" },
      nextCall: null,
      steps: steps(8, {}, { 1: check, 2: debrief, 3: report, 5: findings, 6: <Number readings={READINGS_END.slice(0, 6)} />, 7: <Number readings={READINGS_END} closed /> }),
    },
  ];
}

export default function RoomMock() {
  const [momentId, setMomentId] = useState("week1");
  const [acted, setActed] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const onAct = (n: number) => setActed(current => new Set(current).add(n));
  const all = moments(onAct, acted);
  const moment = all.find(item => item.id === momentId) ?? all[0];
  const nowStep = moment.steps.find(step => step.state === "now")?.n ?? null;
  const isOpen = (n: number) => (open === null ? n === nowStep : open === n);
  return (
    <AccountLayout width="wide">
      {() => (
        <div className="mx-auto max-w-2xl space-y-6">
          <div role="group" aria-label="Pick a moment (mock only)" className="flex flex-wrap items-center gap-2 border border-dashed border-line p-2 text-xs">
            <span className="px-1 font-semibold uppercase tracking-widest text-ink-faint">Mock · pick a moment</span>
            {all.map(item => (
              <button key={item.id} type="button" onClick={() => { setMomentId(item.id); setOpen(null); setActed(new Set()); }} className={`border px-2.5 py-1 font-medium ${item.id === moment.id ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-600 hover:border-brand-line"}`}>{item.label}</button>
            ))}
            <span className="ml-auto text-ink-muted">Today: {moment.today}</span>
          </div>

          <section aria-labelledby="now-title" className="relative overflow-hidden border border-line-soft bg-paper-raised p-6 shadow-sm sm:p-8">
            <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-brand-plum/10 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-highlight/15 blur-3xl" />
            <div className="relative">
              <p className={EYEBROW}>Ada Foods · Now</p>
              <h1 id="now-title" className="mt-2 font-serif text-3xl font-black tracking-tight sm:text-4xl">{moment.now.title}</h1>
              {moment.now.progress && (
                <div className="mt-3 max-w-sm">
                  <div className="flex justify-between text-xs text-ink-muted"><span>{moment.now.progress.unit} {moment.now.progress.done} of {moment.now.progress.total}</span><span>{Math.round((moment.now.progress.done / moment.now.progress.total) * 100)}%</span></div>
                  <div className="mt-1 h-1.5 w-full bg-line-soft" role="progressbar" aria-valuenow={moment.now.progress.done} aria-valuemin={0} aria-valuemax={moment.now.progress.total}><div className="h-1.5 bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" style={{ width: `${(moment.now.progress.done / moment.now.progress.total) * 100}%` }} /></div>
                </div>
              )}
              <p className="mt-3 max-w-xl text-ink-600">{moment.now.line}</p>

              {moment.oneThing && (
                <div className="mt-6 border border-brand-line bg-brand-tint p-4">
                  <p className={KICKER}>Your one thing</p>
                  <p className="mt-1 font-serif text-xl font-bold tracking-tight">{moment.oneThing.title}</p>
                  <p className="mt-1 text-sm text-ink-600">{moment.oneThing.detail}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button type="button" size="sm" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white hover:bg-brand-deep-hover">{moment.oneThing.action}</Button>
                    <span className="text-xs text-ink-muted">{moment.oneThing.due}</span>
                  </div>
                </div>
              )}
              {moment.nextCall ? (
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><CalendarClock className="h-4 w-4 text-brand" aria-hidden /><span className="font-semibold">Next call:</span><span>{moment.nextCall.title}</span><span className="text-ink-muted">{moment.nextCall.when}</span><a href="#join" className="font-semibold text-brand underline underline-offset-2">Join</a></p>
              ) : <p className="mt-4 text-sm text-ink-muted">No more calls are booked. Your team is one message away.</p>}
            </div>
          </section>

          <section aria-labelledby="journey-title">
            <p className={KICKER}>Your journey</p>
            <h2 id="journey-title" className="mt-1 font-serif text-2xl font-bold tracking-tight">Seven steps, start to day 30</h2>
            <ol className="mt-4">
              {moment.steps.map((step, index) => {
                const last = index === moment.steps.length - 1;
                const tone = step.state === "done" ? "border-brand bg-brand text-white" : step.state === "now" ? "border-highlight-ink bg-highlight-ink text-white" : "border-line bg-white text-ink-muted";
                return (
                  <li key={step.n} className="relative flex gap-4">
                    {!last && <span aria-hidden className={`absolute left-[15px] top-8 h-full w-px ${step.state === "done" ? "bg-brand" : "bg-line"}`} />}
                    <span className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center border font-serif text-sm font-bold ${tone}`}>{step.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : step.n}</span>
                    <div className={`min-w-0 flex-1 pb-6 ${step.state === "next" ? "opacity-80" : ""}`}>
                      <button type="button" aria-expanded={isOpen(step.n)} onClick={() => setOpen(isOpen(step.n) ? -1 : step.n)} className="flex w-full items-start justify-between gap-3 text-left">
                        <span>
                          <span className="flex flex-wrap items-center gap-2">
                            <span className={`font-serif text-lg font-bold tracking-tight ${step.state === "next" ? "text-ink-muted" : ""}`}>{step.title}</span>
                            {step.state === "now" && <span className={EYEBROW}>Now</span>}
                          </span>
                          <span className="block text-xs text-ink-muted">{step.state === "done" ? `Done · ${step.when}` : step.when}</span>
                        </span>
                        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform ${isOpen(step.n) ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                      {isOpen(step.n) && (
                        <div className="mt-3 border border-line-soft bg-paper-raised p-4 shadow-sm">
                          <p className="text-sm text-ink-600">{step.summary}</p>
                          {step.body && <div className="mt-3">{step.body}</div>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <section aria-labelledby="team-title" className="border border-line-soft bg-paper-raised p-5 shadow-sm">
            <p className={KICKER}>Your team</p>
            <h2 id="team-title" className="mt-1 font-serif text-xl font-bold tracking-tight">Femi Adebayo and Ngozi Eze</h2>
            <p className="mt-1 text-sm text-ink-muted">Femi leads the engagement; Ngozi works the numbers. Both on WhatsApp, both on every call.</p>
            <p className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>Your engagement includes one person from your business, at no cost.</span><button type="button" className="inline-flex items-center gap-1 font-semibold text-brand underline underline-offset-2">Bring someone in <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button></p>
          </section>
        </div>
      )}
    </AccountLayout>
  );
}
