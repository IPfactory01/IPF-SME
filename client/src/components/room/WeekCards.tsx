import { weekLabel, weekOfDay, weekPlace } from "@shared/weeks";
import { ChevronDown, Video } from "lucide-react";
import React, { useState } from "react";

type Dated = { id: number; dueOn: string | null; weekNumber: number | null };
type WeekSession = { id: number; title: string; scheduledFor: Date | string | null; meetingLink: string | null; weekNumber: number | null; status: string };

const lagosDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(date);
const sessionTime = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(date);

/**
 * The Work Plan as weekly cards (R85), for the client's room and the team's workspace alike: one card per week, dated,
 * holding that week's items and its booked Sessions. This week first and open, next week open, later weeks folded to
 * one line, past weeks folded to what is done unless something is still outstanding. The caller draws each item.
 */
export default function WeekCards<T extends Dated>({ startedOn, items, sessions, isDone, isWaiting, waitingLabel, renderItem, note, noteWeeks = [], onMarkHeld, emptyText, firstIf, now = Date.now() }: {
  startedOn: string | null;
  items: T[];
  sessions: WeekSession[];
  isDone: (item: T) => boolean;
  /** Items to lead their week, such as those waiting for this person's review. */
  firstIf?: (item: T) => boolean;
  /** Whether an item waits on the person reading, for the switch at the top. */
  isWaiting: (item: T) => boolean;
  waitingLabel: string;
  renderItem: (item: T) => React.ReactNode;
  /** One line under a week's title, such as the client's view of IP Factory's work that week (R86). */
  note?: (week: number | null) => string | null;
  /** Weeks that have a card for their note alone (IP Factory working while nothing waits on the client). */
  noteWeeks?: (number | null)[];
  /** For the team (R90): once a Session has started, say it happened or did not. Without it, the row only shows Held. */
  onMarkHeld?: (sessionId: number, held: boolean) => void;
  /** What to say when nothing is shown, such as a filter or search that matches nothing. */
  emptyText?: string;
  now?: number;
}) {
  const today = lagosDay(new Date(now));
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [missed, setMissed] = useState<number | null>(null);
  const weekOfItem = (item: T) => item.weekNumber ?? weekOfDay(startedOn, item.dueOn);
  const booked = sessions.filter(session => session.scheduledFor && session.status !== "cancelled");
  const weekOfSession = (session: WeekSession) => session.weekNumber ?? weekOfDay(startedOn, lagosDay(new Date(session.scheduledFor!)));
  const shown = onlyWaiting ? items.filter(isWaiting) : items;
  const weeks = Array.from(new Set([...shown.map(weekOfItem), ...(onlyWaiting ? [] : [...booked.map(weekOfSession), ...noteWeeks])])).sort((a, b) => (a ?? 999) - (b ?? 999));
  const waiting = items.filter(isWaiting).length;
  // This week leads; the rest follow in order.
  const ordered = [...weeks.filter(week => weekPlace(startedOn, week, today) === "now"), ...weeks.filter(week => weekPlace(startedOn, week, today) !== "now")];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" role="switch" aria-checked={onlyWaiting} onClick={() => setOnlyWaiting(value => !value)}
          className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm ${onlyWaiting ? "border-brand-plum bg-brand-plum text-white" : "border-line-soft bg-white text-ink-600"}`}>
          {waitingLabel} <span className="tabular-nums">{waiting}</span>
        </button>
      </div>
      {ordered.map(week => {
        const key = week === null ? "none" : String(week);
        const its = shown.filter(item => weekOfItem(item) === week).sort((a, b) => Number(Boolean(firstIf?.(b))) - Number(Boolean(firstIf?.(a))) || Number(isDone(a)) - Number(isDone(b)) || (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.id - b.id);
        const meetings = onlyWaiting ? [] : booked.filter(session => weekOfSession(session) === week).sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());
        const place = weekPlace(startedOn, week, today);
        const done = its.filter(isDone).length;
        const outstanding = its.length - done;
        const openByDefault = onlyWaiting || place === "now" || place === "next" || place === "none" || (place === "past" && outstanding > 0);
        const open = toggled[key] ?? openByDefault;
        const title = week === null ? "No week" : `Week ${week}`;
        const summary = [its.length ? (place === "past" ? `${done} of ${its.length} done` : `${its.length} ${its.length === 1 ? "item" : "items"}`) : "", meetings.length ? `${meetings.length} ${meetings.length === 1 ? "Session" : "Sessions"}` : ""].filter(Boolean).join(" · ");
        return (
          <section key={key} aria-label={title} className={`overflow-hidden rounded-xl border bg-white ${place === "now" ? "border-brand" : "border-line-soft"}`}>
            <button type="button" aria-expanded={open} onClick={() => setToggled(current => ({ ...current, [key]: !open }))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-ink">{title}</span>
                  {startedOn && week !== null && <span className="text-xs text-ink-muted">{weekLabel(startedOn, week)}</span>}
                  {place === "now" && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">This week</span>}
                </span>
                <span className="block text-xs text-ink-muted">{summary || (note?.(week) ? "" : "Nothing this week")}</span>
                {note?.(week) && <span className="block text-xs text-brand">{note(week)}</span>}
              </span>
              <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="border-t border-line-soft">
                {meetings.length > 0 && (
                  <ul aria-label={`${title} Sessions`} className="divide-y divide-line-soft bg-brand-tint-soft">
                    {meetings.map(session => (
                      <li key={`s-${session.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2"><Video className="h-4 w-4 shrink-0 text-brand" aria-hidden /><span className="font-medium text-ink">{session.title}</span><span className="text-ink-muted">{sessionTime(new Date(session.scheduledFor!))}</span></span>
                        {/* Held once the team marks it (R90); Join until it ends; the team marks it once it has started. */}
                        <span className="flex flex-wrap items-center gap-3">
                          {session.status === "held" ? <span className="text-xs font-medium text-health-clear-strong">Held</span> : <>
                            {session.meetingLink && new Date(session.scheduledFor!).getTime() + 2 * 3_600_000 >= now && <a href={session.meetingLink} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand underline underline-offset-2">Join</a>}
                            {onMarkHeld && new Date(session.scheduledFor!).getTime() <= now && (missed === session.id ? <>
                              <span className="text-xs text-ink-600">Take it off the plan?</span>
                              <button type="button" onClick={() => { setMissed(null); onMarkHeld(session.id, false); }} className="min-h-8 rounded-md border border-line px-3 text-xs font-semibold text-ink">Yes, it did not happen</button>
                              <button type="button" onClick={() => setMissed(null)} className="text-xs text-ink-600 underline underline-offset-2">Cancel</button>
                            </> : <>
                              <button type="button" onClick={() => onMarkHeld(session.id, true)} className="min-h-8 rounded-md bg-brand px-3 text-xs font-semibold text-white">Mark as held</button>
                              <button type="button" onClick={() => setMissed(session.id)} className="text-xs text-ink-600 underline underline-offset-2">Did not happen</button>
                            </>)}
                          </>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {its.length > 0 && <ul aria-label={`${title} items`} className="divide-y divide-line-soft">{its.map(item => <li key={item.id}>{renderItem(item)}</li>)}</ul>}
              </div>
            )}
          </section>
        );
      })}
      {!ordered.length && <p className="rounded-xl border border-line-soft bg-white p-4 text-sm text-ink-muted">{onlyWaiting ? "Nothing is waiting." : emptyText ?? "Nothing on the plan yet."}</p>}
    </div>
  );
}
