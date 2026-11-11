/**
 * Whom a client reaches on WhatsApp (R44, R72): a team member's number only once they agreed to it being shown (K11),
 * and only to clients of their own engagements. Used by the room (each item's "Send on WhatsApp to …") and by the fee
 * pay page ("WhatsApp {first name}"); with nobody reachable the pay page offers the office (BRAND.officeWhatsapp).
 */
import { asc, eq } from "drizzle-orm";
import { engagementTeam, users } from "../drizzle/schema";
import type { EngagementTeamRole } from "../shared/engagement";
import type { Database } from "./accountAuth";

type Member = { userId: number; name: string | null; role: EngagementTeamRole; whatsapp: string | null; whatsappConsentAt: Date | null };

/** A staff member's WhatsApp number for clients: only once they agreed to it being shown. */
export const agreedWhatsapp = (member: { whatsapp: string | null; whatsappConsentAt: Date | null }) => (member.whatsapp && member.whatsappConsentAt ? member.whatsapp : null);

/** The main contact, in this order, among those who agreed: the Digital Marketer, the Engagement Manager, the lead… */
export const MAIN_CONTACT_ORDER: readonly EngagementTeamRole[] = ["digital_marketer", "manager", "lead", "partner", "content_producer", "analyst", "expert"];

/** Whom a client item goes to: the team member who asked for it, else the main contact, with an agreed number. */
export function recipientOf(team: readonly Member[], askedBy: number | null) {
  const reachable = team.filter(member => agreedWhatsapp(member));
  const asker = reachable.find(member => member.userId === askedBy);
  const main = [...reachable].sort((a, b) => MAIN_CONTACT_ORDER.indexOf(a.role) - MAIN_CONTACT_ORDER.indexOf(b.role))[0];
  const chosen = asker ?? main;
  return chosen ? { name: chosen.name ?? "", whatsapp: agreedWhatsapp(chosen)! } : null;
}

/**
 * Who on the team an item the client is asked for goes to (R78): the person who asked for it while they are on the
 * engagement, else for an item with a clock (footage) its Content Producer, else the main contact. The client's messages
 * and what they send reach this person, who may also answer them.
 */
export function followUpOwnerOf<T extends { userId: number; role: EngagementTeamRole }>(team: readonly T[], task: { requestedByUserId: number | null; turnaround: string | null }): T | null {
  const asker = task.requestedByUserId === null ? undefined : team.find(member => member.userId === task.requestedByUserId);
  if (asker) return asker;
  const producer = task.turnaround ? team.find(member => member.role === "content_producer") : undefined;
  if (producer) return producer;
  return [...team].sort((a, b) => MAIN_CONTACT_ORDER.indexOf(a.role) - MAIN_CONTACT_ORDER.indexOf(b.role))[0] ?? null;
}

/** The engagement's main contact on WhatsApp, or null when nobody on its team has agreed to show a number. */
export async function mainContactOf(db: Pick<Database, "select">, engagementId: number) {
  const team = await db.select({ userId: engagementTeam.userId, name: users.name, role: engagementTeam.role, whatsapp: users.whatsapp, whatsappConsentAt: users.whatsappConsentAt })
    .from(engagementTeam).innerJoin(users, eq(engagementTeam.userId, users.id)).where(eq(engagementTeam.engagementId, engagementId)).orderBy(asc(engagementTeam.id));
  return recipientOf(team, null);
}
