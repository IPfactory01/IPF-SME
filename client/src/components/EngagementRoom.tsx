import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { READINESS_LABELS } from "@shared/businessCheck/engine";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import { ASSESSMENT_DAYS, ASSESSMENT_WEEKS, FIX_WEEKS, formatFileSize, formatMeasure, OPEN_TASK_STATUSES, UPLOAD_ACCEPT, UPLOAD_MAX_MB } from "@shared/engagement";
import { METHOD, METHOD_MEANING } from "@shared/method";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRight, CalendarClock, Check, ChevronDown, Download, Paperclip } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";
import { BRAND } from "@shared/brand";
import { toast } from "sonner";
import { useWide } from "@/hooks/useWide";
import { BusinessPanel, FounderPanel } from "./room/RoomInsight";
import RoomTabs from "./room/RoomTabs";
import TaskDetail from "./TaskDetail";
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

const CARD = "rounded-xl border border-line-soft bg-white p-5";
const KICKER = "text-sm font-medium text-ink-muted";
const EYEBROW = "text-xs font-medium text-brand";
const WHO: Record<"You" | "IP Factory" | "Together", string> = { You: "border-brand-line bg-brand-tint text-brand", "IP Factory": "border-line bg-paper-muted text-ink-muted", Together: "border-line bg-paper-muted text-ink-600" };
const isOpen = (task: Task) => OPEN_TASK_STATUSES.includes(task.status);

/**
 * The client's room, as the room brief (document 07) describes it: now, the next action, the next Session, then the
 * Engagement timeline numbered one to seven with the current step open. One column on a phone; on a laptop or desktop
 * it spreads like the site: where you are beside what to do next, and the timeline beside a column that stays in view
 * with the team, what is waiting on you and the Deliverables. Everything shown here was filtered on the server for
 * this person; this screen decides nothing about access.
 */
export default function EngagementRoom({ room, aside, account, now = Date.now() }: { room: Room; aside?: React.ReactNode; account?: RoomAccount; now?: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const isOwner = room.viewer.kind === "owner";
  const here = nowOf(room, now);
  const action = nextActionOf(room, isOwner);
  const steps = stepsOf(room, now);
  const current = steps.find(step => step.state === "now")?.n ?? null;
  const shown = (n: number) => (open === null ? n === current : open === n);
  const wide = useWide();
  const timeline = (
        <section aria-labelledby="timeline-title">
          <p className={KICKER}>{METHOD.engagement} timeline</p>
          <h2 id="timeline-title" className="mt-1 font-sans text-lg font-semibold tracking-tight">{METHOD.businessCheck} to {METHOD.day30}</h2>
          <ol className="mt-4" aria-label="Engagement timeline">
            {steps.map((step, index) => {
              const last = index === steps.length - 1;
              const tone = step.state === "done" ? "border-health-clear bg-health-clear text-white" : step.state === "now" ? "border-brand-plum bg-brand-plum text-white" : "border-line bg-white text-ink-muted";
              return (
                <li key={step.n} id={`step-${step.n}`} aria-current={step.state === "now" ? "step" : undefined} className="relative flex gap-4 scroll-mt-24">
                  {!last && <span aria-hidden className={`absolute left-[15px] top-8 h-full w-px ${step.state === "done" ? "bg-health-clear" : "bg-line"}`} />}
                  <span className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums ${tone}`}>{step.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : step.n}</span>
                  <div className={`min-w-0 flex-1 pb-6 ${step.state === "next" ? "opacity-80" : ""}`}>
                    <button type="button" aria-expanded={shown(step.n)} onClick={() => setOpen(shown(step.n) ? -1 : step.n)} className="flex w-full items-start justify-between gap-3 text-left">
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`font-sans text-base font-medium ${step.state === "next" ? "text-ink-muted" : ""}`}>{step.title}</span>
                          {step.state === "now" && <span className={EYEBROW}>Now</span>}
                        </span>
                        <span className="block text-xs text-ink-muted">{step.when}</span>
                      </span>
                      <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform ${shown(step.n) ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                    {shown(step.n) && (
                      <div className="mt-3 border border-line-soft bg-paper-raised p-4" role="region" aria-label={`Step ${step.n}: ${step.title}`}>
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
  );
  const counts = roomCounts(room);
  const card = "rounded-xl border border-line-soft bg-white p-5";
  const label = "text-xs font-medium text-ink-muted";

  const nextAction = (
    <section aria-labelledby="next-action" className="rounded-xl border border-brand-line bg-brand-tint p-5 lg:col-span-2">
      <p id="next-action" className="text-xs font-semibold text-brand">Next action{action.kind === "task" ? ` · ${action.label}` : ""}</p>
      {action.kind === "task" && (
        <>
          <p className="mt-2 text-lg font-semibold tracking-tight">{action.task.title}</p>
          {action.task.detail && <TaskDetail text={action.task.detail} className="mt-1 text-sm text-ink-600" />}
          {action.task.status === "needs_more" && action.task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {action.task.statusNote}</p>}
          <TaskControls task={action.task} uploadsEnabled={room.uploadsEnabled} due />
        </>
      )}
      {action.kind === "signoff" && (
        <>
          <p className="mt-2 text-lg font-semibold tracking-tight">Read the {action.deliverable.kindLabel} and give your {METHOD.signOff}</p>
          <p className="mt-1 text-sm text-ink-600">{METHOD_MEANING.signOff} If you disagree, say so in a comment under it.</p>
          <a href={`#step-${action.step}`} onClick={() => setOpen(action.step)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand underline underline-offset-2">Open the {action.deliverable.kindLabel} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
        </>
      )}
      {action.kind === "none" && <p className="mt-2 text-sm text-ink-600">Nothing outstanding. We will tell you here when there is.</p>}
    </section>
  );

  const nextMeeting = (
    <section aria-labelledby="next-meeting" className={card}>
      <p id="next-meeting" className={label}>Next meeting</p>
      {room.nextSession ? (
        <>
          <p className="mt-2 text-lg font-semibold tracking-tight">{room.nextSession.title}</p>
          <p className="mt-1 text-sm text-ink-600">{lagos(room.nextSession.scheduledFor)} (Lagos time){room.nextSession.durationMinutes ? `, ${room.nextSession.durationMinutes} minutes` : ""}</p>
          {room.nextSession.meetingLink && <a href={room.nextSession.meetingLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand underline underline-offset-2"><CalendarClock className="h-4 w-4" aria-hidden />Join the {METHOD.session}</a>}
        </>
      ) : room.booking ? (
        <>
          <p className="mt-2 text-sm text-ink-600">Pick a time on Calendly. It shows here, with the Join link, once you have booked.</p>
          <a href={room.booking.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-deep-hover">Book {room.booking.title}</a>
        </>
      ) : <p className="mt-2 text-sm text-ink-600">No {METHOD.session} is booked yet. It will show here with a Join link once it is.</p>}
    </section>
  );

  const team = (
    <section aria-labelledby="team-title" className={card}>
      <h2 id="team-title" className={`font-sans ${label}`}>Your team</h2>
      {room.team.length ? (
        <ul className="mt-3 space-y-3">
          {room.team.map(member => (
            <li key={`${member.name}-${member.roleLabel}`} className="flex items-center gap-3">
              <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColour(member.name)}`}>{initials(member.name)}</span>
              <span className="min-w-0"><span className="block font-medium text-ink">{member.name}</span><span className="block text-xs text-ink-muted">{member.roleLabel}{member.jobTitle ? ` · ${member.jobTitle}` : ""}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-ink-600">We are naming your team now.</p>}
    </section>
  );

  const overview = (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">{nextAction}{nextMeeting}</div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className={`${card} lg:col-span-2`}>{timeline}</div>
        <aside aria-label="At a glance" className="space-y-5">
          <WaitingOnYou room={room} isOwner={isOwner} onOpen={setOpen} />
          <DeliverablesCard room={room} isOwner={isOwner} onOpen={setOpen} />
          {team}
          {aside}
        </aside>
      </div>
    </div>
  );

  // The same frame for every client: the views below, in this order. Founder and Business appear only when a Business
  // Health Check or Full Report is behind the room (the server sends no insight to limited-access staff).
  const tabs = [
    { id: "overview", label: "Overview", content: overview },
    { id: "plan", label: "List", count: counts.waiting ? { value: counts.waiting, label: `${counts.waiting} waiting on you` } : undefined, content: <PlanView room={room} now={now} /> },
    { id: "meetings", label: "Schedule", content: <MeetingsView room={room} now={now} /> },
    ...(counts.dataRequests ? [{ id: "data", label: "Data requests", content: <DataRequestsView room={room} now={now} /> }] : []),
    { id: "deliverables", label: "Documents", content: <DeliverablesView room={room} isOwner={isOwner} /> },
    ...(room.insight ? [
      { id: "founder", label: "Founder", content: <FounderPanel insight={room.insight} /> },
      { id: "business", label: "Business", count: stuckCount(room.insight), content: <BusinessPanel insight={room.insight} /> },
    ] : []),
  ];

  const header = (
    <section aria-labelledby="room-title" className="border-b border-line-soft bg-white px-4 pt-5 pb-4 sm:px-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-muted"><span>{room.businessName}</span><span aria-hidden className="px-1.5">/</span><span>{room.stageLabel}</span></p>
          <h1 id="room-title" className="mt-1 font-sans text-2xl font-semibold tracking-tight">{here.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">{here.line}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          {here.progress && (
            <div className="w-56">
              <div className="flex justify-between gap-3 text-xs"><span className="font-medium text-ink">{here.progress.label}</span><span className="text-ink-muted tabular-nums">{Math.round((here.progress.done / here.progress.total) * 100)}%</span></div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken" role="progressbar" aria-label={here.progress.label} aria-valuenow={here.progress.done} aria-valuemin={0} aria-valuemax={here.progress.total}>
                <div className="h-full rounded-full bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" style={{ width: `${Math.min(100, (here.progress.done / here.progress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {room.team.length > 0 && (
            <div className="flex" aria-label={`Team: ${room.team.map(member => member.name).join(", ")}`}>
              {room.team.map(member => <span key={`${member.name}-${member.roleLabel}`} title={`${member.name}, ${member.roleLabel}`} aria-hidden className={`-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-[11px] font-medium text-white first:ml-0 ${avatarColour(member.name)}`}>{initials(member.name)}</span>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      {wide && <RoomSidebar room={room} tabs={tabs} account={account} />}
      <div className="min-w-0 flex-1">
        <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
        {!wide && <RoomTopBar account={account} />}
        {header}
        <RoomTabs label="Your engagement" initial="overview" tabs={tabs} />
      </div>
    </div>
  );
}

const stuckCount = (insight: NonNullable<Room["insight"]>) => {
  const value = insight.areas.filter(area => area.health === "stuck").length;
  return { value, label: `${value} stuck` };
};

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
const SIGN_OFF_KINDS: Deliverable["kind"][] = ["findings", "problem_statement", "prescription", "plan"];

// ---- The column beside the timeline on a wide screen ------------------------------------------------------------------

/** Everything the client owes, earliest first, with a way into the Work Plan where each one is answered. */
function WaitingOnYou({ room, isOwner, onOpen }: { room: Room; isOwner: boolean; onOpen: (step: number) => void }) {
  const open = room.tasks.filter(task => task.side === "client" && isOpen(task))
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || (a.weekNumber ?? 99) - (b.weekNumber ?? 99) || a.sortOrder - b.sortOrder || a.id - b.id);
  const signOffs = isOwner ? room.deliverables.filter(item => !item.accepted && SIGN_OFF_KINDS.includes(item.kind)) : [];
  const count = open.length + signOffs.length;
  const shown = open.slice(0, 5);
  return (
    <section aria-labelledby="waiting-title" className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="waiting-title" className={`font-sans ${KICKER}`}>Waiting on you</h2>
        <span className="text-2xl font-medium tabular-nums text-ink">{count}</span>
      </div>
      {count === 0 ? <p className="mt-2 text-sm text-ink-600">Nothing outstanding. We will tell you here when there is.</p> : (
        <ul className="mt-2 divide-y divide-line-soft text-sm">
          {signOffs.map(item => (
            <li key={`d${item.id}`} className="py-2.5">
              <a href={`#step-${stepForKind(item.kind)}`} onClick={() => onOpen(stepForKind(item.kind))} className="font-medium text-ink hover:text-brand">Your {METHOD.signOff} on the {item.kindLabel}</a>
              <p className="text-xs text-ink-muted">Shared {lagos(item.sharedAt, false)}</p>
            </li>
          ))}
          {shown.map(task => (
            <li key={task.id} className="py-2.5">
              <a href="#step-4" onClick={() => onOpen(4)} className="font-medium text-ink hover:text-brand">{task.title}</a>
              <p className={`text-xs ${task.status === "needs_more" ? "text-danger" : "text-ink-muted"}`}>
                {task.kind === "data_request" ? METHOD.dataRequest : "Action"}{task.dueOn ? ` · ${dueText(task.dueOn)}` : ""}{task.status === "needs_more" ? ` · ${task.statusLabel}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {open.length > shown.length && <a href="#step-4" onClick={() => onOpen(4)} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand underline underline-offset-2">{open.length - shown.length} more in the {METHOD.workPlan} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>}
    </section>
  );
}

/** What the client has received so far, each with its Sign-off state, and a way to the step that holds it. */
function DeliverablesCard({ room, isOwner, onOpen }: { room: Room; isOwner: boolean; onOpen: (step: number) => void }) {
  return (
    <section aria-labelledby="deliverables-title" className={CARD}>
      <h2 id="deliverables-title" className={`font-sans ${KICKER}`}>{METHOD.deliverables}</h2>
      {room.deliverables.length === 0 && !room.report?.deliveredAt ? (
        <p className="mt-2 text-sm text-ink-600">Your {METHOD.findings}, {METHOD.prescription} and {METHOD.plan} appear here once they are shared with you.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-soft text-sm">
          {room.report?.deliveredAt && (
            <li className="flex items-start justify-between gap-3 py-2.5">
              <span><a href="#step-3" onClick={() => onOpen(3)} className="font-medium text-ink hover:text-brand">{METHOD.fullReport}</a><span className="block text-xs text-ink-muted">Emailed {lagos(room.report.deliveredAt, false)}</span></span>
            </li>
          )}
          {room.deliverables.map(item => {
            const needsSignOff = SIGN_OFF_KINDS.includes(item.kind);
            const state = !needsSignOff ? null : item.accepted ? "Signed off" : isOwner ? "Your Sign-off" : "Awaiting Sign-off";
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <a href={`#step-${stepForKind(item.kind)}`} onClick={() => onOpen(stepForKind(item.kind))} className="font-medium text-ink hover:text-brand">{item.kindLabel}</a>
                  <span className="block text-xs text-ink-muted">{item.title} · Shared {lagos(item.sharedAt, false)}</span>
                </span>
                {state && <span className={`shrink-0 border px-1.5 py-0.5 text-xs font-medium ${item.accepted ? "border-line bg-paper-muted text-ink-600" : "border-brand-line bg-brand-tint text-brand"}`}>{state}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

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
      n: 2, title: METHOD.discoveryCall, state: debriefHeld ? "done" : "next", when: debriefHeld ? done(debriefWhen ? lagos(debriefWhen, false) : "held") : "Not held", summary: METHOD_MEANING.discoveryCall,
      body: room.debrief ? (
        <div className="space-y-3 text-sm">
          {([["What we heard", room.debrief.heard], ["The problem, in your words", room.debrief.problemInOwnerWords], ["What success looks like", room.debrief.successLooksLike], ["What you have tried", room.debrief.tried], ["Next steps we agreed", room.debrief.nextSteps]] as const).filter(([, text]) => text).map(([label, text]) => (
            <div key={label}><p className={KICKER}>{label}</p><p className="mt-1 whitespace-pre-line">{text}</p></div>
          ))}
        </div>
      ) : <p className="text-sm text-ink-muted">Your {METHOD.discoveryCall} notes appear here once your team shares them.</p>,
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
      n: 7, title: METHOD.day30, state: day30State, when: room.closedAt ? lagos(new Date(new Date(room.closedAt).getTime() + 30 * DAY), false) : `30 days after the ${METHOD.fix} ends`, summary: METHOD_MEANING.day30,
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
          <p className="text-sm font-medium text-ink">{week === null ? "Also" : `Week ${week}`}</p>
          <ol className="mt-1" aria-label={week === null ? "Also in the plan" : `Week ${week}`}>
            {planRows(room, week).map((row, index) => <PlanRowView key={row.key} row={row} number={index + 1} room={room} isOwner={isOwner} />)}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** One line of the Work Plan, numbered by its place in the week (the stored sort order can have gaps). */
function PlanRowView({ row, number, room, isOwner }: { row: PlanRow; number: number; room: Room; isOwner: boolean }) {
  const finished = row.status === "done" || row.status === "submitted";
  return (
    <li className={`flex gap-3 border-t border-line-soft py-3 ${finished ? "text-ink-muted" : ""}`} aria-label={row.title}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold ${row.status === "done" ? "border-brand bg-brand text-white" : row.status === "open" || row.status === "needs_more" ? "border-brand text-brand" : "border-line text-ink-muted"}`}>{row.status === "done" ? <Check className="h-3.5 w-3.5" aria-hidden /> : number}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${row.status === "done" ? "line-through decoration-line-strong" : "text-ink"}`}>{row.title}{row.task?.mine ? <span className="ml-2 text-xs font-normal text-brand">for you</span> : null}</span>
          <span className={`border px-1.5 py-0.5 text-xs font-medium ${WHO[row.who]}`}>{row.who}</span>
        </div>
        <p className="text-xs text-ink-muted">{row.when}</p>
        {row.task && (
          <>
            {row.task.detail && !finished && <TaskDetail text={row.task.detail} className="mt-1 text-sm text-ink-muted" />}
            {row.status === "needs_more" && row.task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {row.task.statusNote}</p>}
            <FileList files={row.task.files} />
            {row.task.side === "client" && isOpen(row.task) && <TaskControls task={row.task} uploadsEnabled={room.uploadsEnabled} />}
          </>
        )}
        {row.session && (
          <>
            {row.session.status === "planned" && row.session.agenda && <p className="mt-1 whitespace-pre-line text-xs text-ink-muted">{row.session.agenda}</p>}
            {row.session.status === "planned" && row.session.meetingLink && <a href={row.session.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand underline underline-offset-2">Join the {METHOD.session}</a>}
            {room.booking?.sessionId === row.session.id && <a href={room.booking.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand underline underline-offset-2">Book this {METHOD.session} on Calendly</a>}
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

/** The Weekly Check-ins of the Six-Week Fix, with their notes, outside the two-week Work Plan. */
function CheckinSessions({ room, isOwner }: { room: Room; isOwner: boolean }) {
  const rows = room.sessions.filter(item => item.status !== "cancelled" && (item.weekNumber === null || item.weekNumber > ASSESSMENT_WEEKS));
  if (!rows.length) return null;
  return (
    <div>
      <p className={KICKER}>{METHOD.checkin}s</p>
      <ol className="mt-1" aria-label="Weekly Check-ins">
        {rows.map((session, index) => <PlanRowView key={session.id} number={index + 1} row={{ key: `s${session.id}`, order: session.sortOrder, title: session.title, who: "Together", when: session.scheduledFor ? lagos(session.scheduledFor) : "To be booked", status: session.status === "held" ? "done" : "open", factor: null, session }} room={room} isOwner={isOwner} />)}
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
      <h3 id="the-number" className="mt-1 font-serif text-xl font-normal tracking-tight">{measure.name}</h3>
      {measure.definition && <p className="mt-1 text-sm text-ink-muted">{measure.definition}</p>}
      <p className={`mt-4 font-serif text-4xl font-normal tracking-tight tabular-nums ${trend.tone}`}>{formatMeasure(measure.latest?.reading ?? measure.baselineValue, measure.unit)}</p>
      <p className="text-xs text-ink-muted">{measure.latest ? `Week ${measure.latest.weekNumber}` : "Where it starts"}</p>
      <p className={`mt-1 text-sm ${trend.tone}`}>{trend.text}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="border border-line-soft p-3"><dt className={KICKER}>Started at</dt><dd className="mt-1 font-serif text-lg tabular-nums">{formatMeasure(measure.baselineValue, measure.unit)}</dd></div>
        <div className="border border-brand-line bg-brand-tint p-3"><dt className={KICKER}>Going to</dt><dd className="mt-1 font-serif text-lg tabular-nums">{formatMeasure(measure.targetValue, measure.unit)}</dd></div>
      </dl>
      {measure.readings.length > 0 && (
        <table className="mt-4 w-full text-left text-sm" aria-label="Week by week">
          <thead><tr className="border-b border-line text-xs text-ink-muted"><th className="py-1 pr-3">Week</th><th className="pr-3">Reading</th><th>Next step</th></tr></thead>
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
    <li className="rounded-xl border border-line-soft bg-white p-4" aria-label={item.title}>
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

// ---- The frame's views (the same for every client) ---------------------------------------------------------------------

type RoomTab = { id: string; label: string; count?: { value: number; label: string } };

const isClientOpen = (task: Task) => task.side === "client" && OPEN_TASK_STATUSES.includes(task.status);

function roomCounts(room: Room) {
  return {
    waiting: room.tasks.filter(isClientOpen).length,
    dataRequests: room.tasks.filter(task => task.kind === "data_request").length,
  };
}

/** "Due in 3 days", "Due today", "Overdue by 2 days" or "Done": the timing flag the workplans already use. */
export function dueFlag(dueOn: string | null, finished: boolean, now: number): { text: string; tone: "late" | "soon" | "calm" | "done" } | null {
  if (finished) return { text: "Done", tone: "done" };
  if (!dueOn) return null;
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(now)) + "T00:00:00Z").getTime();
  const days = Math.round((new Date(`${dueOn}T00:00:00Z`).getTime() - today) / DAY);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "late" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days <= 3) return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "soon" };
  return { text: dueText(dueOn), tone: "calm" };
}
const FLAG_TONE = { late: "text-danger font-medium", soon: "text-ink font-medium", calm: "text-ink-muted", done: "text-ink-muted" } as const;

/** Who is signed in, for the rail and the phone bar. Optional so the room can render on its own (tests, previews). */
export type RoomAccount = { name: string; email: string; role: string; internal: boolean };

function useSignOut() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  return trpc.account.signOut.useMutation({ onSuccess: () => { utils.account.me.setData(undefined, null); setLocation("/login"); } });
}

const RAIL_LINK = "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 transition-colors hover:bg-paper-sunken hover:text-ink";

/** The left rail on a laptop: the product, the shortcuts, the client's space and engagement, and who is signed in. */
function SignOutButton({ className }: { className: string }) {
  const signOut = useSignOut();
  return <button type="button" onClick={() => signOut.mutate()} disabled={signOut.isPending} className={className}>{signOut.isPending ? "Signing out…" : "Sign out"}</button>;
}

function RoomSidebar({ room, tabs, account }: { room: Room; tabs: RoomTab[]; account?: RoomAccount }) {
  const plan = tabs.find(tab => tab.id === "plan");
  return (
    <nav aria-label="Your room" className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line-soft bg-white px-3 py-5 text-sm">
      <a href="/dashboard" className="flex items-center gap-2.5 px-2" aria-label={BRAND.productEndorsement}>
        <img src={BRAND.markUrl} alt="" className="h-8 w-auto" />
        <span className="leading-tight"><span className="block font-semibold text-ink">{BRAND.productName}</span><span className="block text-xs text-ink-muted">by {BRAND.organisationName}</span></span>
      </a>
      <ul className="space-y-0.5">
        <li><a href="#overview" className={RAIL_LINK}>Home</a></li>
        <li><a href="#plan" className={RAIL_LINK}><span>My tasks</span>{plan?.count && plan.count.value > 0 && <span className="rounded-full bg-brand-plum px-2 text-xs font-medium text-white tabular-nums" aria-label={plan.count.label}>{plan.count.value}</span>}</a></li>
        <li><a href="#deliverables" className={RAIL_LINK}>Files</a></li>
      </ul>
      <div>
        <p className="px-3 text-xs text-ink-muted">Your space</p>
        <p className="mt-2 flex items-center gap-2 px-3 font-medium text-ink">
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-plum to-brand text-xs font-semibold text-white">{room.businessName.trim().charAt(0).toUpperCase()}</span>
          <span className="min-w-0 truncate">{room.businessName}</span>
        </p>
        <ul className="ml-6 mt-1 space-y-0.5 border-l border-line-soft pl-3">
          {tabs.map(tab => (
            <li key={tab.id}><a href={`#${tab.id}`} className={RAIL_LINK}><span>{tab.label}</span>{tab.count && tab.count.value > 0 && <span className="text-xs tabular-nums text-ink-muted" aria-label={tab.count.label}>{tab.count.value}</span>}</a></li>
          ))}
        </ul>
      </div>
      {account && (
        <div className="mt-auto space-y-1 border-t border-line-soft pt-4">
          <div className="flex items-center gap-2.5 px-3 pb-2">
            <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColour(account.name || account.email)}`}>{initials(account.name || account.email)}</span>
            <span className="min-w-0"><span className="block truncate font-medium text-ink">{account.name || account.email}</span><span className="block text-xs text-ink-muted">{account.role}</span></span>
          </div>
          <a href="/settings/business" className={RAIL_LINK}>Business settings</a>
          <a href="/settings/account" className={RAIL_LINK}>Account settings</a>
          {account.internal && <a href="/admin" className={RAIL_LINK}>Internal area</a>}
          <SignOutButton className={`${RAIL_LINK} w-full text-left`} />
        </div>
      )}
    </nav>
  );
}

/** On a phone: the product and the account links in one slim bar; the views are the tabs under the header. */
function RoomTopBar({ account }: { account?: RoomAccount }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-white px-4 py-3">
      <a href="/dashboard" className="flex items-center gap-2" aria-label={BRAND.productEndorsement}><img src={BRAND.markUrl} alt="" className="h-7 w-auto" /><span className="text-sm font-semibold">{BRAND.productName}</span></a>
      {account && (
        <div className="flex items-center gap-4 text-sm">
          <a href="/settings/account" className="text-ink-600">Account</a>
          <SignOutButton className="text-ink-600" />
        </div>
      )}
    </div>
  );
}

/** Each person keeps one colour from the IP Factory palette, so faces are easy to tell apart. */
const AVATAR_COLOURS = ["bg-brand", "bg-brand-plum", "bg-highlight-ink", "bg-brand-deep", "bg-health-clear"] as const;
export const avatarColour = (name: string) => AVATAR_COLOURS[name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLOURS.length];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";

const PLAN_GROUPS: { id: string; name: string; dot: string; pill: string; test: (task: Task) => boolean }[] = [
  { id: "you", name: "Waiting on you", dot: "border-brand-plum bg-white", pill: "bg-brand-plum text-white", test: isClientOpen },
  { id: "us", name: "With IP Factory", dot: "border-brand bg-white", pill: "bg-brand text-white", test: task => task.side !== "client" && OPEN_TASK_STATUSES.includes(task.status) },
  { id: "checking", name: "Sent, we are checking", dot: "border-highlight bg-white", pill: "bg-brand-tint text-brand-deep", test: task => task.status === "received" },
  { id: "done", name: "Done", dot: "border-health-clear bg-health-clear", pill: "bg-health-clear-tint text-health-clear", test: task => task.status === "accepted" || task.status === "done" },
];

/** Every task in the engagement, grouped by where it stands, with who owns it and when it is due. Open one to act on it. */
function PlanView({ room, now }: { room: Room; now: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const task = room.tasks.find(item => item.id === selected) ?? null;
  if (!room.tasks.length) return <p className="text-sm text-ink-muted">Your tasks appear here, grouped by where they stand, once your team sets the {METHOD.workPlan}.</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className={`space-y-6 ${task ? "" : "lg:col-span-2"}`}>
        {PLAN_GROUPS.map(group => {
          const items = room.tasks.filter(group.test).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.sortOrder - b.sortOrder || a.id - b.id);
          if (!items.length) return null;
          return (
            <section key={group.id} aria-label={group.name}>
              <h3 className="flex items-center gap-2 pb-2 font-sans"><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${group.pill}`}>{group.name}</span><span className="text-xs font-normal tabular-nums text-ink-muted">{items.length}</span></h3>
              <div className="overflow-hidden rounded-xl border border-line-soft bg-white">
                <table className="w-full table-fixed text-sm">
                  <thead><tr className="border-b border-line-soft text-left text-xs text-ink-muted"><th className="py-2 pl-3 pr-2 font-normal">Task</th><th className="hidden w-28 px-2 font-normal sm:table-cell">Who</th><th className="hidden w-40 px-2 font-normal sm:table-cell">Due</th><th className="hidden w-32 px-2 pr-3 font-normal sm:table-cell">Type</th></tr></thead>
                  <tbody>
                    {items.map(item => {
                      const flag = dueFlag(item.dueOn, group.id === "done", now);
                      return (
                        <tr key={item.id} className={`border-b border-line-soft last:border-b-0 ${selected === item.id ? "bg-brand-tint" : "hover:bg-paper-sunken"}`}>
                          <td className="py-2 pl-3 pr-2">
                            <button type="button" onClick={() => setSelected(selected === item.id ? null : item.id)} aria-expanded={selected === item.id} className="flex w-full items-center gap-2.5 text-left">
                              <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full border-2 ${group.dot}`} />
                              <span className="min-w-0"><span className={`block ${group.id === "done" ? "text-ink-muted line-through decoration-line-strong" : "text-ink"}`}>{item.title}{item.mine && <span className="ml-2 text-xs text-brand">for you</span>}</span><span className="block text-xs text-ink-muted sm:hidden">{item.side === "client" ? "You" : "IP Factory"}{flag ? <> · <span className={FLAG_TONE[flag.tone]}>{flag.text}</span></> : null}</span></span>
                            </button>
                          </td>
                          <td className="hidden px-2 text-ink-600 sm:table-cell">{item.side === "client" ? "You" : "IP Factory"}</td>
                          <td className={`hidden whitespace-nowrap px-2 sm:table-cell ${flag ? FLAG_TONE[flag.tone] : "text-ink-muted"}`}>{flag?.text ?? "-"}</td>
                          <td className="hidden whitespace-nowrap px-2 pr-3 text-ink-muted sm:table-cell">{item.kind === "data_request" ? METHOD.dataRequest : "Action"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      {task && (
        <aside aria-label="Task details" className="rounded-xl border border-line-soft bg-white p-5 lg:sticky lg:top-16">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-ink-muted">{task.statusLabel}</p>
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-brand underline underline-offset-2">Close</button>
          </div>
          <h3 className="mt-1 font-sans text-lg font-semibold tracking-tight">{task.title}</h3>
          <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-muted">Who</dt><dd>{task.side === "client" ? "You" : "IP Factory"}</dd>
            <dt className="text-ink-muted">Due</dt><dd>{task.dueOn ? dateOnly(task.dueOn) : "No date"}</dd>
            <dt className="text-ink-muted">Type</dt><dd>{task.kind === "data_request" ? METHOD.dataRequest : "Action"}</dd>
          </dl>
          {task.detail && <TaskDetail text={task.detail} className="mt-3 text-sm text-ink-600" />}
          {task.status === "needs_more" && task.statusNote && <p className="mt-2 text-sm text-danger">We need a bit more: {task.statusNote}</p>}
          <FileList files={task.files} />
          {isClientOpen(task) && <TaskControls task={task} uploadsEnabled={room.uploadsEnabled} />}
        </aside>
      )}
    </div>
  );
}

/** What we have asked the client for, and what has arrived: the Data Requests on their own, with the upload where it is needed. */
function DataRequestsView({ room, now }: { room: Room; now: number }) {
  const items = room.tasks.filter(task => task.kind === "data_request").sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.id - b.id);
  const arrived = items.filter(task => task.status === "accepted" || task.status === "done").length;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-600"><span className="font-medium text-ink tabular-nums">{arrived} of {items.length}</span> received. {METHOD_MEANING.dataRequest}</p>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-white">
        {items.map(task => {
          const finished = task.status === "accepted" || task.status === "done";
          const flag = dueFlag(task.dueOn, finished, now);
          return (
            <li key={task.id} className="p-4" aria-label={task.title}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`font-medium ${finished ? "text-ink-muted" : "text-ink"}`}>{task.title}</span>
                <span className="text-xs text-ink-muted">{task.statusLabel}{flag && !finished ? <> · <span className={FLAG_TONE[flag.tone]}>{flag.text}</span></> : null}</span>
              </div>
              {task.detail && !finished && <TaskDetail text={task.detail} className="mt-1 text-sm text-ink-600" />}
              {task.status === "needs_more" && task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {task.statusNote}</p>}
              <FileList files={task.files} />
              {isClientOpen(task) && <TaskControls task={task} uploadsEnabled={room.uploadsEnabled} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Every meeting: when, how long, the Join link before it and the shared notes after it. */
function MeetingsView({ room, now }: { room: Room; now: number }) {
  const sessions = [...room.sessions].sort((a, b) => (a.scheduledFor ? new Date(a.scheduledFor).getTime() : Infinity) - (b.scheduledFor ? new Date(b.scheduledFor).getTime() : Infinity) || a.sortOrder - b.sortOrder);
  if (!sessions.length) return <p className="text-sm text-ink-muted">Your {METHOD.session}s appear here once they are planned.</p>;
  return (
    <ol className="space-y-3" aria-label="Meetings">
      {sessions.map(session => {
        const when = session.scheduledFor ? new Date(session.scheduledFor) : null;
        const held = session.status === "held" || (when !== null && when.getTime() < now && session.status !== "planned");
        const isNext = room.nextSession?.id === session.id;
        const state = held ? "Held" : isNext ? "Next" : when ? "Booked" : "To be booked";
        const day = when ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" }).formatToParts(when) : null;
        const part = (type: string) => day?.find(item => item.type === type)?.value ?? "";
        return (
          <li key={session.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-4 rounded-xl border border-line-soft bg-white p-4" aria-label={session.title}>
            <div className={`flex flex-col items-center justify-center rounded-lg py-1.5 text-center ${isNext ? "bg-brand text-white" : held ? "bg-health-clear-tint text-health-clear" : "bg-brand-tint text-brand-deep"}`}>
              {when ? <><span className="text-xs">{part("weekday")}</span><span className="text-lg font-medium tabular-nums leading-tight">{part("day")}</span><span className="text-xs">{part("month")}</span></> : <span className="px-1 text-xs">No date</span>}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{session.title}</span>
                <span className={`text-xs ${isNext ? "font-medium text-brand" : "text-ink-muted"}`}>{state}</span>
              </div>
              {when && <p className="text-sm text-ink-muted">{lagos(when)} (Lagos time){session.durationMinutes ? `, ${session.durationMinutes} minutes` : ""}</p>}
              {session.agenda && <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{session.agenda}</p>}
              {session.status === "planned" && session.meetingLink && <a href={session.meetingLink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand underline underline-offset-2">Join the {METHOD.session}</a>}
              {session.notes && <div className="mt-3 border-t border-line-soft pt-2"><p className="text-xs text-ink-muted">Notes, shared {lagos(session.notesSharedAt, false)}</p><p className="mt-1 whitespace-pre-line text-sm">{session.notes}</p></div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** What the client has received: the Full Report and every Deliverable shared with them, each with its Sign-off. */
function DeliverablesView({ room, isOwner }: { room: Room; isOwner: boolean }) {
  if (!room.deliverables.length && !room.report?.deliveredAt) return <p className="text-sm text-ink-muted">Your {METHOD.findings}, {METHOD.prescription} and {METHOD.plan} appear here once they are shared with you.</p>;
  return (
    <div className="space-y-3">
      {room.report?.deliveredAt && (
        <div className="rounded-xl border border-line-soft bg-white p-4"><p className={KICKER}>{METHOD.fullReport}</p><p className="mt-1 text-sm text-ink-600">Emailed to you {lagos(room.report.deliveredAt, false)}.</p></div>
      )}
      <ul className="space-y-3" aria-label={METHOD.deliverables}>{room.deliverables.map(item => <DeliverableItem key={item.id} item={item} isOwner={isOwner} />)}</ul>
    </div>
  );
}
