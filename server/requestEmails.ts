/**
 * Asking the client, with a conversation on each item (R78, ET 11 November 2026): the emails. A request reaches the
 * owner; each message in an item's conversation reaches the other side; what the client sends tells the person it goes
 * to, with the First edit's due time; a First edit shared tells the owner. Each one is best effort: a failure is in the
 * delivery log and the server log, and never undoes what was saved.
 */
import { and, eq, inArray } from "drizzle-orm";
import { businessChecks, businessMemberships, businesses, engagementReminders, engagementTaskOwners, engagementTasks, engagements, users } from "../drizzle/schema";
import { taskLink } from "../shared/links";
import { BRAND } from "../shared/brand";
import { TURNAROUND_HOURS, TURNAROUND_LABELS, type EngagementTaskTurnaround } from "../shared/engagement";
import { engagementTitle } from "../shared/engagementTypes";
import { dayInWords } from "../shared/requests";
import { firstNameOf } from "../shared/whatsapp";
import type { Database } from "./accountAuth";
import { BUSINESS_SUPPORT_MAILBOX, deliverEmail } from "./email";
import { lagosTime } from "./lagosTime";
import { getTrustedApplicationOrigin } from "./security";
import { teamOf } from "./sessionInvitations";
import { followUpOwnerOf } from "./teamContact";

type Db = Pick<Database, "select">;
const hello = (name: string) => `Hello${firstNameOf(name) ? ` ${firstNameOf(name)}` : ""},`;

/** The email that asks the client for something: who asked, what, the brief, the day, and any clock. */
export function requestEmail(input: { name: string; askedBy: string; title: string; brief: string | null; dueOn: string; turnaround: EngagementTaskTurnaround | null; engagementTitle: string; origin: string }) {
  const due = dayInWords(input.dueOn);
  const lines = [hello(input.name), "", `${firstNameOf(input.askedBy) || "Your team"} at IP Factory has asked for this, for your ${input.engagementTitle}:`, "", input.title];
  if (input.brief) lines.push("", input.brief);
  lines.push("", `Due: ${due}.`);
  if (input.turnaround) lines.push(`Once it arrives, we send you the ${TURNAROUND_LABELS[input.turnaround].toLowerCase()} within ${TURNAROUND_HOURS[input.turnaround]} hours.`);
  lines.push("", `Send it, or ask about it, in your room: ${input.origin}/dashboard`, "", BRAND.organisationName);
  return { subject: `New request: ${input.title}, due ${due}`, body: lines.join("\n") };
}

/** One message in an item's conversation, to the other side: the team member's first name to the client, the business's name to the team. */
export function messageEmail(input: { name: string; author: string; fromTeam: boolean; businessName: string; title: string; body: string; origin: string }) {
  const who = input.fromTeam ? firstNameOf(input.author) || "IP Factory" : input.businessName;
  const where = input.fromTeam ? `Reply in your room: ${input.origin}/dashboard` : `Reply in the engagement: ${input.origin}/admin`;
  const by = input.fromTeam ? `${who} at IP Factory` : `${input.author || "The client"} at ${input.businessName}`;
  return {
    subject: `${who} wrote on ${input.title}`,
    body: [hello(input.name), "", `${by} wrote on "${input.title}":`, "", input.body, "", where, "", BRAND.organisationName].join("\n"),
  };
}

/** What the client sent, to the person it goes to, with the clock where it has one. */
export function receivedEmail(input: { name: string; businessName: string; title: string; how: string | null; note: string | null; clock: { label: string; dueAt: Date; hours: number } | null; origin: string ; link?: string}) {
  const due = input.clock ? `. ${input.clock.label} due ${lagosTime(input.clock.dueAt)}` : "";
  const lines = [hello(input.name), "", `${input.businessName} has sent "${input.title}"${input.how ? ` (${input.how})` : ""}.`];
  if (input.note) lines.push(`Their note: ${input.note}`);
  if (input.clock) lines.push("", `The ${input.clock.label.toLowerCase()} is due by ${lagosTime(input.clock.dueAt)} (Lagos time): ${input.clock.hours} hours from when it arrived.`);
  lines.push("", `Open the item: ${input.link ?? `${input.origin}/admin`}`, "", BRAND.organisationName);
  return { subject: `Received from ${input.businessName}: ${input.title}${due}`, body: lines.join("\n") };
}

/** The First edit or draft is ready for the owner's approval. */
export function readyEmail(input: { name: string; label: string; title: string; origin: string }) {
  const what = input.label.toLowerCase();
  return {
    subject: `Ready for your approval: the ${what} of ${input.title}`,
    body: [hello(input.name), "", `The ${what} from "${input.title}" is in your room for your approval.`, "", `Open your room: ${input.origin}/dashboard`, "", BRAND.organisationName].join("\n"),
  };
}

/** An item with its engagement, the business's name and the engagement's name. */
async function itemOf(db: Db, taskId: number) {
  const task = (await db.select().from(engagementTasks).where(eq(engagementTasks.id, taskId)).limit(1))[0];
  if (!task) return null;
  const engagement = (await db.select().from(engagements).where(eq(engagements.id, task.engagementId)).limit(1))[0];
  if (!engagement) return null;
  return { task, engagement, businessName: await businessNameOf(db, engagement) };
}

/** What the team calls the client: the business, else the business on the check, else the contact. */
export async function businessNameOf(db: Db, engagement: typeof engagements.$inferSelect) {
  const business = engagement.businessId === null ? undefined : (await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, engagement.businessId)).limit(1))[0];
  if (business?.name) return business.name;
  const check = engagement.businessCheckId === null ? undefined : (await db.select({ businessName: businessChecks.businessName, fullName: businessChecks.fullName }).from(businessChecks).where(eq(businessChecks.id, engagement.businessCheckId)).limit(1))[0];
  return check?.businessName || engagement.contactName || check?.fullName || "the client";
}

/** The client's people an item reaches: the owner and anyone at the owner's level, and the person it is for. */
export async function clientPeopleFor(db: Db, businessId: number | null, assigneeUserId: number | null) {
  if (businessId === null) return [];
  const people = await db.select({ userId: users.id, name: users.name, email: users.email, role: businessMemberships.role }).from(businessMemberships)
    .innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, businessId), eq(businessMemberships.status, "active"), eq(users.status, "active")));
  return people.filter(person => person.email && (person.role !== "member" || person.userId === assigneeUserId)).map(person => ({ userId: person.userId, name: person.name ?? "", email: person.email! }));
}

/** The person on the team an item goes to, among those who still have access; the office when there is nobody. */
export async function teamPersonFor(db: Db, task: typeof engagementTasks.$inferSelect) {
  const person = followUpOwnerOf(await teamOf(db, task.engagementId, Date.now()), task);
  return person ? { userId: person.userId, name: person.name, email: person.email } : { userId: null, name: "", email: BUSINESS_SUPPORT_MAILBOX };
}

/** The item's other owners on the team (R89), with their emails, among those who still have access. */
async function sharedOwnersOf(db: Db, task: typeof engagementTasks.$inferSelect) {
  const ids = (await db.select({ userId: engagementTaskOwners.userId }).from(engagementTaskOwners).where(eq(engagementTaskOwners.taskId, task.id))).map(row => row.userId);
  return ids.length ? (await teamOf(db, task.engagementId, Date.now())).filter(person => ids.includes(person.userId)).map(person => ({ userId: person.userId, name: person.name, email: person.email })) : [];
}

async function sendAll(messages: { to: string; subject: string; body: string; businessCheckId: number | null }[]) {
  const results = await Promise.allSettled(messages.map(message => deliverEmail({ to: message.to, subject: message.subject, body: message.body, sender: "business_support", businessCheckId: message.businessCheckId ?? undefined })));
  return results.filter(result => result.status === "fulfilled").length;
}

const failed = (what: string) => (error: unknown) => {
  console.error(`[Requests] ${what} could not be emailed:`, error instanceof Error ? error.message : error);
  return 0;
};

/** A new request: the owner (and anyone at their level) hears what is asked and by when. Returns how many were emailed. */
export async function sendRequestEmail(db: Db, input: { taskId: number }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const { task, engagement } = item;
    const asker = task.requestedByUserId === null ? undefined : (await db.select({ name: users.name }).from(users).where(eq(users.id, task.requestedByUserId)).limit(1))[0];
    const origin = getTrustedApplicationOrigin();
    const people = await clientPeopleFor(db, engagement.businessId, task.assigneeUserId);
    return await sendAll(people.map(person => ({
      to: person.email, businessCheckId: engagement.businessCheckId,
      ...requestEmail({ name: person.name, askedBy: asker?.name ?? "", title: task.title, brief: task.detail, dueOn: task.dueOn!, turnaround: task.turnaround, engagementTitle: engagementTitle(engagement.type, engagement.service), origin }),
    })));
  } catch (error) {
    return failed("The request")(error);
  }
}

/**
 * A message in an item's conversation, to the other side: from the team, to the owner and the person in the business it
 * is for; from the client, to the person on the team it goes to. The writer is never emailed their own message.
 */
export async function sendMessageEmails(db: Db, input: { taskId: number; fromTeam: boolean; authorUserId: number; body: string }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const { task, engagement, businessName } = item;
    const author = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.authorUserId)).limit(1))[0];
    // From the client: the person it goes to and everyone who shares it (R89).
    const people = input.fromTeam ? await clientPeopleFor(db, engagement.businessId, task.assigneeUserId) : [await teamPersonFor(db, task), ...(await sharedOwnersOf(db, task))].filter((person, index, all) => all.findIndex(other => other.email === person.email) === index);
    const origin = getTrustedApplicationOrigin();
    return await sendAll(people.filter(person => person.userId !== input.authorUserId).map(person => ({
      to: person.email, businessCheckId: input.fromTeam ? engagement.businessCheckId : null,
      ...messageEmail({ name: person.name, author: author?.name ?? "", fromTeam: input.fromTeam, businessName, title: task.title, body: input.body, origin }),
    })));
  } catch (error) {
    return failed("A message")(error);
  }
}

/**
 * The client's side arrived: the person it goes to hears, with the First edit's due time where it has a clock. Only for
 * a request or an item with a clock (a Data Request of thirty records would send thirty emails), and never to the
 * person who marked it themselves.
 */
export async function sendReceivedEmail(db: Db, input: { taskId: number; actorUserId: number; how: string | null }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const { task, businessName } = item;
    if (task.requestedByUserId === null && task.turnaround === null) return 0;
    // The person it goes to and everyone who shares it (R89), never whoever marked it.
    const people = [await teamPersonFor(db, task), ...(await sharedOwnersOf(db, task))].filter((person, index, all) => person.userId !== input.actorUserId && all.findIndex(other => other.email === person.email) === index);
    if (!people.length) return 0;
    const clock = task.turnaround && task.followUpDueAt ? { label: TURNAROUND_LABELS[task.turnaround], dueAt: task.followUpDueAt, hours: TURNAROUND_HOURS[task.turnaround] } : null;
    return await sendAll(people.map(person => ({ to: person.email, businessCheckId: null, ...receivedEmail({ name: person.name, businessName, title: task.title, how: input.how, note: task.statusNote, clock, origin: getTrustedApplicationOrigin(), link: taskLink(getTrustedApplicationOrigin(), task.engagementId, task.id) }) })));
  } catch (error) {
    return failed("What arrived")(error);
  }
}

/** The First edit or draft is shared: the owner (and the person in the business it is for) is told it waits for their approval. */
export async function sendReadyEmail(db: Db, input: { taskId: number }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item?.task.turnaround) return 0;
    const { task, engagement } = item;
    const origin = getTrustedApplicationOrigin();
    const people = await clientPeopleFor(db, engagement.businessId, task.assigneeUserId);
    return await sendAll(people.map(person => ({ to: person.email, businessCheckId: engagement.businessCheckId, ...readyEmail({ name: person.name, label: TURNAROUND_LABELS[task.turnaround!], title: task.title, origin }) })));
  } catch (error) {
    return failed("The First edit")(error);
  }
}

/** A message on a team item (R86): inside IP Factory only, to the person the item is for. */
export function teamMessageEmail(input: { name: string; author: string; businessName: string; title: string; body: string; origin: string ; link?: string}) {
  return {
    subject: `${firstNameOf(input.author) || "A colleague"} wrote on your item: ${input.title}`,
    body: [hello(input.name), "", `${input.author || "A colleague"} wrote on "${input.title}" (${input.businessName}):`, "", input.body, "", `Reply in the engagement: ${input.link ?? `${input.origin}/admin`}`, "", BRAND.organisationName].join("\n"),
  };
}

/** Tagged in an item's messages (R86): who, where, what they wrote. */
export function mentionEmail(input: { name: string; author: string; businessName: string; title: string; body: string; origin: string ; link?: string}) {
  return {
    subject: `${firstNameOf(input.author) || "A colleague"} mentioned you on ${input.title}`,
    body: [hello(input.name), "", `${input.author || "A colleague"} mentioned you on "${input.title}" (${input.businessName}):`, "", input.body, "", `Open it: ${input.link ?? `${input.origin}/admin`}`, "", BRAND.organisationName].join("\n"),
  };
}

/** A team item handed in for review (R86), to the engagement's lead. */
export function readyForReviewEmail(input: { name: string; author: string; businessName: string; title: string; origin: string ; link?: string}) {
  return {
    subject: `Ready for review: ${input.title}, ${input.businessName}`,
    body: [hello(input.name), "", `${input.author || "A colleague"} has handed in "${input.title}" for ${input.businessName}. Its files, link and messages are on the item.`, "", `Review it, then mark it done or ask for more: ${input.link ?? `${input.origin}/admin`}`, "", BRAND.organisationName].join("\n"),
  };
}

/** The team members, by id, with their emails, among those who still have access. */
async function teamPeople(db: Db, engagementId: number, userIds: readonly number[]) {
  return (await teamOf(db, engagementId, Date.now())).filter(person => userIds.includes(person.userId));
}

/** Emails the person a team item is for about a message on it, never the writer. Returns how many were emailed. */
export async function sendTeamItemEmails(db: Db, input: { taskId: number; authorUserId: number; body: string; to: number[] }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const author = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.authorUserId)).limit(1))[0];
    const people = await teamPeople(db, item.task.engagementId, input.to.filter(id => id !== input.authorUserId));
    const origin = getTrustedApplicationOrigin();
    return await sendAll(people.map(person => ({ to: person.email, businessCheckId: null, ...teamMessageEmail({ name: person.name, author: author?.name ?? "", businessName: item.businessName, title: item.task.title, body: input.body, origin, link: taskLink(origin, item.task.engagementId, item.task.id) }) })));
  } catch (error) {
    return failed("A team message")(error);
  }
}

/** Emails each colleague tagged in a message (R86). Returns how many were emailed. */
export async function sendMentionEmails(db: Db, input: { taskId: number; authorUserId: number; body: string; userIds: number[] }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const author = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.authorUserId)).limit(1))[0];
    const people = await teamPeople(db, item.task.engagementId, input.userIds);
    const origin = getTrustedApplicationOrigin();
    return await sendAll(people.map(person => ({ to: person.email, businessCheckId: null, ...mentionEmail({ name: person.name, author: author?.name ?? "", businessName: item.businessName, title: item.task.title, body: input.body, origin, link: taskLink(origin, item.task.engagementId, item.task.id) }) })));
  } catch (error) {
    return failed("A mention")(error);
  }
}

/** Emails the engagement's lead (its Engagement Manager or Lead Consultant, else the office) that an item is ready for review. */
export async function sendReadyForReviewEmails(db: Db, input: { taskId: number; authorUserId: number }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const author = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.authorUserId)).limit(1))[0];
    const team = await teamOf(db, item.task.engagementId, Date.now());
    const leads = team.filter(person => (person.role === "manager" || person.role === "lead") && person.userId !== input.authorUserId);
    const to = leads.length ? leads.map(person => ({ email: person.email, name: person.name })) : [{ email: BUSINESS_SUPPORT_MAILBOX, name: "" }];
    const origin = getTrustedApplicationOrigin();
    return await sendAll(to.map(person => ({ to: person.email, businessCheckId: null, ...readyForReviewEmail({ name: person.name, author: author?.name ?? "", businessName: item.businessName, title: item.task.title, origin, link: taskLink(origin, item.task.engagementId, item.task.id) }) })));
  } catch (error) {
    return failed("Ready for review")(error);
  }
}

/** A new file on an item (R89), to its owners and the engagement's lead, with a link straight to the item. */
export function newFileEmail(input: { name: string; uploader: string; fromClient: boolean; businessName: string; title: string; fileName: string; link: string }) {
  const who = input.fromClient ? input.businessName : firstNameOf(input.uploader) || "A colleague";
  return {
    subject: `New file on ${input.title}: ${input.fileName}`,
    body: [hello(input.name), "", `${who} added "${input.fileName}" to "${input.title}"${input.fromClient ? "" : ` for ${input.businessName}`}. More may follow in the next few minutes.`, "", `Open the item: ${input.link}`, "", BRAND.organisationName].join("\n"),
  };
}

/** The window in which uploads on one item share one email (R89). */
export const FILE_EMAIL_WINDOW_MS = 15 * 60_000;

/**
 * Every new file on an item (R89, ET 13 November 2026): its owners and the engagement's Engagement Manager and Lead
 * Consultant hear, never whoever uploaded it; a burst of uploads on one item sends one email per quarter hour. Best
 * effort, as every email here. Returns how many were emailed.
 */
export async function sendNewFileEmails(db: Database, input: { taskId: number; uploaderUserId: number; fileName: string; fromClient: boolean; now?: number }) {
  try {
    const item = await itemOf(db, input.taskId);
    if (!item) return 0;
    const { task, businessName } = item;
    const window = Math.floor((input.now ?? Date.now()) / FILE_EMAIL_WINDOW_MS);
    const claimed = await db.insert(engagementReminders).values({ key: `upload:${task.id}:${window}`, kind: "new_file", engagementId: task.engagementId }).onConflictDoNothing().returning({ id: engagementReminders.id });
    if (!claimed.length) return 0;
    const team = await teamOf(db, task.engagementId, Date.now());
    const lead = task.side === "ipf" && task.assigneeUserId !== null ? team.find(person => person.userId === task.assigneeUserId) ?? null : await teamPersonFor(db, task);
    const people = [...(lead && lead.userId !== null ? [lead] : []), ...(await sharedOwnersOf(db, task)), ...team.filter(person => person.role === "manager" || person.role === "lead")]
      .filter((person, index, all) => person.userId !== input.uploaderUserId && all.findIndex(other => other.email === person.email) === index);
    const uploader = (await db.select({ name: users.name }).from(users).where(eq(users.id, input.uploaderUserId)).limit(1))[0];
    const link = taskLink(getTrustedApplicationOrigin(), task.engagementId, task.id);
    return await sendAll(people.map(person => ({ to: person.email, businessCheckId: null, ...newFileEmail({ name: person.name, uploader: uploader?.name ?? "", fromClient: input.fromClient, businessName, title: task.title, fileName: input.fileName, link }) })));
  } catch (error) {
    return failed("A new file")(error);
  }
}

/** The names of the people who asked for items, for the Work Plan and the room. */
export async function namesOf(db: Db, ids: readonly (number | null)[]) {
  const wanted = Array.from(new Set(ids.filter((id): id is number => id !== null)));
  if (!wanted.length) return new Map<number, string>();
  return new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, wanted))).map(row => [row.id, row.name ?? ""]));
}
