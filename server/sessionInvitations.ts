/**
 * Session emails (R75, ET 10 November 2026). When a Session gets a time, or its time, length, Join link or title changes,
 * or it is cancelled, everyone on the engagement is emailed: the time in Lagos, the Join link and a calendar invitation.
 * The invitation keeps one UID per Session, so a later one moves it in each calendar and a cancellation removes it. The
 * team is always emailed (people whose access has ended are not); the client too, unless they booked the Session on
 * Calendly themselves, since Calendly has already emailed them. A failure is logged and never stops the Session saving.
 */
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { businessChecks, businessMemberships, businesses, engagementSessions, engagementTeam, engagements, userPlatformRoles, users } from "../drizzle/schema";
import { firstNameOf } from "../shared/whatsapp";
import type { Database } from "./accountAuth";
import { OWNER_ADMIN_EMAIL } from "./adminSecurity";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { getTrustedApplicationOrigin } from "./security";

/** What happened to a Session that is worth an email. */
export type SessionChange = "booked" | "moved" | "updated" | "cancelled";
type SessionFields = { title: string; scheduledFor: Date | null; durationMinutes: number | null; meetingLink: string | null; status: string };

/** A Session without a length is held for an hour in calendars. */
const DEFAULT_MINUTES = 60;

/**
 * Whether a save is worth an email: a time given (booked), a new time (moved), a new length, link or title (updated), or
 * a Session with a time cancelled. A Session held, one with no time yet, one already past, or a change to its agenda or
 * notes alone sends nothing.
 */
export function sessionChange(before: SessionFields | null, after: SessionFields, now = Date.now()): SessionChange | null {
  if (after.status === "cancelled") {
    return before && before.status !== "cancelled" && before.scheduledFor && before.scheduledFor.getTime() > now ? "cancelled" : null;
  }
  if (after.status !== "planned" || !after.scheduledFor || after.scheduledFor.getTime() <= now) return null;
  if (!before || !before.scheduledFor || before.status === "cancelled") return "booked";
  if (before.scheduledFor.getTime() !== after.scheduledFor.getTime()) return "moved";
  if (before.durationMinutes !== after.durationMinutes || (before.meetingLink ?? null) !== (after.meetingLink ?? null) || before.title !== after.title) return "updated";
  return null;
}

const icsTime = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 characters are folded, as the calendar format requires. */
const fold = (line: string) => line.length <= 75 ? line : line.match(/.{1,74}/g)!.map((part, index) => (index ? ` ${part}` : part)).join("\r\n");

/**
 * The calendar invitation for one person: one UID per Session, a SEQUENCE that rises with each email (seconds since
 * 1970, so a later email always wins), from the office mailbox. A cancellation removes the event.
 */
type IcsEvent = { sessionId: number; title: string; businessName: string; start: Date; minutes: number; meetingLink: string | null };

/** One Session as a calendar event: one UID per Session, so a later invitation moves it. */
function sessionEvent(input: IcsEvent & { attendee: { name: string; email: string }; cancelled: boolean; now: number }) {
  const end = new Date(input.start.getTime() + input.minutes * 60_000);
  const description = [input.meetingLink ? `Join: ${input.meetingLink}` : "The Join link will be in the room before the Session.", `Business: ${input.businessName}`].join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:session-${input.sessionId}@ipfactory.co`,
    `SEQUENCE:${Math.floor(input.now / 1000)}`,
    `DTSTAMP:${icsTime(new Date(input.now))}`,
    `DTSTART:${icsTime(input.start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(`${input.title}: ${input.businessName}`)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(input.meetingLink ? [`LOCATION:${icsText(input.meetingLink)}`, `URL:${input.meetingLink}`] : []),
    `ORGANIZER;CN=IP Factory:mailto:${BUSINESS_SUPPORT_MAILBOX}`,
    `ATTENDEE;CN=${icsText(input.attendee.name || input.attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${input.attendee.email}`,
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

const calendar = (method: string, events: string[][]) =>
  `${["BEGIN:VCALENDAR", "PRODID:-//IP Factory//The Shift//EN", "VERSION:2.0", "CALSCALE:GREGORIAN", `METHOD:${method}`, ...events.flat(), "END:VCALENDAR"].map(fold).join("\r\n")}\r\n`;

export function sessionInvitationIcs(input: IcsEvent & { attendee: { name: string; email: string }; cancelled: boolean; now?: number }) {
  return calendar(input.cancelled ? "CANCEL" : "REQUEST", [sessionEvent({ ...input, now: input.now ?? Date.now() })]);
}

/**
 * A series of Sessions in one calendar file (R79): every Check-in booked at the standing slot. Published, since one
 * invitation may hold one event only; each keeps its own UID, so a later change to one moves just that one (R75).
 */
export function sessionSeriesIcs(input: { events: IcsEvent[]; attendee: { name: string; email: string }; now?: number }) {
  const now = input.now ?? Date.now();
  return calendar("PUBLISH", input.events.map(event => sessionEvent({ ...event, attendee: input.attendee, cancelled: false, now })));
}

/** The email for a booked series: the slot, each date, and the Join link. */
export function seriesEmail(input: { name: string; forClient: boolean; businessName: string; slot: string; sessions: { title: string; start: Date }[]; meetingLink: string | null; origin: string }) {
  const name = firstNameOf(input.name);
  const withWhom = input.forClient ? "with your team at IP Factory" : `with ${input.businessName}`;
  return {
    subject: `Check-ins booked: every ${input.slot}`,
    body: [
      `Hello${name ? ` ${name}` : ""},`, "",
      `Your Check-ins ${withWhom} are booked for every ${input.slot} (Lagos time):`, "",
      ...input.sessions.map(session => `• ${session.title}: ${lagosTime(session.start)}`), "",
      input.meetingLink ? `Join: ${input.meetingLink}` : "Join: the link will be in the room before each Check-in.", "",
      "The calendar file attached adds them all to your calendar. If one moves, you will be sent its new time.", "",
      input.forClient ? `Your room: ${input.origin}/dashboard` : `The engagement: ${input.origin}/admin`,
    ].join("\n"),
  };
}

/** The email to one person about one change: the team's names the business; the client's names their team. */
export function sessionEmail(input: {
  change: SessionChange; title: string; businessName: string; start: Date; minutes: number; meetingLink: string | null;
  name: string; forClient: boolean; origin: string;
}) {
  const when = lagosTime(input.start);
  const withWhom = input.forClient ? "with your team at IP Factory" : `with ${input.businessName}`;
  const subjects: Record<SessionChange, string> = {
    booked: `Session booked: ${input.title}, ${when}`,
    moved: `Session moved: ${input.title}, now ${when}`,
    updated: `Session updated: ${input.title}, ${when}`,
    cancelled: `Session cancelled: ${input.title}, ${when}`,
  };
  const opening: Record<SessionChange, string> = {
    booked: `${input.title} ${withWhom} is booked for ${when} (Lagos time), for ${input.minutes} minutes.`,
    moved: `${input.title} ${withWhom} has moved. It is now on ${when} (Lagos time), for ${input.minutes} minutes.`,
    updated: `${input.title} ${withWhom} on ${when} (Lagos time) has new details. The time stays the same.`,
    cancelled: `${input.title} ${withWhom} on ${when} (Lagos time) is cancelled.`,
  };
  const name = firstNameOf(input.name);
  const lines = input.change === "cancelled"
    ? [`Hello${name ? ` ${name}` : ""},`, "", opening.cancelled, "", "The calendar invitation attached takes it out of your calendar."]
    : [
      `Hello${name ? ` ${name}` : ""},`, "", opening[input.change], "",
      input.meetingLink ? `Join: ${input.meetingLink}` : "Join: the link will be in the room before the Session.",
      "", "The calendar invitation is attached. Open it to add the Session to your calendar; if the time changes, it moves by itself.",
    ];
  lines.push("", input.forClient ? `Your room: ${input.origin}/dashboard` : `The engagement: ${input.origin}/admin`);
  return { subject: subjects[input.change], body: lines.join("\n") };
}

/** The client's contact for an engagement: the business owner, else the engagement's contact, else the check. */
export async function clientOf(db: Pick<Database, "select">, engagement: typeof engagements.$inferSelect) {
  if (engagement.businessId !== null) {
    const owner = (await db.select({ email: users.email, name: users.name }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
      .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
    if (owner?.email) return { email: owner.email, name: owner.name ?? engagement.contactName ?? "" };
  }
  if (engagement.contactEmail) return { email: engagement.contactEmail, name: engagement.contactName ?? "" };
  if (engagement.businessCheckId !== null) {
    const check = (await db.select({ email: businessChecks.email, fullName: businessChecks.fullName }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0];
    if (check?.email) return { email: check.email, name: check.fullName };
  }
  return null;
}

/**
 * The team on an engagement who still have access: active, with a role that has not ended (or the Super Admin), with
 * their role on it. Session emails and the request emails (R78) reach only these people.
 */
export async function teamOf(db: Pick<Database, "select">, engagementId: number, now: number) {
  const members = await db.select({ userId: users.id, email: users.email, name: users.name, role: engagementTeam.role }).from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id))
    .where(and(eq(engagementTeam.engagementId, engagementId), eq(users.status, "active")));
  if (!members.length) return [];
  const live = new Set((await db.select({ userId: userPlatformRoles.userId }).from(userPlatformRoles)
    .where(and(inArray(userPlatformRoles.userId, members.map(member => member.userId)), or(isNull(userPlatformRoles.expiresAt), gt(userPlatformRoles.expiresAt, new Date(now)))))).map(row => row.userId));
  return members.filter(member => member.email && (live.has(member.userId) || member.email.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase()))
    .map(member => ({ userId: member.userId, role: member.role, email: member.email!, name: member.name ?? "" }));
}

/**
 * Emails everyone on the engagement about one Session change, each with their own calendar invitation. Never throws:
 * an email that fails is in the delivery log, and shows in Emails that did not arrive when it was for the client.
 */
export async function sendSessionEmails(db: Pick<Database, "select">, input: { sessionId: number; change: SessionChange; includeClient: boolean; now?: number }) {
  const now = input.now ?? Date.now();
  try {
    const session = (await db.select().from(engagementSessions).where(eq(engagementSessions.id, input.sessionId)).limit(1))[0];
    if (!session?.scheduledFor) return { sent: 0 };
    const engagement = (await db.select().from(engagements).where(eq(engagements.id, session.engagementId)).limit(1))[0];
    if (!engagement) return { sent: 0 };
    const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
    const check = !business && engagement.businessCheckId !== null
      ? (await db.select({ businessName: businessChecks.businessName, fullName: businessChecks.fullName }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0]
      : undefined;
    const businessName = business?.name ?? (check?.businessName || null) ?? engagement.contactName ?? check?.fullName ?? "";
    const client = input.includeClient ? await clientOf(db, engagement) : null;
    const team = await teamOf(db, engagement.id, now);
    const people = new Map<string, { email: string; name: string; forClient: boolean }>();
    for (const member of team) people.set(member.email.toLowerCase(), { email: member.email, name: member.name, forClient: false });
    if (client) people.set(client.email.toLowerCase(), { ...client, forClient: true });
    const minutes = session.durationMinutes ?? DEFAULT_MINUTES;
    const origin = getTrustedApplicationOrigin();
    const sequence = Math.floor(now / 1000);
    const results = await Promise.allSettled(Array.from(people.values()).map(person => {
      const message = sessionEmail({ change: input.change, title: session.title, businessName, start: session.scheduledFor!, minutes, meetingLink: session.meetingLink, name: person.name, forClient: person.forClient, origin });
      return deliverEmail({
        to: person.email, subject: message.subject, body: message.body,
        icsContent: sessionInvitationIcs({ sessionId: session.id, title: session.title, businessName, start: session.scheduledFor!, minutes, meetingLink: session.meetingLink, attendee: person, cancelled: input.change === "cancelled", now }),
        icsFilename: input.change === "cancelled" ? "session-cancelled.ics" : "session.ics",
        idempotencyKey: `sessions:${session.id}:${sequence}:${person.email.toLowerCase()}`,
        businessCheckId: engagement.businessCheckId ?? undefined,
      });
    }));
    return { sent: results.filter(result => result.status === "fulfilled").length };
  } catch (error) {
    console.error("[Sessions] The Session emails could not be sent:", error instanceof Error ? error.message : error);
    return { sent: 0 };
  }
}

/** Emails everyone on the engagement the booked series, each with one calendar file of every Check-in in it (R79). Never throws. */
export async function sendSeriesEmails(db: Pick<Database, "select">, input: { engagementId: number; sessionIds: number[]; slot: string; now?: number }) {
  const now = input.now ?? Date.now();
  try {
    const engagement = (await db.select().from(engagements).where(eq(engagements.id, input.engagementId)).limit(1))[0];
    if (!engagement || !input.sessionIds.length) return { sent: 0 };
    const sessions = (await db.select().from(engagementSessions).where(inArray(engagementSessions.id, input.sessionIds)))
      .filter(session => session.scheduledFor).sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());
    const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
    const businessName = business?.name ?? engagement.contactName ?? "";
    const people = new Map<string, { email: string; name: string; forClient: boolean }>();
    for (const member of await teamOf(db, engagement.id, now)) people.set(member.email.toLowerCase(), { email: member.email, name: member.name, forClient: false });
    const client = await clientOf(db, engagement);
    if (client) people.set(client.email.toLowerCase(), { ...client, forClient: true });
    const events = sessions.map(session => ({ sessionId: session.id, title: session.title, businessName, start: session.scheduledFor!, minutes: session.durationMinutes ?? DEFAULT_MINUTES, meetingLink: session.meetingLink }));
    const meetingLink = sessions.find(session => session.meetingLink)?.meetingLink ?? null;
    const origin = getTrustedApplicationOrigin();
    const results = await Promise.allSettled(Array.from(people.values()).map(person => {
      const message = seriesEmail({ name: person.name, forClient: person.forClient, businessName, slot: input.slot, sessions: sessions.map(session => ({ title: session.title, start: session.scheduledFor! })), meetingLink, origin });
      return deliverEmail({
        to: person.email, subject: message.subject, body: message.body,
        icsContent: sessionSeriesIcs({ events, attendee: person, now }), icsFilename: "check-ins.ics",
        idempotencyKey: `series:${engagement.id}:${Math.floor(now / 1000)}:${person.email.toLowerCase()}`,
        businessCheckId: person.forClient ? engagement.businessCheckId ?? undefined : undefined,
      });
    }));
    return { sent: results.filter(result => result.status === "fulfilled").length };
  } catch (error) {
    console.error("[Sessions] The series emails could not be sent:", error instanceof Error ? error.message : error);
    return { sent: 0 };
  }
}
