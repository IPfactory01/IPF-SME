/**
 * Security alerts to the Super Admins: a new administrator, a role granted, a sign-in from a new device, a locked
 * account, wrong two-step codes, access removed. Every alert is written to the audit log first, so it is on record even
 * when email is not working; the email itself is best effort and never stops the action that caused it.
 */
import { inArray } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { BRAND } from "../shared/brand";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { deliverEmail } from "./email";
import { listSuperAdminIds } from "./platformAccess";

export type SecurityAlert = {
  subject: string;
  lines: string[];
  /** A short name for the event, kept in the audit log ("staff_new_device", "platform_role_granted", ...). */
  event: string;
  targetEmail?: string | null;
  actorUserId?: number | null;
};

export function buildAlertEmail(alert: SecurityAlert) {
  return {
    subject: `[${BRAND.productName} security] ${alert.subject}`,
    body: [
      ...alert.lines,
      "",
      `This is an automatic alert from ${BRAND.productEndorsement}. It is sent to every Super Admin. The full record is in the audit log.`,
    ].join("\n"),
  };
}

export async function alertSuperAdmins(db: Pick<Database, "select" | "insert">, alert: SecurityAlert): Promise<{ recipients: number }> {
  try {
    const ids = Array.from(await listSuperAdminIds(db));
    const recipients = ids.length
      ? (await db.select({ email: users.email }).from(users).where(inArray(users.id, ids))).map(row => row.email).filter((email): email is string => Boolean(email))
      : [];
    await recordAudit(db, {
      action: "security_alert",
      actorUserId: alert.actorUserId ?? null,
      targetEmail: alert.targetEmail ?? null,
      details: { event: alert.event, subject: alert.subject, recipients: recipients.length },
    });
    const message = buildAlertEmail(alert);
    await Promise.all(recipients.map(to => deliverEmail({ to, subject: message.subject, body: message.body, sender: "business_support" }).catch(() => undefined)));
    return { recipients: recipients.length };
  } catch (error) {
    console.error("[Security] Could not send a security alert:", error instanceof Error ? error.message : error);
    return { recipients: 0 };
  }
}
