import { OPEN_TASK_STATUSES } from "@shared/engagement";
import { METHOD } from "@shared/method";
import type { inferRouterOutputs } from "@trpc/server";
import { Check } from "lucide-react";
import React from "react";
import type { AppRouter } from "../../../../server/routers";
import { contentCounts } from "./ContentBoard";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Task = Room["tasks"][number];
export type DashboardStep = { n: number; title: string; state: "done" | "now" | "next" };

const DAY = 86_400_000;
const CARD = "rounded-xl border border-line-soft bg-white";
const LABEL = "text-xs font-medium text-ink-muted";

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

const sessionDay = (value: Date | string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" }).format(new Date(value));

/**
 * The Overview's dashboard: the engagement's stages as one band, the one place with brand colour, then four figures
 * that each open the view behind them. Every figure is a number with its label, so nothing depends on colour alone.
 */
export default function RoomDashboard({ room, steps, now, contentMonth = null }: { room: Room; steps: DashboardStep[]; now: number; contentMonth?: number | null }) {
  const done = steps.filter(step => step.state === "done").length;
  const current = steps.find(step => step.state === "now") ?? null;
  const yours = room.tasks.filter(task => task.side === "client");
  const outstanding = yours.filter(task => OPEN_TASK_STATUSES.includes(task.status)).length;
  const overdue = dueBuckets(yours, now).buckets[0]!.you;
  // A content programme leads with the month's reels, posts and stories against what it promises.
  const content = contentMonth ? contentCounts(room.content, room.contentTargets, contentMonth).map(count => ({ label: `${count.label}, month ${contentMonth}`, value: `${count.done} of ${count.target}`, note: "approved or published", href: "#content" })) : [];
  const figures = content.length ? [...content, { label: `Next ${METHOD.session}`, value: room.nextSession?.scheduledFor ? sessionDay(room.nextSession.scheduledFor) : "Not booked", note: room.nextSession?.title ?? "", href: "#meetings" }] : [
    { label: "Stages complete", value: `${done} of ${steps.length}`, note: current ? `Now: ${current.title}` : "", href: "#overview" },
    { label: "Outstanding with you", value: String(outstanding), note: outstanding === 1 ? "item" : "items", href: "#plan" },
    { label: "Overdue", value: String(overdue), note: "past the due date", href: "#plan", late: overdue > 0 },
    { label: `Next ${METHOD.session}`, value: room.nextSession?.scheduledFor ? sessionDay(room.nextSession.scheduledFor) : "Not booked", note: room.nextSession?.title ?? "", href: "#meetings" },
  ];
  return (
    <section aria-label="Dashboard" className="space-y-4">
      <StageBand steps={steps} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {figures.map(figure => (
          <a key={figure.label} href={figure.href} className={`${CARD} block p-4 transition-colors hover:border-line-strong`}>
            <p className={LABEL}>{figure.label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${figure.late ? "text-danger" : "text-ink"}`}>{figure.value}</p>
            {figure.note && <p className="truncate text-xs text-ink-muted">{figure.note}</p>}
          </a>
        ))}
      </div>
    </section>
  );
}

/** The seven stages as one ribbon, like the stage band on a workplan: done in navy, the current stage in plum. */
function StageBand({ steps }: { steps: DashboardStep[] }) {
  if (!steps.length) return null;
  const current = steps.find(step => step.state === "now");
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={LABEL}>{METHOD.engagement} stages</p>
        {current && <p className="text-xs text-ink-muted">Now: <span className="font-medium text-ink">{current.title}</span></p>}
      </div>
      <ol className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Stages">
        {steps.map(step => (
          <li key={step.n} aria-current={step.state === "now" ? "step" : undefined} className="min-w-0">
            <a href={`#step-${step.n}`} className="group block" title={`${step.n}. ${step.title}`}>
              <span aria-hidden className={`flex h-8 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-opacity group-hover:opacity-80 ${step.state === "done" ? "bg-brand text-white" : step.state === "now" ? "bg-brand-plum text-white" : "bg-paper-sunken text-ink-muted"}`}>
                {step.state === "done" ? <Check className="h-4 w-4" aria-hidden /> : step.n}
              </span>
              <span className={`mt-2 hidden truncate text-xs md:block ${step.state === "now" ? "font-semibold text-ink" : "text-ink-muted"}`}>{step.title}</span>
              <span className="sr-only">{step.n}. {step.title}{step.state === "done" ? ", done" : step.state === "now" ? ", now" : ", to come"}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
