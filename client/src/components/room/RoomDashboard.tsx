import { OPEN_TASK_STATUSES } from "@shared/engagement";
import { METHOD } from "@shared/method";
import type { inferRouterOutputs } from "@trpc/server";
import { AlertCircle, ArrowRight, Check } from "lucide-react";
import React, { useEffect, useState } from "react";
import type { AppRouter } from "../../../../server/routers";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Task = Room["tasks"][number];
export type DashboardStep = { n: number; title: string; state: "done" | "now" | "next" };

const DAY = 86_400_000;
const CARD = "relative rounded-xl border border-line-soft bg-white p-5";
const LABEL = "text-xs font-medium text-ink-muted";

/** Who holds each piece of work, in the order the List tab groups it. The colours are the chart tokens in index.css. */
export const WORK_GROUPS = [
  { id: "you", name: "Waiting on you", stroke: "stroke-chart-you", bg: "bg-chart-you", test: (task: Task) => task.side === "client" && OPEN_TASK_STATUSES.includes(task.status) },
  { id: "us", name: "With IP Factory", stroke: "stroke-chart-us", bg: "bg-chart-us", test: (task: Task) => task.side !== "client" && OPEN_TASK_STATUSES.includes(task.status) },
  { id: "checking", name: "We are checking", stroke: "stroke-chart-checking", bg: "bg-chart-checking", test: (task: Task) => task.status === "received" },
  { id: "done", name: "Done", stroke: "stroke-chart-done", bg: "bg-chart-done", test: (task: Task) => task.status === "accepted" || task.status === "done" || task.status === "not_available" },
] as const;

export function workSplit(tasks: Task[]) {
  return WORK_GROUPS.map(group => ({ id: group.id, name: group.name, value: tasks.filter(group.test).length }));
}

/** Open work by when it is due, in Lagos days: overdue, this week (0 to 6 days), next week (7 to 13), later. */
export function dueBuckets(tasks: Task[], now: number) {
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(now)) + "T00:00:00Z").getTime();
  const buckets = [
    { id: "late", name: "Overdue", you: 0, us: 0 },
    { id: "week", name: "This week", you: 0, us: 0 },
    { id: "next", name: "Next week", you: 0, us: 0 },
    { id: "later", name: "Later", you: 0, us: 0 },
  ];
  let undated = 0;
  for (const task of tasks) {
    if (!OPEN_TASK_STATUSES.includes(task.status)) continue;
    if (!task.dueOn) { undated += 1; continue; }
    const days = Math.round((new Date(`${task.dueOn}T00:00:00Z`).getTime() - today) / DAY);
    const bucket = buckets[days < 0 ? 0 : days < 7 ? 1 : days < 14 ? 2 : 3]!;
    if (task.side === "client") bucket.you += 1; else bucket.us += 1;
  }
  return { buckets, undated };
}

/** Plays a ring or bar in from empty once, after the first paint; with reduced motion it simply appears full. */
function useDrawn() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return drawn;
}

const goTo = (id: string) => { window.location.hash = id; };

/**
 * The Overview's dashboard: where the engagement stands, who holds the work, what we still need from the client and
 * what falls due when. Read-only pictures of the same records the tabs list; every chart carries its numbers in text
 * (legend, labels or an accessible name), so nothing depends on colour alone. Clicking a chart opens the tab behind it.
 */
export default function RoomDashboard({ room, steps, now }: { room: Room; steps: DashboardStep[]; now: number }) {
  const drawn = useDrawn();
  return (
    <section aria-label="Dashboard" className="space-y-5">
      <StageMap steps={steps} />
      <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-4">
        <ProgressRing steps={steps} drawn={drawn} />
        <WorkDonut tasks={room.tasks} drawn={drawn} />
        <DataRequestMeter tasks={room.tasks} now={now} />
        <DueBars tasks={room.tasks} now={now} drawn={drawn} />
      </div>
    </section>
  );
}

/** The seven steps as one band: done in green, the current step in plum, what follows in grey. */
function StageMap({ steps }: { steps: DashboardStep[] }) {
  if (!steps.length) return null;
  return (
    <div className={CARD}>
      <p className={LABEL}>{METHOD.engagement} stages</p>
      <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Stages">
        {steps.map(step => (
          <li key={step.n} aria-current={step.state === "now" ? "step" : undefined} className="min-w-0">
            <a href={`#step-${step.n}`} className="group block" title={`${step.n}. ${step.title}: ${step.state === "done" ? "done" : step.state === "now" ? "now" : "to come"}`}>
              <span aria-hidden className={`block h-2.5 rounded-full transition-transform group-hover:scale-y-125 ${step.state === "done" ? "bg-chart-done" : step.state === "now" ? "bg-brand-plum" : "bg-chart-track"}`} />
              <span className="mt-2 hidden items-center gap-1 text-xs md:flex">
                {step.state === "done" ? <Check className="h-3 w-3 shrink-0 text-chart-done" aria-hidden /> : <span className="tabular-nums text-ink-muted">{step.n}</span>}
                <span className={`truncate ${step.state === "now" ? "font-semibold text-ink" : "text-ink-muted"}`}>{step.title}</span>
              </span>
              <span className="sr-only md:hidden">{step.n}. {step.title}</span>
              <span className="sr-only">{step.state === "done" ? ", done" : step.state === "now" ? ", now" : ", to come"}</span>
            </a>
          </li>
        ))}
      </ol>
      {(() => {
        const current = steps.find(step => step.state === "now");
        return current ? <p className="mt-3 text-sm text-ink md:hidden">Now: <span className="font-semibold">{current.title}</span></p> : null;
      })()}
    </div>
  );
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ steps, drawn }: { steps: DashboardStep[]; drawn: boolean }) {
  const done = steps.filter(step => step.state === "done").length;
  const total = steps.length || 1;
  const share = done / total;
  const current = steps.find(step => step.state === "now");
  return (
    <div className={CARD}>
      <p className={LABEL}>Progress</p>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={`${done} of ${steps.length} stages done`}>
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" className="stroke-chart-track" />
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-chart-done motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - (drawn ? share : 0))} />
        </svg>
        <div className="min-w-0">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{Math.round(share * 100)}<span className="text-base text-ink-muted">%</span></p>
          <p className="text-sm text-ink-600"><span className="tabular-nums">{done} of {steps.length}</span> stages done</p>
          {current && <p className="mt-1 truncate text-xs text-ink-muted">Now: {current.title}</p>}
        </div>
      </div>
    </div>
  );
}

/** A donut of every task by who holds it. Hovering a slice or its legend row shows its share in the centre. */
function WorkDonut({ tasks, drawn }: { tasks: Task[]; drawn: boolean }) {
  const split = workSplit(tasks);
  const total = split.reduce((sum, group) => sum + group.value, 0);
  const [active, setActive] = useState<string | null>(null);
  const focus = split.find(group => group.id === active) ?? null;
  const GAP = total > 1 ? 2.5 : 0;
  let offset = 0;
  return (
    <div className={CARD}>
      <p className={LABEL}>{METHOD.workPlan}</p>
      {total ? (
        <div className="mt-3 flex items-center gap-4">
          <button type="button" onClick={() => goTo("plan")} className="relative shrink-0 rounded-full" aria-label={`${METHOD.workPlan}: ${split.map(group => `${group.value} ${group.name.toLowerCase()}`).join(", ")}. Open the list`}>
            <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-chart-track" />
              {split.map((group, index) => {
                if (!group.value) return null;
                const length = (group.value / total) * CIRCUMFERENCE;
                const dash = Math.max(0, length - GAP);
                const start = offset;
                offset += length;
                return (
                  <circle key={group.id} cx="50" cy="50" r={RADIUS} fill="none" strokeWidth={active === group.id ? 15 : 12}
                    className={`${WORK_GROUPS[index]!.stroke} cursor-pointer motion-safe:transition-all motion-safe:duration-500`}
                    strokeDasharray={`${drawn ? dash : 0} ${CIRCUMFERENCE}`} strokeDashoffset={-start}
                    onPointerEnter={() => setActive(group.id)} onPointerLeave={() => setActive(null)} />
                );
              })}
            </svg>
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums leading-none">{focus ? focus.value : total}</span>
              <span className="mt-0.5 max-w-[4.5rem] truncate text-[10px] text-ink-muted">{focus ? `${Math.round((focus.value / total) * 100)}%` : "tasks"}</span>
            </span>
          </button>
          <ul className="min-w-0 flex-1 space-y-1 text-xs">
            {split.map((group, index) => (
              <li key={group.id} onPointerEnter={() => setActive(group.id)} onPointerLeave={() => setActive(null)} className={`flex items-center justify-between gap-2 rounded px-1 ${active === group.id ? "bg-paper-sunken" : ""}`}>
                <span className="flex min-w-0 items-center gap-1.5"><span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${WORK_GROUPS[index]!.bg}`} /><span className="truncate text-ink-600">{group.name}</span></span>
                <span className="font-medium tabular-nums text-ink">{group.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="mt-3 text-sm text-ink-600">Shown once the {METHOD.workPlan} is set.</p>}
    </div>
  );
}

/** One block per Data Request: filled when it has arrived, outlined while we still need it. */
function DataRequestMeter({ tasks, now }: { tasks: Task[]; now: number }) {
  const requests = tasks.filter(task => task.kind === "data_request").sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const received = requests.filter(task => !OPEN_TASK_STATUSES.includes(task.status)).length;
  const late = dueBuckets(requests, now).buckets[0]!;
  const overdue = late.you + late.us;
  return (
    <div className={CARD}>
      <p className={LABEL}>{METHOD.dataRequest}</p>
      {requests.length ? (
        <>
          <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{received}<span className="text-base text-ink-muted"> of {requests.length}</span></p>
          <p className="text-sm text-ink-600">received</p>
          <button type="button" onClick={() => goTo("data")} className="mt-3 flex w-full gap-1" aria-label={`${received} of ${requests.length} received. Open the ${METHOD.dataRequest}`}>
            {requests.map(task => {
              const state = task.status === "received" ? "bg-chart-checking" : task.status === "not_available" ? "bg-line-strong" : OPEN_TASK_STATUSES.includes(task.status) ? "border border-chart-you bg-white" : "bg-chart-done";
              return <span key={task.id} title={`${task.title}: ${task.statusLabel}`} aria-hidden className={`h-3 min-w-0 flex-1 rounded-sm transition-transform hover:scale-y-150 ${state}`} />;
            })}
          </button>
          {overdue > 0 ? <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-danger"><AlertCircle className="h-3.5 w-3.5" aria-hidden />{overdue} overdue</p>
            : <p className="mt-3 text-xs text-ink-muted">None overdue</p>}
        </>
      ) : <p className="mt-3 text-sm text-ink-600">None issued yet.</p>}
    </div>
  );
}

/** Open work by when it falls due, each bar split into yours and ours, with its count on top. */
function DueBars({ tasks, now, drawn }: { tasks: Task[]; now: number; drawn: boolean }) {
  const { buckets, undated } = dueBuckets(tasks, now);
  const max = Math.max(1, ...buckets.map(bucket => bucket.you + bucket.us));
  const [tip, setTip] = useState<string | null>(null);
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={LABEL}>Due dates</p>
        <p className="flex gap-2 text-[11px] text-ink-muted">
          <span className="flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-sm bg-chart-you" />You</span>
          <span className="flex items-center gap-1"><span aria-hidden className="h-2 w-2 rounded-sm bg-chart-us" />Us</span>
        </p>
      </div>
      <div className="mt-3 grid h-24 grid-cols-4 items-end gap-3" role="group" aria-label="Open work by due date">
        {buckets.map(bucket => {
          const total = bucket.you + bucket.us;
          const text = `${bucket.name}: ${bucket.you} yours, ${bucket.us} ours`;
          return (
            <button key={bucket.id} type="button" onClick={() => goTo("plan")} aria-label={text}
              onPointerEnter={() => setTip(text)} onPointerLeave={() => setTip(null)} onFocus={() => setTip(text)} onBlur={() => setTip(null)}
              className="group flex h-full flex-col items-center justify-end">
              <span className={`mb-1 text-xs font-medium tabular-nums ${bucket.id === "late" && total ? "text-danger" : "text-ink"}`}>{total}</span>
              <span className="flex w-full max-w-8 flex-col-reverse gap-[2px] motion-safe:transition-[height] motion-safe:duration-700 motion-safe:ease-out" style={{ height: `${drawn ? (total / max) * 64 : 0}px` }}>
                {bucket.you > 0 && <span className="w-full rounded-t-[4px] bg-chart-you group-hover:opacity-80" style={{ flexGrow: bucket.you }} />}
                {bucket.us > 0 && <span className={`w-full bg-chart-us group-hover:opacity-80 ${bucket.you ? "" : "rounded-t-[4px]"}`} style={{ flexGrow: bucket.us }} />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-4 gap-3 border-t border-line-soft pt-1 text-center text-[11px] text-ink-muted">{buckets.map(bucket => <span key={bucket.id} className="truncate">{bucket.name}</span>)}</div>
      <p className="mt-2 flex min-h-4 items-center gap-1 text-xs text-ink-muted" aria-live="polite">{tip ?? (undated ? `${undated} with no date yet` : <>Open the list <ArrowRight className="h-3 w-3" aria-hidden /></>)}</p>
    </div>
  );
}
