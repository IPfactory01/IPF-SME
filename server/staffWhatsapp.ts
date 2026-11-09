/**
 * A staff member's WhatsApp number (R44, migration 0021). The person agrees, themselves, to their number being shown
 * to the clients of their engagements (K11); a manager with manage_users may set or correct the number, which then
 * waits for the person's agreement again. Shown to a client only once agreed (server/engagements.ts, agreedWhatsapp).
 * The audit log records that a number was set and whether it is agreed, never the number itself.
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { INTERNATIONAL_PHONE } from "../shared/phone";
import type { AccountSession, Database } from "./accountAuth";
import { recordAudit } from "./audit";

const clean = (value: string) => value.replace(/[\s()-]/g, "");

function numberOf(value: string | null): string | null {
  if (value === null || !value.trim()) return null;
  const number = clean(value);
  if (!INTERNATIONAL_PHONE.test(number)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the number with its country code, for example +234 803 123 4567." });
  return number;
}

const requireStaff = (session: AccountSession) => {
  if (session.platformRoles.length === 0) throw new TRPCError({ code: "FORBIDDEN", message: "A WhatsApp number on your profile is for the IP Factory team." });
};

/** The person's own number and whether they agreed to it being shown, for Account settings. */
export async function ownWhatsapp(db: Pick<Database, "select">, session: AccountSession) {
  if (session.platformRoles.length === 0) return { staff: false as const, whatsapp: null, agreedAt: null };
  const row = (await db.select({ whatsapp: users.whatsapp, agreedAt: users.whatsappConsentAt }).from(users).where(eq(users.id, session.user.id)).limit(1))[0];
  return { staff: true as const, whatsapp: row?.whatsapp ?? null, agreedAt: row?.agreedAt ?? null };
}

/** The person sets their number and says whether clients may see it. No number, no agreement. */
export async function setOwnWhatsapp(db: Database, session: AccountSession, input: { whatsapp: string | null; agree: boolean }) {
  requireStaff(session);
  const whatsapp = numberOf(input.whatsapp);
  const agreedAt = whatsapp && input.agree ? new Date() : null;
  await db.transaction(async tx => {
    await tx.update(users).set({ whatsapp, whatsappConsentAt: agreedAt }).where(eq(users.id, session.user.id));
    await recordAudit(tx, { action: "staff_whatsapp_set", actorUserId: session.user.id, targetEmail: session.user.email, details: { targetUserId: session.user.id, by: "self", number: whatsapp !== null, agreed: agreedAt !== null } });
  });
  return { success: true as const, whatsapp, agreedAt };
}

/** A manager sets or corrects someone's number. A changed number waits for that person's own agreement. */
export async function setStaffWhatsapp(db: Database, actor: { id: number }, input: { userId: number; whatsapp: string | null }) {
  const whatsapp = numberOf(input.whatsapp);
  const target = (await db.select({ id: users.id, email: users.email, whatsapp: users.whatsapp, agreedAt: users.whatsappConsentAt }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "That person does not exist." });
  const agreedAt = whatsapp !== null && whatsapp === target.whatsapp ? target.agreedAt : null;
  await db.transaction(async tx => {
    await tx.update(users).set({ whatsapp, whatsappConsentAt: agreedAt }).where(eq(users.id, target.id));
    await recordAudit(tx, { action: "staff_whatsapp_set", actorUserId: actor.id, targetEmail: target.email, details: { targetUserId: target.id, by: "manager", number: whatsapp !== null, agreed: agreedAt !== null } });
  });
  return { success: true as const, whatsapp, agreedAt };
}
