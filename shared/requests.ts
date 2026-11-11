/**
 * Asking the client, with a conversation on each item (R78, ET 11 November 2026): the rhythm a request follows, and the
 * clock that starts when the client's side arrives. One source for the server, the Work Plan and the room.
 */
import { addDays } from "./agreement";
import { TURNAROUND_HOURS, TURNAROUND_LABELS, type EngagementTaskStatus, type EngagementTaskTurnaround } from "./engagement";

/** A request falls due on a Thursday by default: the weekly footage day (R77). */
export const REQUEST_DUE_WEEKDAY = 4;
/** The client always has two days' notice: a request is never due sooner. */
export const REQUEST_NOTICE_DAYS = 2;
/** How far ahead a request may be dated, so a mistyped year is caught. */
export const REQUEST_MAX_DAYS = 180;
/** Each person on the team sends at most this many requests a week on an engagement, unless they approve on it. */
export const REQUESTS_PER_WEEK = 1;
export const REQUEST_TITLE_MAX = 200;
export const REQUEST_BRIEF_MAX = 2000;
export const TASK_COMMENT_MAX = 4000;

const HOUR = 3_600_000;
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** The earliest day a request sent today may fall due. */
export const earliestRequestDue = (today: string) => addDays(today, REQUEST_NOTICE_DAYS);

/** The day a request sent today falls due by default: the first Thursday at least two days away. */
export function requestDueOn(today: string) {
  const earliest = earliestRequestDue(today);
  return addDays(earliest, (REQUEST_DUE_WEEKDAY - weekdayOf(earliest) + 7) % 7);
}

/** The Monday of a day's week: requests are counted Monday to Sunday, Lagos time. */
export const weekStartOf = (day: string) => addDays(day, -((weekdayOf(day) + 6) % 7));

/** A day as an email says it: "Thursday 19 November". */
export const dayInWords = (day: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00Z`));

/** The statuses in which the client's side of an item has arrived. */
const ARRIVED: readonly EngagementTaskStatus[] = ["received", "accepted", "done"];

type ArrivalFields = { receivedAt?: Date | null; followUpDueAt?: Date | null; followUpDoneAt?: Date | null };

/**
 * What a change of status sets on an item: the first time the client's side arrives it is stamped, and an item with a
 * turnaround starts its clock; the team asking for more, or reopening it, clears both, so the clock starts again from
 * what is usable. Nothing for the team's own items, or for an item no longer needed.
 */
export function arrivalFields(task: { side: string; receivedAt: Date | null; turnaround: EngagementTaskTurnaround | null }, next: EngagementTaskStatus, now = new Date()): ArrivalFields {
  if (task.side !== "client") return {};
  if (ARRIVED.includes(next)) {
    if (task.receivedAt) return {};
    return { receivedAt: now, followUpDueAt: task.turnaround ? new Date(now.getTime() + TURNAROUND_HOURS[task.turnaround] * HOUR) : null, followUpDoneAt: null };
  }
  if (next === "cancelled" || !task.receivedAt) return {};
  return { receivedAt: null, followUpDueAt: null, followUpDoneAt: null };
}

/** Whether a change of status is the client's side arriving: the moment to tell the person who asked. */
export const hasArrived = (fields: ArrivalFields) => fields.receivedAt instanceof Date;

export type FollowUp = {
  label: string;
  hours: number;
  /** waiting: it has not arrived; running: the clock is on; late: it ran out; shared: the team shared it. */
  state: "waiting" | "running" | "late" | "shared";
  dueAt: Date | null;
  doneAt: Date | null;
  hoursLeft: number | null;
};

/** Where an item's clock stands, or null when it has none. */
export function followUpOf(task: { turnaround: EngagementTaskTurnaround | null; followUpDueAt: Date | string | null; followUpDoneAt: Date | string | null }, now: number): FollowUp | null {
  if (!task.turnaround) return null;
  const label = TURNAROUND_LABELS[task.turnaround];
  const hours = TURNAROUND_HOURS[task.turnaround];
  const dueAt = task.followUpDueAt ? new Date(task.followUpDueAt) : null;
  if (task.followUpDoneAt) return { label, hours, state: "shared", dueAt, doneAt: new Date(task.followUpDoneAt), hoursLeft: null };
  if (!dueAt) return { label, hours, state: "waiting", dueAt: null, doneAt: null, hoursLeft: null };
  const hoursLeft = (dueAt.getTime() - now) / HOUR;
  return { label, hours, state: hoursLeft < 0 ? "late" : "running", dueAt, doneAt: null, hoursLeft };
}

/** The hours left on a clock, or how late it is: "31 hours left", "under an hour left", "3 hours late". */
export function clockText(hoursLeft: number) {
  const whole = Math.floor(Math.abs(hoursLeft));
  const unit = whole === 1 ? "hour" : "hours";
  if (hoursLeft >= 0) return whole === 0 ? "under an hour left" : `${whole} ${unit} left`;
  return whole === 0 ? "under an hour late" : `${whole} ${unit} late`;
}
