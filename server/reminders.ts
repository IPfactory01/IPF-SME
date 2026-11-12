/**
 * The reminders (R12, R16, R57, R78; ET 11 November 2026). One run each morning at 07:31 Lagos time, called by Vercel
 * Cron with CRON_SECRET, so it works on any Vercel plan and never at night:
 *  - each unpaid fee: five days before its date, on the day, three days late, and seven days late, when work pauses
 *    (D6) and the lead is told too;
 *  - the client's open items (Data Requests, actions, requests): two days before their date and two days after it, one
 *    email per engagement listing them; then the lead, what is still outstanding after that;
 *  - a First edit or draft due within a day, or past its time, to the person it goes to, and once late to the lead.
 * Each reminder has a window of days, so a run that did not happen is caught up by the next one, and each is recorded in
 * engagement_reminders before it is sent, so none goes twice. A failed email is in the delivery log.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { adminAccessAuditEvents, engagementReminders, engagementSessions, engagementTasks, engagementTeam, engagements, users } from "../drizzle/schema";
import { addDays, lagosDay } from "../shared/agreement";
import { BRAND } from "../shared/brand";
import { formatNaira } from "../shared/businessSupport";
import { OPEN_TASK_STATUSES, TURNAROUND_LABELS } from "../shared/engagement";
import { engagementTitle } from "../shared/engagementTypes";
import { dayInWords } from "../shared/requests";
import { firstNameOf, whatsappLink } from "../shared/whatsapp";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { ENV } from "./_core/env";
import { clientFees, feeContext } from "./feePayments";
import { lagosTime } from "./lagosTime";
import { businessNameOf, clientPeopleFor, teamPersonFor } from "./requestEmails";
import { getTrustedApplicationOrigin } from "./security";
import { clientOf, teamOf } from "./sessionInvitations";
import { mainContactOf } from "./teamContact";

/** No reminder between 9pm and 7am Lagos time (R57). */
export const QUIET_FROM_HOUR = 21;
export const QUIET_UNTIL_HOUR = 7;
const HOUR = 3_600_000;

/** The fee reminders, by days after its date (negative: before), each sent once while today is in its window. */
export const FEE_STAGES = [
  { stage: "soon", from: -5, to: -1 },
  { stage: "today", from: 0, to: 2 },
  { stage: "late_3", from: 3, to: 6 },
  { stage: "late_7", from: 7, to: 13 },
] as const;
/** The item reminders: two days before, two days after, and the lead once the client was reminded. */
export const ITEM_STAGES = [
  { stage: "soon", from: -2, to: -1 },
  { stage: "late", from: 2, to: 6 },
  { stage: "lead", from: 3, to: 10 },
] as const;

type FeeStage = (typeof FEE_STAGES)[number]["stage"];
type ItemStage = (typeof ITEM_STAGES)[number]["stage"];

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
export const feeStageOn = (dueOn: string, today: string): FeeStage | null => {
  const day = daysBetween(dueOn, today);
  return FEE_STAGES.find(item => day >= item.from && day <= item.to)?.stage ?? null;
};
export const itemStagesOn = (dueOn: string, today: string): ItemStage[] => {
  const day = daysBetween(dueOn, today);
  return ITEM_STAGES.filter(item => day >= item.from && day <= item.to).map(item => item.stage);
};

/** The hour in Lagos, for quiet hours. */
export const lagosHour = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).format(now));
export const isQuietHour = (now: Date) => { const hour = lagosHour(now); return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR; };

const hello = (name: string) => `Hello${firstNameOf(name) ? ` ${firstNameOf(name)}` : ""},`;
const sign = BRAND.organisationName;

/** A fee reminder to the payer, at its stage: coming up, due today, late, or seven days late with work paused. */
export function feeReminderEmail(input: { stage: FeeStage; name: string; title: string; label: string; left: number; dueOn: string; reference: string; payUrl: string | null; roomUrl: string }) {
  const amount = formatNaira(input.left);
  const due = dayInWords(input.dueOn);
  const subjects: Record<FeeStage, string> = {
    soon: `Coming up: ${input.label}, ${amount} due ${due}`,
    today: `Due today: ${input.label}, ${amount}`,
    late_3: `Now late: ${input.label}, ${amount} was due ${due}`,
    late_7: `Work on your ${input.title} is paused: ${input.label}`,
  };
  const opening: Record<FeeStage, string> = {
    soon: `A reminder that ${input.label} for your ${input.title} is due on ${due}: ${amount}.`,
    today: `${input.label} for your ${input.title} is due today: ${amount}.`,
    late_3: `${input.label} for your ${input.title} was due on ${due} and is not paid yet: ${amount} is left to pay.`,
    late_7: `${input.label} for your ${input.title} was due on ${due} and is still not paid, so work on it is paused. Paying what is left, ${amount}, starts it again at once.`,
  };
  const lines = [hello(input.name), "", opening[input.stage], ""];
  lines.push(input.payUrl ? `Pay securely with Paystack: ${input.payUrl}` : `Your room has the details to pay: ${input.roomUrl}`);
  lines.push(`Reference: ${input.reference}`, "", "If you have already paid, thank you: you can ignore this email.", "", sign);
  return { subject: subjects[input.stage], body: lines.join("\n") };
}

/** To the lead when a fee is seven days late and work pauses. */
export function feePausedLeadEmail(input: { businessName: string; title: string; label: string; left: number; dueOn: string }) {
  return {
    subject: `Work paused: ${input.businessName}, ${input.label}`,
    body: [
      "Hello,", "",
      `${input.businessName}'s ${input.title}: ${input.label} was due on ${dayInWords(input.dueOn)} and ${formatNaira(input.left)} is still unpaid, so work is paused (D6). The client has been sent the pay link four times.`, "",
      "To give them more time, set a new date in the engagement's Fees. Paying lifts the pause at once.", "",
      `${getTrustedApplicationOrigin()}/admin`, "", sign,
    ].join("\n"),
  };
}

type Item = { title: string; dueOn: string };
const whatOf = (items: Item[]) => (items.length === 1 ? items[0]!.title : `${items[0]!.title} and ${items.length - 1} more`);

/** The client's items coming up in two days or tomorrow, or still open two days after their date: one email per engagement. */
export function itemsReminderEmail(input: { stage: "soon" | "late"; name: string; title: string; items: Item[]; roomUrl: string }) {
  const list = input.items.map(item => `• ${item.title}, due ${dayInWords(item.dueOn)}`);
  return input.stage === "soon"
    ? {
      subject: `Coming up: ${whatOf(input.items)}, due ${dayInWords(input.items[0]!.dueOn)}`,
      body: [hello(input.name), "", `${input.items.length === 1 ? "This is" : "These are"} due soon for your ${input.title}:`, "", ...list, "", `Send ${input.items.length === 1 ? "it" : "them"}, or tell us if something is not available, in your room: ${input.roomUrl}`, "", sign].join("\n"),
    }
    : {
      subject: `Still waiting: ${whatOf(input.items)}`,
      body: [hello(input.name), "", `We are still waiting for ${input.items.length === 1 ? "this" : "these"} for your ${input.title}:`, "", ...list, "", `Send ${input.items.length === 1 ? "it" : "them"} in your room, or say there if you do not have ${input.items.length === 1 ? "it" : "them"}: ${input.roomUrl}`, "", sign].join("\n"),
    };
}

/** To the lead: what is still outstanding after the client was reminded. */
export function outstandingLeadEmail(input: { businessName: string; items: Item[]; today: string }) {
  return {
    subject: `Outstanding after reminders: ${input.businessName}`,
    body: [
      "Hello,", "",
      `${input.businessName} has been reminded, and these are still open:`, "",
      ...input.items.map(item => `• ${item.title}, due ${dayInWords(item.dueOn)} (${daysBetween(item.dueOn, input.today)} days late)`), "",
      `Follow up with them, or move the dates in the Work Plan: ${getTrustedApplicationOrigin()}/admin`, "", sign,
    ].join("\n"),
  };
}

/** A First edit or draft due within a day, or past its time, to the person it goes to (and once late, the lead). */
export function clockReminderEmail(input: { late: boolean; name: string; label: string; title: string; businessName: string; dueAt: Date }) {
  const when = lagosTime(input.dueAt);
  return {
    subject: input.late ? `${input.label} past its time: ${input.title}, ${input.businessName}` : `${input.label} due within a day: ${input.title}`,
    body: [
      hello(input.name), "",
      input.late
        ? `The ${input.label.toLowerCase()} from "${input.title}" for ${input.businessName} was due by ${when} (Lagos time), 48 hours after it arrived, and is not shared yet.`
        : `The ${input.label.toLowerCase()} from "${input.title}" for ${input.businessName} is due by ${when} (Lagos time).`,
      "", `Once it is on the content board, press "${input.label} shared" on the item: ${getTrustedApplicationOrigin()}/admin`, "", sign,
    ].join("\n"),
  };
}

/** Claims a reminder: true the first time its key is seen, so it is sent; false ever after. */
async function claim(db: Database, key: string, kind: string, engagementId: number) {
  const rows = await db.insert(engagementReminders).values({ key: key.slice(0, 200), kind, engagementId }).onConflictDoNothing().returning({ id: engagementReminders.id });
  return rows.length > 0;
}

/** The engagement's lead (its Engagement Manager or Lead Consultant) who still has access, else the office. */
async function leadsOf(db: Pick<Database, "select">, engagementId: number) {
  const leads = await db.select({ email: users.email }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id))
    .where(and(eq(engagementTeam.engagementId, engagementId), inArray(engagementTeam.role, ["manager", "lead"]), eq(users.status, "active")));
  const emails = Array.from(new Set(leads.flatMap(lead => (lead.email ? [lead.email] : []))));
  return emails.length ? emails : [BUSINESS_SUPPORT_MAILBOX];
}

async function send(to: string, message: { subject: string; body: string }, businessCheckId: number | null) {
  try {
    await deliverEmail({ to, subject: message.subject, body: message.body, sender: "business_support", businessCheckId: businessCheckId ?? undefined });
    return 1;
  } catch (error) {
    console.error("[Reminders] An email could not be sent:", error instanceof Error ? error.message : error);
    return 0;
  }
}

export type ReminderRun = { ran: true; fees: number; items: number; leads: number; clocks: number; sessions: number } | { ran: false; reason: "quiet_hours" };

const lagosClock = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).format(date);

/** A booked Session tomorrow, or later today (R59): the time in Lagos, the Join link and, for the client, whom to tell on WhatsApp. */
export function sessionReminderEmail(input: { when: "tomorrow" | "today"; title: string; businessName: string; start: Date; minutes: number; meetingLink: string | null; name: string; forClient: boolean; contact: { name: string; whatsapp: string } | null; origin: string }) {
  const time = lagosClock(input.start);
  const withWhom = input.forClient ? "with your team at IP Factory" : `with ${input.businessName}`;
  const first = firstNameOf(input.name);
  const lines = [`Hello${first ? ` ${first}` : ""},`, "", `${input.when === "tomorrow" ? "Tomorrow" : "Today"}: ${input.title} ${withWhom}, ${lagosTime(input.start)} (Lagos time), for ${input.minutes} minutes.`, ""];
  lines.push(input.meetingLink ? `Join: ${input.meetingLink}` : "Join: the link will be in the room before the Session.");
  if (input.contact) lines.push("", `Running late or cannot make it? Tell ${firstNameOf(input.contact.name) || "your team"} on WhatsApp: ${whatsappLink(input.contact.whatsapp, `Hello ${firstNameOf(input.contact.name)}, about ${input.title} at ${time}:`)}`);
  lines.push("", input.forClient ? `Your room: ${input.origin}/dashboard` : `The engagement: ${input.origin}/admin`, "", BRAND.organisationName);
  return { subject: `${input.when === "tomorrow" ? "Tomorrow" : "Today"}: ${input.title} at ${time}`, body: lines.join("\n") };
}

/** One morning run: every reminder due today, each once. Never between 9pm and 7am Lagos time. */
export async function runReminders(db: Database, now = new Date()): Promise<ReminderRun> {
  if (isQuietHour(now)) {
    await recordAudit(db, { action: "reminders_run", actorUserId: null, details: { ran: false, reason: "quiet_hours" } });
    return { ran: false, reason: "quiet_hours" };
  }
  const today = lagosDay(now);
  const roomUrl = `${getTrustedApplicationOrigin()}/dashboard`;
  const counts = { fees: 0, items: 0, leads: 0, clocks: 0, sessions: 0 };
  const tomorrow = addDays(today, 1);
  const open = await db.select().from(engagements).where(ne(engagements.stage, "closed"));
  for (const engagement of open) {
    try {
      // Fees: the payer at each stage; at seven days late, the lead too.
      for (const fee of await clientFees(db, engagement.id)) {
        if (fee.id <= 0 || fee.paid || fee.left <= 0 || !fee.dueOn) continue;
        const stage = feeStageOn(fee.dueOn, today);
        if (!stage || !(await claim(db, `fee:${fee.id}:${fee.dueOn}:${stage}`, `fee_${stage}`, engagement.id))) continue;
        const found = await feeContext(db, fee.id);
        if (!found) continue;
        if (found.payer) {
          const payUrl = fee.payPath ? `${getTrustedApplicationOrigin()}${fee.payPath}` : null;
          counts.fees += await send(found.payer.email, feeReminderEmail({ stage, name: found.payer.name, title: found.title, label: fee.label, left: fee.left, dueOn: fee.dueOn, reference: fee.reference, payUrl, roomUrl }), engagement.businessCheckId);
        }
        if (stage === "late_7") for (const to of await leadsOf(db, engagement.id)) counts.leads += await send(to, feePausedLeadEmail({ businessName: found.businessName, title: found.title, label: fee.label, left: fee.left, dueOn: fee.dueOn }), null);
      }
      const tasks = await db.select().from(engagementTasks).where(and(eq(engagementTasks.engagementId, engagement.id), eq(engagementTasks.side, "client")));
      const businessName = await businessNameOf(db, engagement);
      const title = engagementTitle(engagement.type, engagement.service);
      // The client's items, while the room is open: grouped per stage into one email to the people they reach.
      if (!engagement.opensOnPayment && engagement.businessId !== null) {
        const waiting = tasks.filter(task => OPEN_TASK_STATUSES.includes(task.status) && task.dueOn);
        const byStage: Record<ItemStage, (typeof waiting)> = { soon: [], late: [], lead: [] };
        for (const task of waiting) {
          for (const stage of itemStagesOn(task.dueOn!, today)) {
            if (await claim(db, `item:${task.id}:${task.dueOn}:${stage}`, `item_${stage}`, engagement.id)) byStage[stage].push(task);
          }
        }
        const sortByDue = (list: typeof waiting) => [...list].sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.sortOrder - b.sortOrder || a.id - b.id);
        for (const stage of ["soon", "late"] as const) {
          const list = sortByDue(byStage[stage]);
          if (!list.length) continue;
          // Everyone who sees them all; a person in the business an item is for also hears of their own.
          const owners = await clientPeopleFor(db, engagement.businessId, null);
          const assignees = Array.from(new Set(list.map(task => task.assigneeUserId).filter((id): id is number => id !== null)));
          const people = new Map(owners.map(person => [person.email.toLowerCase(), { ...person, items: list }]));
          for (const assignee of assignees) {
            for (const person of await clientPeopleFor(db, engagement.businessId, assignee)) {
              if (!people.has(person.email.toLowerCase())) people.set(person.email.toLowerCase(), { ...person, items: list.filter(task => task.assigneeUserId === assignee) });
            }
          }
          for (const person of Array.from(people.values())) {
            counts.items += await send(person.email, itemsReminderEmail({ stage, name: person.name, title, items: person.items.map(task => ({ title: task.title, dueOn: task.dueOn! })), roomUrl }), engagement.businessCheckId);
          }
        }
        const outstanding = sortByDue(byStage.lead);
        if (outstanding.length) {
          for (const to of await leadsOf(db, engagement.id)) counts.leads += await send(to, outstandingLeadEmail({ businessName, items: outstanding.map(task => ({ title: task.title, dueOn: task.dueOn! })), today }), null);
        }
      }
      // The First edit's clock: due within a day, or past its time.
      for (const task of tasks.filter(item => item.turnaround && item.followUpDueAt && !item.followUpDoneAt && item.status !== "cancelled")) {
        const left = task.followUpDueAt!.getTime() - now.getTime();
        const late = left < 0;
        if (!late && left > 24 * HOUR) continue;
        if (late && left < -7 * 24 * HOUR) continue;
        if (!(await claim(db, `clock:${task.id}:${task.followUpDueAt!.toISOString()}:${late ? "late" : "soon"}`, late ? "clock_late" : "clock_soon", engagement.id))) continue;
        const label = TURNAROUND_LABELS[task.turnaround!];
        const person = await teamPersonFor(db, task);
        counts.clocks += await send(person.email, clockReminderEmail({ late, name: person.name, label, title: task.title, businessName, dueAt: task.followUpDueAt! }), null);
        if (late) for (const to of (await leadsOf(db, engagement.id)).filter(email => email !== person.email)) counts.leads += await send(to, clockReminderEmail({ late, name: "", label, title: task.title, businessName, dueAt: task.followUpDueAt! }), null);
      }
      // Sessions (R59): the morning before, and the morning of, each booked Session; a moved one is reminded again.
      const booked = await db.select().from(engagementSessions).where(and(eq(engagementSessions.engagementId, engagement.id), eq(engagementSessions.status, "planned")));
      for (const session of booked) {
        if (!session.scheduledFor || session.scheduledFor.getTime() <= now.getTime()) continue;
        const day = lagosDay(session.scheduledFor);
        const when = day === tomorrow ? "tomorrow" : day === today ? "today" : null;
        if (!when || !(await claim(db, `session:${session.id}:${session.scheduledFor.toISOString()}:${when}`, `session_${when}`, engagement.id))) continue;
        const contact = await mainContactOf(db, engagement.id);
        const client = engagement.opensOnPayment ? null : await clientOf(db, engagement);
        const people = new Map<string, { email: string; name: string; forClient: boolean }>();
        for (const member of await teamOf(db, engagement.id, now.getTime())) people.set(member.email.toLowerCase(), { email: member.email, name: member.name, forClient: false });
        if (client) people.set(client.email.toLowerCase(), { ...client, forClient: true });
        for (const person of Array.from(people.values())) {
          const message = sessionReminderEmail({ when, title: session.title, businessName, start: session.scheduledFor, minutes: session.durationMinutes ?? 60, meetingLink: session.meetingLink, name: person.name, forClient: person.forClient, contact: person.forClient ? contact : null, origin: getTrustedApplicationOrigin() });
          counts.sessions += await send(person.email, message, person.forClient ? engagement.businessCheckId : null);
        }
      }
    } catch (error) {
      console.error(`[Reminders] Engagement ${engagement.id} was skipped:`, error instanceof Error ? error.message : error);
    }
  }
  await recordAudit(db, { action: "reminders_run", actorUserId: null, details: { ran: true, today, ...counts } });
  return { ran: true, ...counts };
}

/** Whether a request carries Vercel Cron's secret, compared in constant time. False when no secret is set. */
export function isCronRequest(authorization: string | undefined, secret = ENV.cronSecret) {
  if (!secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${secret}`));
}

/** For /api/health: whether the reminders are set up, and when the last run was. */
export async function remindersStatus(db: Pick<Database, "select"> | null) {
  const configured = Boolean(ENV.cronSecret);
  if (!db) return { configured, lastRunAt: null };
  try {
    const last = (await db.select({ createdAt: adminAccessAuditEvents.createdAt }).from(adminAccessAuditEvents)
      .where(eq(adminAccessAuditEvents.action, "reminders_run")).orderBy(desc(adminAccessAuditEvents.id)).limit(1))[0];
    return { configured, lastRunAt: last?.createdAt ?? null };
  } catch {
    return { configured, lastRunAt: null };
  }
}

