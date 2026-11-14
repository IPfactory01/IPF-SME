/**
 * Progress (R92, ET 14 November 2026): where an engagement stands, worked out from the records the room and the
 * workspace already hold, so it can never drift from them. The client's room and the team's workspace call it with
 * what each may see; it reads nothing else.
 */
export type ProgressTask = {
  id: number;
  side: string;
  kind: string;
  status: string;
  title: string;
  ref?: string | null;
  section?: string | null;
  priority?: string | null;
  dueOn: string | null;
  weekNumber: number | null;
  owners?: readonly { userId: number; name: string }[];
};
export type ProgressSession = { status: string; scheduledFor: Date | string | null };
export type ProgressContent = { kind: string; month: number; status: string };
export type ProgressFee = { amount: number; paidAmount: number; left: number; dueOn: string | null };
export type ProgressMeasure = { name: string; unit: string | null; baselineValue: number | null; targetValue: number | null; latest: number | null };

const DONE = ["done", "accepted", "not_available"];
const RECEIVED = ["received", "accepted", "done"];
const OPEN = ["open", "needs_more"];
/** A content kind as the month's target names it (Reels, Posts, Stories). */
const PLURAL: Record<string, string> = { reel: "reels", post: "posts", story: "stories" };

/** The week an item sits in: its own, or the week its date falls in from the start. */
function weekOf(task: ProgressTask, startedOn: string | null) {
  if (task.weekNumber !== null) return task.weekNumber;
  if (!startedOn || !task.dueOn) return null;
  return Math.max(1, Math.floor((Date.parse(`${task.dueOn}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / (7 * 86_400_000)) + 1);
}

export function progressOf(input: {
  tasks: readonly ProgressTask[];
  sessions: readonly ProgressSession[];
  content?: readonly ProgressContent[];
  contentTargets?: readonly { label: string; count: number }[];
  currentMonth?: number | null;
  fees?: readonly ProgressFee[] | null;
  measure?: ProgressMeasure | null;
  startedOn: string | null;
  /** Today in Lagos, YYYY-MM-DD. */
  today: string;
  now: number;
}) {
  const live = input.tasks.filter(task => task.status !== "cancelled");
  const late = (task: ProgressTask) => OPEN.includes(task.status) && task.dueOn !== null && task.dueOn < input.today;

  // The Data Requests, as the firm's Data Request sheet counts them.
  const requests = live.filter(task => task.kind === "data_request" && task.side === "client");
  const sections = Array.from(new Set(requests.map(task => task.section || "Other")));
  const outstanding = requests.filter(task => OPEN.includes(task.status));
  const next = [...outstanding].filter(task => task.dueOn).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.id - b.id)[0] ?? null;
  const dataRequests = requests.length ? {
    requested: requests.length,
    received: requests.filter(task => RECEIVED.includes(task.status)).length,
    checking: requests.filter(task => task.status === "received").length,
    outstanding: outstanding.length,
    overdue: outstanding.filter(late).length,
    notAvailable: requests.filter(task => task.status === "not_available").length,
    highOpen: outstanding.filter(task => task.priority === "high").length,
    bySection: sections.map(section => {
      const its = requests.filter(task => (task.section || "Other") === section);
      return { section, received: its.filter(task => RECEIVED.includes(task.status)).length, outstanding: its.filter(task => OPEN.includes(task.status)).length, total: its.length };
    }),
    next: next ? { title: next.title, ref: next.ref ?? null, dueOn: next.dueOn! } : null,
  } : null;

  // The Work Plan by week: done, sent and waiting to be checked, still open, and late.
  const weeks = Array.from(new Set(live.map(task => weekOf(task, input.startedOn)))).sort((a, b) => (a ?? 999) - (b ?? 999));
  const plan = {
    total: live.length,
    done: live.filter(task => DONE.includes(task.status)).length,
    checking: live.filter(task => task.status === "received").length,
    open: live.filter(task => OPEN.includes(task.status)).length,
    overdue: live.filter(late).length,
    byWeek: weeks.map(week => {
      const its = live.filter(task => weekOf(task, input.startedOn) === week);
      return { week, done: its.filter(task => DONE.includes(task.status)).length, checking: its.filter(task => task.status === "received").length, open: its.filter(task => OPEN.includes(task.status) && !late(task)).length, overdue: its.filter(late).length, total: its.length };
    }),
  };

  // Each owner's open and late items (the team's view only passes owners).
  const named = new Map<number, string>();
  for (const task of live) for (const owner of task.owners ?? []) if (owner.name) named.set(owner.userId, owner.name);
  const people = Array.from(named, ([userId, name]) => {
    const its = live.filter(task => (task.owners ?? []).some(owner => owner.userId === userId));
    return { userId, name, open: its.filter(task => OPEN.includes(task.status)).length, overdue: its.filter(late).length, done: its.filter(task => DONE.includes(task.status)).length };
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  // This month's content against the month's target: published only, as the agreement counts it.
  const month = input.currentMonth ?? null;
  const content = month !== null && input.contentTargets?.length ? {
    month,
    rows: input.contentTargets.map(target => ({
      label: target.label,
      target: target.count,
      published: (input.content ?? []).filter(item => item.month === month && item.status === "published" && PLURAL[item.kind] === target.label.toLowerCase()).length,
    })),
  } : null;

  // Sessions: held against those whose time has come.
  const booked = input.sessions.filter(session => session.status !== "cancelled" && session.scheduledFor);
  const due = booked.filter(session => new Date(session.scheduledFor!).getTime() <= input.now);
  const upcoming = booked.filter(session => session.status === "planned" && new Date(session.scheduledFor!).getTime() > input.now)
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())[0] ?? null;
  const sessions = { held: booked.filter(session => session.status === "held").length, due: due.length, next: upcoming ? new Date(upcoming.scheduledFor!) : null };

  const fees = input.fees?.length ? {
    total: input.fees.reduce((sum, fee) => sum + fee.amount, 0),
    paid: input.fees.reduce((sum, fee) => sum + fee.paidAmount, 0),
    left: input.fees.reduce((sum, fee) => sum + fee.left, 0),
    late: input.fees.filter(fee => fee.left > 0 && fee.dueOn !== null && fee.dueOn < input.today).reduce((sum, fee) => sum + fee.left, 0),
  } : null;

  return { dataRequests, plan, people, content, sessions, fees, measure: input.measure ?? null };
}

export type Progress = ReturnType<typeof progressOf>;
