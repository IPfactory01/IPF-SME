import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { READINESS_LABELS } from "@shared/businessCheck/engine";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { ASSESSMENT_DAYS, ASSESSMENT_WEEKS, FIX_WEEKS, formatFileSize, formatMeasure, OPEN_TASK_STATUSES, UPLOAD_ACCEPT, UPLOAD_MAX_MB } from "@shared/engagement";
import { METHOD, METHOD_MEANING } from "@shared/method";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRight, CalendarClock, Check, ChevronDown, Download, Paperclip } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Task = Room["tasks"][number];
type Session = Room["sessions"][number];
type RoomFile = Task["files"][number];
type Deliverable = Room["deliverables"][number];
type StepState = "done" | "now" | "next";

const DAY = 86_400_000;
const lagos = (value: Date | string | null | undefined, withTime = true) =>
  value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}) }).format(new Date(value)) : "";
const dateOnly = (value: string) => lagos(`${value}T12:00:00Z`, false);
const dueText = (dueOn: string | null) => (dueOn ? `By ${dateOnly(dueOn)}` : "");
const daysSince = (from: Date | string | null | undefined, now: number) => (from ? Math.max(0, Math.floor((now - new Date(from).getTime()) / DAY)) : null);

const CARD = "border border-line-soft bg-paper-raised p-5 shadow-sm sm:p-6";
const KICKER = "text-xs font-semibold uppercase tracking-widest text-ink-muted";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.2em] text-highlight-ink";
const WHO: Record<"You" | "IP Factory" | "Together", string> = { You: "border-brand-line bg-brand-tint text-brand", "IP Factory": "border-line bg-paper-muted text-ink-muted", Together: "border-health-clear bg-health-clear-tint text-health-clear" };
const isOpen = (task: Task) => OPEN_TASK_STATUSES.includes(task.status);

/**
 * The client's room, as the room brief (document 07) describes it: now, the next action, the next Session, then the
 * Engagement timeline numbered one to seven with the current step open. One column, phone first. Everything shown
 * here was filtered on the server for this person; this screen decides nothing about access.
 */
export default function EngagementRoom({ room, greeting, aside, now = Date.now() }: { room: Room; greeting?: string; aside?: React.ReactNode; now?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const isOwner = room.viewer.kind === "owner";
  const here = nowOf(room, now);
  const action = nextActionOf(room, isOwner);
  const steps = stepsOf(room, now);
  const current = steps.find(step => step.state === "now")?.n ?? null;
  const shown = (n: number) => (open === null ? n === current : open === n);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section aria-labelledby="room-title" className="relative overflow-hidden border border-line-soft bg-paper-raised p-6 shadow-sm sm:p-8">
        {/* The colour from the logo, softly, behind the headline: the same idea as the site's hero. */}
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full bg-brand-plum/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-highlight/15 blur-3xl" />
        <div className="relative">
          <p className={EYEBROW}>{greeting ? `${greeting} · ` : ""}{room.businessName}</p>
          <h1 id="room-title" className="mt-2 font-serif text-3xl font-black tracking-tight sm:text-4xl">{here.title}</h1>
          {here.progress && (
            <div className="mt-3 max-w-sm">
              <div className="flex justify-between text-xs text-ink-muted"><span>{here.progress.label}</span><span>{Math.round((here.progress.done / here.progress.total) * 100)}%</span></div>
              <div className="mt-1 h-1.5 w-full bg-line-soft" role="progressbar" aria-label={here.progress.label} aria-valuenow={here.progress.done} aria-valuemin={0} aria-valuemax={here.progress.total}>
                <div className="h-1.5 bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" style={{ width: `${Math.min(100, (here.progress.done / here.progress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          <p className="mt-3 max-w-xl text-ink-600">{here.line}</p>

          <div className="mt-6 border border-brand-line bg-brand-tint p-4" aria-labelledby="next-action">
            <p id="next-action" className={KICKER}>Next action{action.kind === "task" ? ` · ${action.label}` : ""}</p>
            {action.kind === "task" && (
              <>
                <p className="mt-1 font-serif text-xl font-bold tracking-tight">{action.task.title}</p>
                {action.task.detail && <p className="mt-1 text-sm text-ink-600">{action.task.detail}</p>}
                {action.task.status === "needs_more" && action.task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {action.task.statusNote}</p>}
                <TaskControls task={action.task} uploadsEnabled={room.uploadsEnabled} due />
              </>
            )}
            {action.kind === "signoff" && (
              <>
                <p className="mt-1 font-serif text-xl font-bold tracking-tight">Read the {action.deliverable.kindLabel} and give your {METHOD.signOff}</p>
                <p className="mt-1 text-sm text-ink-600">{METHOD_MEANING.signOff} If you disagree, say so in a comment under it.</p>
                <a href={`#step-${action.step}`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand underline underline-offset-2" onClick={() => setOpen(action.step)}>Open the {action.deliverable.kindLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
              </>
            )}
            {action.kind === "none" && <p className="mt-1 text-sm text-ink-600">Nothing outstanding. We will tell you here when there is.</p>}
          </div>

          {room.nextSession ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <CalendarClock className="h-4 w-4 text-brand" aria-hidden />
              <span className="font-semibold">Next {METHOD.session}:</span>
              <span>{room.nextSession.title}</span>
              <span className="text-ink-muted">{lagos(room.nextSession.scheduledFor)} (Lagos time){room.nextSession.durationMinutes ? `, ${room.nextSession.durationMinutes} minutes` : ""}</span>
              {room.nextSession.meetingLink && <a href={room.nextSession.meetingLink} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">Join the {METHOD.session}</a>}
            </p>
          ) : <p className="mt-4 text-sm text-ink-muted">No {METHOD.session} is booked yet. It will show here with a Join link once it is.</p>}
        </div>
      </section>

      <section aria-labelledby="timeline-title">
        <p className={KICKER}>{METHOD.engagement} timeline</p>
        <h2 id="timeline-title" className="mt-1 font-serif text-2xl font-bold tracking-tight">{METHOD.businessCheck} to {METHOD.day30}</h2>
        <ol className="mt-4" aria-label="Engagement timeline">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            const tone = step.state === "done" ? "border-brand bg-brand text-white" : step.state === "now" ? "border-highlight-ink bg-highlight-ink text-white" : "border-line bg-white text-ink-muted";
            return (
              <li key={step.n} id={`step-${step.n}`} aria-current={step.state === "now" ? "step" : undefined} className="relative flex gap-4 scroll-mt-24">
                {!last && <span aria-hidden className={`absolute left-[15px] top-8 h-full w-px ${step.state === "done" ? "bg-brand" : "bg-line"}`} />}
                <span className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center border font-serif text-sm font-bold ${tone}`}>{step.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : step.n}</span>
                <div className={`min-w-0 flex-1 pb-6 ${step.state === "next" ? "opacity-80" : ""}`}>
                  <button type="button" aria-expanded={shown(step.n)} onClick={() => setOpen(shown(step.n) ? -1 : step.n)} className="flex w-full items-start justify-between gap-3 text-left">
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`font-serif text-lg font-bold tracking-tight ${step.state === "next" ? "text-ink-muted" : ""}`}>{step.title}</span>
                        {step.state === "now" && <span className={EYEBROW}>Now</span>}
                      </span>
                      <span className="block text-xs text-ink-muted">{step.when}</span>
                    </span>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform ${shown(step.n) ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {shown(step.n) && (
                    <div className="mt-3 border border-line-soft bg-paper-raised p-4 shadow-sm" role="region" aria-label={`Step ${step.n}: ${step.title}`}>
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

      <section aria-labelledby="team-title" className={CARD}>
        <p className={KICKER}>Your team at IP Factory</p>
        {room.team.length ? (
          <>
            <h2 id="team-title" className="mt-1 font-serif text-xl font-bold tracking-tight">{room.team.map(member => member.name).join(" and ")}</h2>
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">{room.team.map(member => <li key={`${member.name}-${member.roleLabel}`}><span className="font-medium">{member.name}</span> <span className="text-ink-muted">· {member.roleLabel}</span></li>)}</ul>
          </>
        ) : <h2 id="team-title" className="mt-1 font-serif text-xl font-bold tracking-tight">We are naming your team now.</h2>}
      </section>
      {aside}
    </div>
  );
}

// ---- What the page says now ------------------------------------------------------------------------------------------

function nowOf(room: Room, now: number): { title: string; line: string; progress: { label: string; done: number; total: number } | null } {
  const current = room.journey.find(step => step.state === "current");
  const line = current?.summary ?? "";
  if (room.stage === "assessment" && findingsAwaiting(room)) return { title: METHOD.findings, line: METHOD_MEANING.findings, progress: null };
  if (room.stage === "assessment") {
    const day = daysSince(room.assessmentStartedAt, now);
    const week = day === null ? 1 : Math.min(ASSESSMENT_WEEKS, Math.floor(day / 7) + 1);
    return { title: `${METHOD.currentState} · Week ${week} of ${ASSESSMENT_WEEKS}`, line, progress: day === null ? null : { label: `Day ${Math.min(ASSESSMENT_DAYS, day + 1)} of ${ASSESSMENT_DAYS}`, done: Math.min(ASSESSMENT_DAYS, day + 1), total: ASSESSMENT_DAYS } };
  }
  if (room.stage === "fix") {
    const day = daysSince(room.fixStartedAt, now);
    const week = Math.max(room.measure?.latest?.weekNumber ?? 1, day === null ? 1 : Math.min(FIX_WEEKS, Math.floor(day / 7) + 1));
    return { title: `${METHOD.fix} · Week ${week} of ${FIX_WEEKS}`, line, progress: { label: `Week ${week} of ${FIX_WEEKS}`, done: week, total: FIX_WEEKS } };
  }
  if (room.stage === "plan") return { title: METHOD.plan, line, progress: null };
  if (room.stage === "closed") return { title: `${METHOD.engagement} closed`, line, progress: null };
  return { title: "Getting set up", line, progress: null };
}

/** The Findings are out and the owner has not signed everything off yet: that, not the Work Plan, is where we are. */
const findingsAwaiting = (room: Room) => room.deliverables.some(item => ["findings", "problem_statement"].includes(item.kind) && !item.accepted);

type NextAction = { kind: "task"; task: Task; label: string } | { kind: "signoff"; deliverable: Deliverable; step: number } | { kind: "none" };

/** One thing at a time: the client's earliest open Data Request or action, else a Deliverable waiting for Sign-off. */
function nextActionOf(room: Room, isOwner: boolean): NextAction {
  const mine = room.tasks.filter(task => task.side === "client");
  const open = mine.filter(isOpen).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || (a.weekNumber ?? 99) - (b.weekNumber ?? 99) || a.sortOrder - b.sortOrder || a.id - b.id);
  if (open[0]) {
    const task = open[0];
    const requests = mine.filter(item => item.kind === "data_request");
    const label = task.kind === "data_request" ? `${METHOD.dataRequest} ${requests.findIndex(item => item.id === task.id) + 1} of ${requests.length}` : "Action";
    return { kind: "task", task, label };
  }
  if (isOwner) {
    const waiting = room.deliverables.find(item => !item.accepted && ["findings", "problem_statement", "prescription", "plan"].includes(item.kind));
    if (waiting) return { kind: "signoff", deliverable: waiting, step: stepForKind(waiting.kind) };
  }
  return { kind: "none" };
}

const stepForKind = (kind: Deliverable["kind"]) => (kind === "prescription" || kind === "tools" ? 6 : kind === "plan" ? 7 : 5);

// ---- The timeline ---------------------------------------------------------------------------------------------------

type Step = { n: number; title: string; state: StepState; when: string; summary: string; body?: React.ReactNode };

function stepsOf(room: Room, now: number): Step[] {
  const check = room.check;
  const isOwner = room.viewer.kind === "owner";
  const stageAt = ["setting_up", "assessment", "fix", "plan", "closed"].indexOf(room.stage);
  const byKind = (kinds: Deliverable["kind"][]) => room.deliverables.filter(item => kinds.includes(item.kind));
  const findings = byKind(["findings", "problem_statement", "other"]);
  const fixItems = byKind(["prescription", "tools"]);
  const planItems = byKind(["plan"]);
  const done = (when: string) => `Done · ${when}`;
  const span = (from: Date | string | null | undefined, days: number) => (from ? `${lagos(from, false)} to ${lagos(new Date(new Date(from).getTime() + (days - 1) * DAY), false)}` : "");

  const debriefHeld = Boolean(room.debrief || check?.callScheduledFor || check?.callRequestedAt);
  const debriefWhen = room.debrief?.heldAt ?? check?.callScheduledFor ?? null;
  const findingsState: StepState = findings.length ? (stageAt >= 2 || !findingsAwaiting(room) ? "done" : "now") : "next";
  const assessmentState: StepState = stageAt <= 1 && findingsState !== "now" ? "now" : "done";
  const fixState: StepState = room.stage === "fix" ? "now" : stageAt > 2 ? "done" : "next";
  const day30State: StepState = room.stage === "closed" ? "done" : room.stage === "plan" ? "now" : "next";

  return [
    {
      n: 1, title: METHOD.businessCheck, state: check?.completedAt ? "done" : "next", when: check?.completedAt ? done(lagos(check.completedAt, false)) : "Not finished", summary: METHOD_MEANING.businessCheck,
      body: check ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className={KICKER}>Main finding</dt><dd className="mt-1 font-medium">{check.primaryArea !== null ? AREA_NAMES[check.primaryArea] ?? `Area ${check.primaryArea}` : "Not yet"}</dd></div>
          <div><dt className={KICKER}>Readiness</dt><dd className="mt-1 font-medium">{check.readiness ? READINESS_LABELS[check.readiness] : "Not yet"}</dd></div>
        </dl>
      ) : null,
    },
    {
      n: 2, title: METHOD.debrief, state: debriefHeld ? "done" : "next", when: debriefHeld ? done(debriefWhen ? lagos(debriefWhen, false) : "held") : "Not held", summary: METHOD_MEANING.debrief,
      body: room.debrief ? (
        <div className="space-y-3 text-sm">
          {([["What we heard", room.debrief.heard], ["The problem, in your words", room.debrief.problemInOwnerWords], ["What success looks like", room.debrief.successLooksLike], ["What you have tried", room.debrief.tried], ["Next steps we agreed", room.debrief.nextSteps]] as const).filter(([, text]) => text).map(([label, text]) => (
            <div key={label}><p className={KICKER}>{label}</p><p className="mt-1 whitespace-pre-line">{text}</p></div>
          ))}
        </div>
      ) : <p className="text-sm text-ink-muted">Your {METHOD.debrief} notes appear here once your team shares them.</p>,
    },
    {
      n: 3, title: METHOD.fullReport, state: room.report?.deliveredAt ? "done" : "next", when: room.report?.deliveredAt ? done(lagos(room.report.deliveredAt, false)) : room.report ? `Requested · ${METHOD.reportIntake} to complete` : check?.reportRequestedAt ? `Requested · ${lagos(check.reportRequestedAt, false)}` : "Optional · not taken", summary: METHOD_MEANING.fullReport,
      body: room.report?.deliveredAt ? <p className="text-sm">Emailed to you on {lagos(room.report.deliveredAt, false)}. Reply to that email if you cannot find it.</p> : null,
    },
    {
      n: 4, title: METHOD.currentState, state: assessmentState, when: assessmentState === "done" ? done(span(room.assessmentStartedAt, ASSESSMENT_DAYS) || "two weeks") : room.assessmentStartedAt ? span(room.assessmentStartedAt, ASSESSMENT_DAYS) : "Starts once your team and both Sessions are set up", summary: METHOD_MEANING.currentState,
      body: <WorkPlan room={room} isOwner={isOwner} />,
    },
    {
      n: 5, title: METHOD.findings, state: findingsState, when: findings.length ? (findingsState === "done" ? done(lagos(findings[0].sharedAt, false)) : `Shared ${lagos(findings[0].sharedAt, false)}`) : `After ${METHOD.session} 2`, summary: METHOD_MEANING.findings,
      body: (
        <div className="space-y-4">
          {room.problemStatement && <div className="border-l-2 border-highlight-ink pl-3"><p className={KICKER}>{METHOD.problemStatement}</p><p className="mt-1 font-serif text-lg">{room.problemStatement}</p></div>}
          {findings.length ? <ul className="space-y-4">{findings.map(item => <DeliverableItem key={item.id} item={item} isOwner={isOwner} />)}</ul> : <p className="text-sm text-ink-muted">{room.nextSession ? `${METHOD.session} notes reach you the same day as each ${METHOD.session}. The ${METHOD.findings} follow ${METHOD.session} 2.` : `The ${METHOD.findings} follow the second ${METHOD.session}.`}</p>}
        </div>
      ),
    },
    {
      n: 6, title: METHOD.fix, state: fixState, when: fixState === "done" ? done(span(room.fixStartedAt, FIX_WEEKS * 7) || `${FIX_WEEKS} weeks`) : room.fixStartedAt ? span(room.fixStartedAt, FIX_WEEKS * 7) : `${FIX_WEEKS} weeks, after your ${METHOD.signOff}`, summary: METHOD_MEANING.fix,
      body: (
        <div className="space-y-4">
          {room.measure && <MeasureCard measure={room.measure} />}
          {fixItems.length > 0 && <ul className="space-y-4">{fixItems.map(item => <DeliverableItem key={item.id} item={item} isOwner={isOwner} />)}</ul>}
          <CheckinSessions room={room} isOwner={isOwner} />
        </div>
      ),
    },
    {
      n: 7, title: METHOD.day30, state: day30State, when: room.closedAt ? lagos(new Date(new Date(room.closedAt).getTime() + 30 * DAY), false) : `30 days after ${METHOD.fix} ends`, summary: METHOD_MEANING.day30,
      body: planItems.length ? <ul className="space-y-4">{planItems.map(item => <DeliverableItem key={item.id} item={item} isOwner={isOwner} />)}</ul> : null,
    },
  ];
}

// ---- The Work Plan --------------------------------------------------------------------------------------------------

type PlanRow = { key: string; order: number; title: string; who: keyof typeof WHO; when: string; status: "done" | "open" | "needs_more" | "submitted"; factor: Task["factor"] | null; task?: Task; session?: Session };

function planRows(room: Room, week: number | null): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const task of room.tasks.filter(item => (item.weekNumber ?? null) === week)) {
    rows.push({ key: `t${task.id}`, order: task.sortOrder, title: task.title, who: task.side === "client" ? "You" : "IP Factory", when: isOpen(task) ? dueText(task.dueOn) : task.statusLabel, status: task.status === "needs_more" ? "needs_more" : task.status === "received" ? "submitted" : isOpen(task) ? "open" : "done", factor: task.factor, task });
  }
  for (const session of room.sessions.filter(item => (item.weekNumber ?? null) === week && item.status !== "cancelled")) {
    rows.push({ key: `s${session.id}`, order: session.sortOrder, title: session.title, who: "Together", when: session.scheduledFor ? lagos(session.scheduledFor) : "To be booked", status: session.status === "held" ? "done" : "open", factor: null, session });
  }
  return rows.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

function WorkPlan({ room, isOwner }: { room: Room; isOwner: boolean }) {
  const weeks = Array.from(new Set([...room.tasks.map(task => task.weekNumber ?? null), ...room.sessions.filter(item => item.status !== "cancelled").map(item => item.weekNumber ?? null)])).sort((a, b) => (a ?? 99) - (b ?? 99));
  if (!weeks.length) return <p className="text-sm text-ink-muted">Your {METHOD.workPlan} appears here once your team sets it.</p>;
  return (
    <div className="space-y-4">
      <p className={KICKER}>{METHOD.workPlan}</p>
      {weeks.map(week => (
        <div key={week ?? "none"}>
          <p className="text-xs font-semibold uppercase tracking-widest text-ink">{week === null ? "Also" : `Week ${week}`}</p>
          <ol className="mt-1" aria-label={week === null ? "Also in the plan" : `Week ${week}`}>
            {planRows(room, week).map(row => <PlanRowView key={row.key} row={row} room={room} isOwner={isOwner} />)}
          </ol>
        </div>
      ))}
    </div>
  );
}

function PlanRowView({ row, room, isOwner }: { row: PlanRow; room: Room; isOwner: boolean }) {
  const finished = row.status === "done" || row.status === "submitted";
  return (
    <li className={`flex gap-3 border-t border-line-soft py-3 ${finished ? "text-ink-muted" : ""}`} aria-label={row.title}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold ${row.status === "done" ? "border-brand bg-brand text-white" : row.status === "open" || row.status === "needs_more" ? "border-brand text-brand" : "border-line text-ink-muted"}`}>{row.status === "done" ? <Check className="h-3.5 w-3.5" aria-hidden /> : row.order}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${row.status === "done" ? "line-through decoration-line-strong" : "text-ink"}`}>{row.title}{row.task?.mine ? <span className="ml-2 text-xs font-normal text-brand">for you</span> : null}</span>
          <span className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${WHO[row.who]}`}>{row.who}</span>
          {row.factor && <span className="text-[10px] uppercase tracking-wider text-ink-faint">{row.factor}</span>}
        </div>
        <p className="text-xs text-ink-muted">{row.when}</p>
        {row.task && (
          <>
            {row.task.detail && !finished && <p className="mt-1 text-sm text-ink-muted">{row.task.detail}</p>}
            {row.status === "needs_more" && row.task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {row.task.statusNote}</p>}
            <FileList files={row.task.files} />
            {row.task.side === "client" && isOpen(row.task) && <TaskControls task={row.task} uploadsEnabled={room.uploadsEnabled} />}
          </>
        )}
        {row.session && (
          <>
            {row.session.status === "planned" && row.session.agenda && <p className="mt-1 whitespace-pre-line text-xs text-ink-muted">{row.session.agenda}</p>}
            {row.session.status === "planned" && row.session.meetingLink && <a href={row.session.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand underline underline-offset-2">Join the {METHOD.session}</a>}
            {row.session.notes && (
              <article className="mt-2 border border-line-soft bg-paper p-3 text-ink">
                <p className={KICKER}>{METHOD.session} notes{isOwner && row.session.notesAudience === "owner" ? " · only you can see these" : ""}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{row.session.notes}</p>
                {isOwner && <AudienceToggle item="notes" id={row.session.id} audience={row.session.notesAudience ?? "owner"} />}
              </article>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** The Weekly Check-ins of The Fix, with their notes, outside the two-week Work Plan. */
function CheckinSessions({ room, isOwner }: { room: Room; isOwner: boolean }) {
  const rows = room.sessions.filter(item => item.status !== "cancelled" && (item.weekNumber === null || item.weekNumber > ASSESSMENT_WEEKS));
  if (!rows.length) return null;
  return (
    <div>
      <p className={KICKER}>{METHOD.checkin}s</p>
      <ol className="mt-1" aria-label="Weekly Check-ins">
        {rows.map(session => <PlanRowView key={session.id} row={{ key: `s${session.id}`, order: session.sortOrder, title: session.title, who: "Together", when: session.scheduledFor ? lagos(session.scheduledFor) : "To be booked", status: session.status === "held" ? "done" : "open", factor: null, session }} room={room} isOwner={isOwner} />)}
      </ol>
    </div>
  );
}

// ---- The Measure of Success -----------------------------------------------------------------------------------------

/** Which way the number has moved since the start, and whether that is the way we want. */
function trendOf(measure: NonNullable<Room["measure"]>) {
  const latest = measure.latest?.reading;
  const base = measure.baselineValue;
  if (latest === null || latest === undefined || base === null || base === undefined) return { tone: "", text: `The first reading comes with the first ${METHOD.checkin}.` };
  const diff = Number(latest) - Number(base);
  if (!Number.isFinite(diff) || diff === 0) return { tone: "", text: "No change yet since the start." };
  const wantUp = measure.targetValue === null || measure.targetValue === undefined ? diff > 0 : Number(measure.targetValue) >= Number(base);
  const good = wantUp ? diff > 0 : diff < 0;
  return { tone: good ? "text-health-clear" : "text-health-watch", text: `${diff > 0 ? "Up" : "Down"} ${formatMeasure(Math.abs(diff), measure.unit)} since the start.` };
}

function MeasureCard({ measure }: { measure: NonNullable<Room["measure"]> }) {
  const trend = trendOf(measure);
  return (
    <section aria-labelledby="the-number" className="border border-line-soft bg-paper p-4">
      <p className={KICKER}>{METHOD.measure}</p>
      <h3 id="the-number" className="mt-1 font-serif text-xl font-bold tracking-tight">{measure.name}</h3>
      {measure.definition && <p className="mt-1 text-sm text-ink-muted">{measure.definition}</p>}
      <p className={`mt-4 font-serif text-4xl font-black tracking-tight tabular-nums ${trend.tone}`}>{formatMeasure(measure.latest?.reading ?? measure.baselineValue, measure.unit)}</p>
      <p className="text-xs text-ink-muted">{measure.latest ? `Week ${measure.latest.weekNumber}` : "Where it starts"}</p>
      <p className={`mt-1 text-sm ${trend.tone}`}>{trend.text}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="border border-line-soft p-3"><dt className={KICKER}>Started at</dt><dd className="mt-1 font-serif text-lg tabular-nums">{formatMeasure(measure.baselineValue, measure.unit)}</dd></div>
        <div className="border border-brand-line bg-brand-tint p-3"><dt className={KICKER}>Going to</dt><dd className="mt-1 font-serif text-lg tabular-nums">{formatMeasure(measure.targetValue, measure.unit)}</dd></div>
      </dl>
      {measure.readings.length > 0 && (
        <table className="mt-4 w-full text-left text-sm" aria-label="Week by week">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted"><th className="py-1 pr-3">Week</th><th className="pr-3">Reading</th><th>Next step</th></tr></thead>
          <tbody>{measure.readings.map(row => <tr key={row.weekNumber} className="border-b border-line-soft align-top"><td className="py-1 pr-3">{row.weekNumber}{row.heldOn ? <span className="block text-xs text-ink-muted">{dateOnly(row.heldOn)}</span> : null}</td><td className="pr-3 tabular-nums">{formatMeasure(row.reading, measure.unit)}</td><td className="whitespace-pre-line">{row.nextStep ?? ""}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}

// ---- Acting in place ------------------------------------------------------------------------------------------------

function useRoomRefresh() {
  const utils = trpc.useUtils();
  return { onSuccess: () => void utils.engagement.client.room.invalidate(), onError: (error: { message: string }) => toast.error(error.message) };
}

/** Request a place for the file, send it there from the browser, then tell the server it arrived. */
function useClientUpload(taskId: number) {
  const refresh = useRoomRefresh();
  const request = trpc.engagement.client.requestUpload.useMutation();
  const confirm = trpc.engagement.client.confirmUpload.useMutation();
  const [busy, setBusy] = useState(false);
  const send = async (file: File, note: string) => {
    setBusy(true);
    try {
      const meta = { fileName: file.name, contentType: file.type, sizeBytes: file.size };
      const ticket = await request.mutateAsync({ taskId, ...meta });
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
      if (!put.ok) throw new Error("The upload did not finish. Check your connection and try again.");
      await confirm.mutateAsync({ taskId, storageKey: ticket.storageKey, note: note || null, ...meta });
      refresh.onSuccess();
      toast.success("Thank you, we have your file. We will tell you if we need more.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload did not finish.");
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}

/** Files on an item, each opened through a short-lived link the server issues after checking who is asking. */
function FileList({ files }: { files: RoomFile[] }) {
  const link = trpc.engagement.client.fileLink.useMutation({ onError: error => toast.error(error.message) });
  if (!files.length) return null;
  return (
    <ul className="mt-2 space-y-1" aria-label="Files">
      {files.map(file => (
        <li key={file.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Paperclip className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
          <span>{file.fileName}</span>
          <span className="text-xs text-ink-muted">{formatFileSize(file.sizeBytes)}{file.fromTeam ? " · from your team at IP Factory" : file.mine ? " · you" : ""}</span>
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand underline underline-offset-2" disabled={link.isPending} onClick={() => link.mutateAsync({ fileId: file.id }).then(result => window.open(result.url, "_blank", "noopener"))}>
            <Download className="h-3.5 w-3.5" aria-hidden />Download
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Upload, or mark as submitted with a note on how it was sent; "Mark as done" for an action. */
function TaskControls({ task, uploadsEnabled, due }: { task: Task; uploadsEnabled: boolean; due?: boolean }) {
  const refresh = useRoomRefresh();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const respond = trpc.engagement.client.respondToTask.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success(task.kind === "data_request" ? "Thank you. We will check it and tell you if we need more." : "Marked as done."); } });
  const upload = useClientUpload(task.id);
  const canUpload = uploadsEnabled && task.kind === "data_request";
  if (asking) {
    return (
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input aria-label={`How you sent ${task.title}`} className="w-full border border-line bg-white px-2 py-1.5 text-sm" placeholder={task.kind === "data_request" ? "How you sent it, e.g. on WhatsApp (optional)" : "Anything we should know (optional)"} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
        <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={respond.isPending} onClick={() => respond.mutate({ taskId: task.id, note })}>Confirm</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {canUpload && (
        <label className={`inline-flex cursor-pointer items-center gap-1.5 border border-brand bg-brand px-3 py-1.5 text-xs font-medium text-white ${upload.busy ? "opacity-60" : ""}`}>
          <Paperclip className="h-3.5 w-3.5" aria-hidden />{upload.busy ? "Uploading…" : "Upload a file"}
          <input type="file" className="sr-only" accept={UPLOAD_ACCEPT} disabled={upload.busy} aria-label={`Upload a file for ${task.title}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload.send(file, ""); }} />
        </label>
      )}
      <Button type="button" size="sm" variant={canUpload ? "outline" : "default"} className={canUpload ? "rounded-none text-xs" : "rounded-none bg-brand text-xs text-white"} onClick={() => setAsking(true)}>{task.kind === "data_request" ? (canUpload ? "Sent another way" : "Mark as submitted") : "Mark as done"}</Button>
      {due && task.dueOn && <span className="text-xs text-ink-muted">{dueText(task.dueOn)}</span>}
      {canUpload && <span className="text-xs text-ink-muted">PDF, photos or spreadsheets, up to {UPLOAD_MAX_MB} MB.</span>}
    </div>
  );
}

function DeliverableItem({ item, isOwner }: { item: Deliverable; isOwner: boolean }) {
  const refresh = useRoomRefresh();
  const [comment, setComment] = useState("");
  const accept = trpc.engagement.client.accept.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success(`${METHOD.signOff} recorded. Thank you.`); } });
  const addComment = trpc.engagement.client.comment.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setComment(""); } });
  return (
    <li className="border border-line-soft bg-paper p-3" aria-label={item.title}>
      <p className={KICKER}>{item.kindLabel}</p>
      <h4 className="font-semibold">{item.title}</h4>
      <p className="text-xs text-ink-muted">Shared {lagos(item.sharedAt, false)}{isOwner && item.audience === "owner" ? " · only you can see this" : ""}</p>
      {item.summary && <p className="mt-2 whitespace-pre-line text-sm">{item.summary}</p>}
      <FileList files={item.files} />
      {item.comments.length > 0 && <ul className="mt-3 space-y-1 border-t border-line-soft pt-2">{item.comments.map((entry, index) => <li key={index} className="text-sm"><span className="font-medium">{entry.authorName}</span>: {entry.body}</li>)}</ul>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input aria-label={`Your comment on ${item.title}`} className="w-full border border-line bg-white px-2 py-1.5 text-sm" placeholder="Ask a question or add a comment" value={comment} maxLength={4000} onChange={event => setComment(event.target.value)} />
        <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ deliverableId: item.id, body: comment })}>Send</Button>
      </div>
      {isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {item.accepted ? <span className="text-sm font-semibold text-brand">{METHOD.signOff} given</span> : <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={accept.isPending} onClick={() => accept.mutate({ deliverableId: item.id })}>Sign off the {item.kindLabel}</Button>}
          <AudienceToggle item="deliverable" id={item.id} audience={item.audience} />
        </div>
      )}
    </li>
  );
}

/** Only the owner decides whether their staff see an item. */
function AudienceToggle({ item, id, audience }: { item: "notes" | "deliverable"; id: number; audience: "owner" | "business" | "team" }) {
  const refresh = useRoomRefresh();
  const set = trpc.engagement.client.setAudience.useMutation(refresh);
  const shared = audience === "business";
  return (
    <button type="button" className="text-xs font-semibold text-brand underline underline-offset-2" disabled={set.isPending} onClick={() => set.mutate({ item, id, audience: shared ? "owner" : "business" })}>
      {shared ? "Keep this to myself" : "Share with my team"}
    </button>
  );
}
