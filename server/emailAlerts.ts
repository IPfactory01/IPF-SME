/**
 * Emails that did not arrive (batch G3, R42; App flow 7): every email to a client or prospect that failed when sent,
 * bounced or was suppressed in the last 30 days, shown at the top of Pipeline until someone marks it dealt with. Read
 * from the delivery log (server/emailDeliveryLog.ts, kept current by the Resend webhook). "Dealt with" is an audit row
 * naming the email, who and when, so nothing is deleted and no table changes.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { adminAccessAuditEvents, businessChecks, businessSupportEmailDeliveries } from "../drizzle/schema";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { BUSINESS_SUPPORT_MAILBOX } from "./email";

/** The delivery states that mean the email did not reach its reader. A delay is not one: Resend keeps trying. */
export const FAILED_EMAIL_STATES = ["failed", "bounced", "suppressed"] as const;
/** How far back the list looks, and how many it shows at once. */
export const FAILED_EMAIL_WINDOW_DAYS = 30;
export const FAILED_EMAILS_SHOWN = 20;

const DAY_MS = 86_400_000;

/** The deliveries already marked dealt with, among those since a day. */
async function dealtWith(db: Pick<Database, "select">, since: Date) {
  const rows = await db.select({ deliveryId: sql<string | null>`${adminAccessAuditEvents.details}::jsonb ->> 'deliveryId'` }).from(adminAccessAuditEvents)
    .where(and(eq(adminAccessAuditEvents.action, "email_failure_dealt_with"), gte(adminAccessAuditEvents.createdAt, since)));
  return new Set(rows.map(row => Number(row.deliveryId)));
}

/** The emails that did not arrive and are not dealt with yet, newest first: how many, and the first twenty. */
export async function failedEmails(db: Pick<Database, "select">, now = Date.now()) {
  const since = new Date(now - FAILED_EMAIL_WINDOW_DAYS * DAY_MS);
  const rows = await db.select({
    id: businessSupportEmailDeliveries.id, recipientEmail: businessSupportEmailDeliveries.recipientEmail, purpose: businessSupportEmailDeliveries.purpose,
    latestState: businessSupportEmailDeliveries.latestState, attemptedAt: businessSupportEmailDeliveries.attemptedAt, lastEventAt: businessSupportEmailDeliveries.lastEventAt,
    businessCheckId: businessSupportEmailDeliveries.businessCheckId,
  }).from(businessSupportEmailDeliveries)
    .where(and(
      inArray(businessSupportEmailDeliveries.latestState, [...FAILED_EMAIL_STATES]), gte(businessSupportEmailDeliveries.attemptedAt, since),
      // The office's own notices are not a client's email.
      sql`lower(${businessSupportEmailDeliveries.recipientEmail}) <> ${BUSINESS_SUPPORT_MAILBOX.toLowerCase()}`,
    ))
    .orderBy(desc(businessSupportEmailDeliveries.attemptedAt), desc(businessSupportEmailDeliveries.id)).limit(500);
  const done = rows.length ? await dealtWith(db, since) : new Set<number>();
  const open = rows.filter(row => !done.has(row.id));
  const shown = open.slice(0, FAILED_EMAILS_SHOWN);
  const checkIds = Array.from(new Set(shown.flatMap(row => (row.businessCheckId !== null ? [row.businessCheckId] : []))));
  const checks = checkIds.length ? await db.select({ id: businessChecks.id, businessName: businessChecks.businessName, fullName: businessChecks.fullName }).from(businessChecks).where(inArray(businessChecks.id, checkIds)) : [];
  return {
    total: open.length,
    emails: shown.map(row => {
      const check = checks.find(item => item.id === row.businessCheckId);
      return {
        id: row.id, recipient: row.recipientEmail, subject: row.purpose, state: row.latestState as (typeof FAILED_EMAIL_STATES)[number],
        at: row.lastEventAt ?? row.attemptedAt, client: check ? check.businessName || check.fullName : null,
      };
    }),
  };
}

/** Marks emails that did not arrive as dealt with, by whom and when. One already dealt with, or not a failure, is left. */
export async function markEmailsDealtWith(db: Database, actorUserId: number, deliveryIds: readonly number[], now = Date.now()) {
  const since = new Date(now - FAILED_EMAIL_WINDOW_DAYS * DAY_MS);
  const wanted = Array.from(new Set(deliveryIds));
  const rows = await db.select({ id: businessSupportEmailDeliveries.id, recipientEmail: businessSupportEmailDeliveries.recipientEmail, latestState: businessSupportEmailDeliveries.latestState })
    .from(businessSupportEmailDeliveries).where(inArray(businessSupportEmailDeliveries.id, wanted));
  const done = await dealtWith(db, since);
  const marked = rows.filter(row => (FAILED_EMAIL_STATES as readonly string[]).includes(row.latestState) && !done.has(row.id));
  for (const row of marked) {
    await recordAudit(db, { action: "email_failure_dealt_with", actorUserId, targetEmail: row.recipientEmail, details: { deliveryId: row.id, state: row.latestState } });
  }
  return { success: true, marked: marked.length } as const;
}
