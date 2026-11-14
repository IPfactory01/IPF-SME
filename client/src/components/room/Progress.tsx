import { formatNaira } from "@shared/businessSupport";
import { METHOD } from "@shared/method";
import React from "react";
import type { Progress } from "@/lib/progress";

const dayWords = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
const timeWords = (at: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(at);

/** One figure with what it means underneath, as on the firm's Data Request dashboard. */
function Tile({ label, value, note, tone = "plain" }: { label: string; value: React.ReactNode; note?: string; tone?: "plain" | "late" | "good" }) {
  return (
    <div className="rounded-xl border border-line-soft bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "late" ? "text-danger" : tone === "good" ? "text-health-clear-strong" : "text-ink"}`}>{value}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

/** A stacked bar: its parts in order, out of a total, with the figures written out for screen readers. */
function Bar({ label, parts, total }: { label: string; parts: { value: number; tone: string; name: string }[]; total: number }) {
  const said = parts.filter(part => part.value).map(part => `${part.value} ${part.name}`).join(", ") || "none yet";
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3rem]">
      <span className="truncate text-ink-600" title={label}>{label}</span>
      <span role="img" aria-label={`${label}: ${said}, of ${total}`} className="flex h-2.5 overflow-hidden rounded-full bg-chart-track">
        {total > 0 && parts.map(part => part.value > 0 && <span key={part.name} className={part.tone} style={{ width: `${(part.value / total) * 100}%` }} />)}
      </span>
      <span className="text-right text-xs tabular-nums text-ink-muted">{total}</span>
    </div>
  );
}

const Legend = ({ items }: { items: { tone: string; name: string }[] }) => (
  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">{items.map(item => <span key={item.name} className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${item.tone}`} />{item.name}</span>)}</p>
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={`Progress: ${title}`} className="space-y-3 rounded-xl border border-line-soft bg-white p-4"><h2 className="text-sm font-semibold text-ink">{title}</h2>{children}</section>;
}

const DONE = "bg-chart-done";
const CHECKING = "bg-highlight";
const OPEN = "bg-brand";
const LATE = "bg-health-stuck";

/**
 * Progress (R92): where the engagement stands, in tiles and bars, for the client and the team alike. The client is
 * given their own side only; the team sees both sides and each owner's load; fees only for those who may see them.
 */
export default function ProgressView({ progress, audience, ourWork }: { progress: Progress; audience: "client" | "team"; ourWork?: { done: number; total: number } | null }) {
  const { dataRequests, plan, people, content, sessions, fees, measure } = progress;
  const nothing = !dataRequests && !plan.total && !content && !sessions.due && !sessions.next && !fees;
  if (nothing) return <p className="rounded-xl border border-line-soft bg-white p-4 text-sm text-ink-muted">Progress shows here once the {METHOD.workPlan} has items.</p>;
  const mine = audience === "client" ? "your side" : "both sides";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Done" value={`${plan.done} of ${plan.total}`} note={`${METHOD.workPlan}, ${mine}`} tone="good" />
        <Tile label="Being checked" value={plan.checking} note="Sent, pending review" />
        <Tile label="Open" value={plan.open} note="Still to do" />
        <Tile label="Overdue" value={plan.overdue} note="Past its date" tone={plan.overdue ? "late" : "plain"} />
        {ourWork
          ? <Tile label="IP Factory's work" value={`${ourWork.done} of ${ourWork.total}`} note="Done so far" />
          : <Tile label={`${METHOD.session}s held`} value={`${sessions.held} of ${sessions.due}`} note={sessions.next ? `Next: ${timeWords(sessions.next)}` : "None booked ahead"} />}
      </div>

      {dataRequests && (
        <Section title={METHOD.dataRequests}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="Requested" value={dataRequests.requested} />
            <Tile label="Received" value={dataRequests.received} tone="good" note={dataRequests.checking ? `${dataRequests.checking} being checked` : undefined} />
            <Tile label="Outstanding" value={dataRequests.outstanding} note="Still to come" />
            <Tile label="Overdue" value={dataRequests.overdue} tone={dataRequests.overdue ? "late" : "plain"} note="Past the date" />
            <Tile label="High priority open" value={dataRequests.highOpen} />
          </div>
          {dataRequests.next && <p className="text-sm text-ink-600">Next due: <span className="font-medium text-ink">{dataRequests.next.ref ? `${dataRequests.next.ref} ` : ""}{dataRequests.next.title}</span>, {dayWords(dataRequests.next.dueOn)}</p>}
          <Legend items={[{ tone: DONE, name: "Received" }, { tone: OPEN, name: "Outstanding" }]} />
          <div className="space-y-2">{dataRequests.bySection.map(row => <Bar key={row.section} label={row.section} total={row.total} parts={[{ value: row.received, tone: DONE, name: "received" }, { value: row.outstanding, tone: OPEN, name: "outstanding" }]} />)}</div>
        </Section>
      )}

      {plan.byWeek.length > 0 && (
        <Section title={`${METHOD.workPlan} by week`}>
          <Legend items={[{ tone: DONE, name: "Done" }, { tone: CHECKING, name: "Being checked" }, { tone: OPEN, name: "Open" }, { tone: LATE, name: "Overdue" }]} />
          <div className="space-y-2">{plan.byWeek.map(row => <Bar key={String(row.week)} label={row.week === null ? "No week" : `Week ${row.week}`} total={row.total}
            parts={[{ value: row.done, tone: DONE, name: "done" }, { value: row.checking, tone: CHECKING, name: "being checked" }, { value: row.open, tone: OPEN, name: "open" }, { value: row.overdue, tone: LATE, name: "overdue" }]} />)}</div>
        </Section>
      )}

      {audience === "team" && people.length > 0 && (
        <Section title="By person">
          <Legend items={[{ tone: DONE, name: "Done" }, { tone: OPEN, name: "Open" }, { tone: LATE, name: "Overdue" }]} />
          <div className="space-y-2">{people.map(person => <Bar key={person.userId} label={person.name} total={person.done + person.open}
            parts={[{ value: person.done, tone: DONE, name: "done" }, { value: person.open - person.overdue, tone: OPEN, name: "open" }, { value: person.overdue, tone: LATE, name: "overdue" }]} />)}</div>
        </Section>
      )}

      {content && (
        <Section title={`Content, month ${content.month}`}>
          <p className="text-xs text-ink-muted">Published against the month's target. Only what has gone out counts.</p>
          <div className="space-y-2">{content.rows.map(row => <Bar key={row.label} label={`${row.label}: ${row.published} of ${row.target}`} total={Math.max(row.target, row.published)} parts={[{ value: row.published, tone: DONE, name: "published" }]} />)}</div>
        </Section>
      )}

      {measure && (
        <Section title={METHOD.measure}>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Before" value={measure.baselineValue ?? "–"} note={measure.unit ?? undefined} />
            <Tile label="Latest" value={measure.latest ?? "–"} note={measure.name} tone="good" />
            <Tile label="Target" value={measure.targetValue ?? "–"} note={measure.unit ?? undefined} />
          </div>
        </Section>
      )}

      {fees && (
        <Section title={audience === "client" ? "Payments" : "Fees"}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Total" value={formatNaira(fees.total)} />
            <Tile label="Paid" value={formatNaira(fees.paid)} tone="good" />
            <Tile label="Left to pay" value={formatNaira(fees.left)} />
            <Tile label="Late" value={formatNaira(fees.late)} tone={fees.late ? "late" : "plain"} />
          </div>
        </Section>
      )}
    </div>
  );
}
