/**
 * The fee schedule of an engagement (ET, 6 November 2026: there are no proposals or agreements on the platform; a
 * client agrees by paying, or on the call, under the Terms and Conditions). Each engagement has its fee lines, filled in
 * from the service's price or the type's monthly fee when it is opened, and the team records each payment. Finance
 * counts a fee as owed once it is set, and late once its due date passes unpaid.
 *
 * Authorisation: the team by the engagement's scope, plus manage_engagements to change fees and record payments; reading
 * them needs the right to see fees (canSeeFees: those who work on or approve engagements, and Finance). Clients do not
 * see this screen. The engagement_agreements table from 0019 is kept, unused, so nothing recorded is lost.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { businessMemberships, engagementFeeLines, users } from "../drizzle/schema";
import { BRAND } from "../shared/brand";
import { formatNaira } from "../shared/businessSupport";
import { engagementTitle } from "../shared/engagementTypes";
import { dayLabel } from "../shared/engagementWork";
import { deliverEmail } from "./email";
import { getTrustedApplicationOrigin } from "./security";
import { AGREEMENT_LIMITS, defaultFees, feeTotal, type FeeLineDraft } from "../shared/agreement";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { canSeeFees, requireStaffEngagement, type StaffActor } from "./engagements";
import { feeReference, openRoomIfFirstPayment, sendFeeLink } from "./feePayments";
import { paystackMode } from "./paystack";
import { authorityAllows } from "../shared/platformPermissions";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Not found." });
const requireManage = (actor: StaffActor) => {
  if (!authorityAllows(actor.authority, "manage_engagements")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include working on engagements." });
};

async function feeLinesOf(db: Pick<Database, "select">, engagementId: number) {
  return db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId)).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
}

/** The team's view: the fee schedule, or, before the first save, what the service or type suggests. */
export async function staffFees(db: Database, actor: StaffActor, engagementId: number) {
  const engagement = await requireStaffEngagement(db, actor, engagementId);
  if (!canSeeFees(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Fees are for the team leading the engagement and Finance." });
  const feeLines = await feeLinesOf(db, engagementId);
  return {
    feeLines: feeLines.map(line => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paidAt: line.paidAt, paidOnline: line.paidReference !== null, reference: feeReference(line.id) })),
    total: feeTotal(feeLines),
    suggested: feeLines.length ? null : defaultFees(engagement.type, engagement.service, engagement.startedOn ?? null),
    /** Waiting for its first payment: the client sees only the fee to pay until one is paid. */
    opensOnPayment: engagement.opensOnPayment,
    online: paystackMode() !== "off",
    can: { edit: authorityAllows(actor.authority, "manage_engagements"), sendLink: canSendLinks(actor) },
  };
}

/** The fee lines a new engagement starts with (insertDirect), in the same transaction as the engagement. */
export function initialFeeRows(engagementId: number, lines: readonly FeeLineDraft[]) {
  return lines.map((line, index) => ({ engagementId, label: line.label, amount: line.amount, dueOn: line.dueOn, sortOrder: index }));
}

/** Replace the schedule. A line already paid keeps its payment when its label and amount are unchanged. */
export async function saveFees(db: Database, actor: StaffActor, input: { engagementId: number; feeLines: FeeLineDraft[] }) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (input.feeLines.length > AGREEMENT_LIMITS.feeLines) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many fee lines." });
  for (const line of input.feeLines) {
    if (!line.label.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Name every fee." });
    if (!Number.isInteger(line.amount) || line.amount <= 0 || line.amount > AGREEMENT_LIMITS.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Every fee needs an amount in naira." });
  }
  const existing = await feeLinesOf(db, input.engagementId);
  const same = (a: readonly FeeLineDraft[], b: readonly FeeLineDraft[]) => a.length === b.length && a.every((line, index) => line.label.trim() === b[index]!.label.trim() && line.amount === b[index]!.amount && (line.dueOn || null) === (b[index]!.dueOn || null));
  const changed = !same(existing, input.feeLines);
  await db.transaction(async tx => {
    await tx.delete(engagementFeeLines).where(eq(engagementFeeLines.engagementId, input.engagementId));
    if (input.feeLines.length) {
      await tx.insert(engagementFeeLines).values(input.feeLines.map((line, index) => ({
        engagementId: input.engagementId, label: line.label.trim().slice(0, AGREEMENT_LIMITS.label), amount: line.amount, dueOn: line.dueOn || null, sortOrder: index,
        paidAt: existing.find(old => old.label === line.label.trim() && old.amount === line.amount)?.paidAt ?? null,
      })));
    }
    await recordAudit(tx, { action: "engagement_fees_saved", actorUserId: actor.id, details: { engagementId: input.engagementId, total: feeTotal(input.feeLines), lines: input.feeLines.length } });
  });
  // The owner is told when the fees change once they have the room (R47): the schedule as it now stands.
  const notified = changed ? await tellOwnerFeesChanged(db, engagement, input.feeLines) : false;
  return { success: true, notified } as const;
}

/** "Your fees have changed": to the business's owner, only when they have an account (the room). */
export function feesChangedEmail(input: { name: string; title: string; feeLines: readonly FeeLineDraft[]; url: string }) {
  const first = input.name.trim().split(/\s+/)[0] || "there";
  return {
    subject: `Your fees have changed: ${input.title}`,
    body: [
      `Hello ${first},`,
      "",
      `The fees for your ${input.title} have changed. This is the schedule now:`,
      "",
      ...input.feeLines.map(line => `• ${line.label.trim()}: ${formatNaira(line.amount)}${line.dueOn ? `, due ${dayLabel(line.dueOn)}` : ""}`),
      "",
      `Total: ${formatNaira(feeTotal(input.feeLines))}`,
      "",
      `See them in your room: ${input.url}`,
      "",
      "If this is not what you agreed with us, reply to this email.",
      "",
      BRAND.organisationName,
    ].join("\n"),
  };
}

async function tellOwnerFeesChanged(db: Database, engagement: { id: number; businessId: number | null; type: Parameters<typeof engagementTitle>[0]; service: string | null }, feeLines: readonly FeeLineDraft[]) {
  if (engagement.businessId === null) return false;
  const owner = (await db.select({ email: users.email, name: users.name }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
  if (!owner?.email) return false;
  const message = feesChangedEmail({ name: owner.name ?? "", title: engagementTitle(engagement.type, engagement.service), feeLines, url: `${getTrustedApplicationOrigin()}/dashboard#payments` });
  // The fees are saved whatever happens to the email; a failed send is logged with the delivery.
  try {
    const delivery = await deliverEmail({ to: owner.email, subject: message.subject, body: message.body, sender: "business_support" });
    return delivery.status !== "Failed";
  } catch (error) {
    console.error("[Fees] The owner could not be told:", error instanceof Error ? error.message : "unknown error");
    return false;
  }
}

/** Record a fee as paid, or take it back. */
export async function setFeePaid(db: Database, actor: StaffActor, input: { feeLineId: number; paid: boolean }) {
  requireManage(actor);
  const [line] = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, input.feeLineId)).limit(1);
  if (!line) throw notFound();
  await requireStaffEngagement(db, actor, line.engagementId);
  // Recorded by hand: a payment Paystack did not take (or confirm). Its online reference, if any, is cleared on undo.
  await db.update(engagementFeeLines).set({ paidAt: input.paid ? new Date() : null, ...(input.paid ? {} : { paidReference: null }) }).where(eq(engagementFeeLines.id, line.id));
  await recordAudit(db, { action: "engagement_fee_paid", actorUserId: actor.id, details: { engagementId: line.engagementId, feeLineId: line.id, paid: input.paid, amount: line.amount } });
  // The first payment opens a room that waited for it, whether it came online or by hand.
  const opened = input.paid ? await openRoomIfFirstPayment(db, line.engagementId) : false;
  return { success: true, opened } as const;
}

/** Sending a pay link is commercial: the team on the engagement, or Finance. */
const canSendLinks = (actor: StaffActor) => authorityAllows(actor.authority, "manage_engagements") || authorityAllows(actor.authority, "manage_payments");

/** "Send the payment link": emails the client the fee's pay page, and returns the link once in case email fails. */
export async function staffSendFeeLink(db: Database, actor: StaffActor, input: { feeLineId: number }) {
  if (!canSendLinks(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include sending payment links." });
  const [line] = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, input.feeLineId)).limit(1);
  if (!line) throw notFound();
  await requireStaffEngagement(db, actor, line.engagementId);
  return sendFeeLink(db, { feeLineId: line.id, actorUserId: actor.id });
}

/** "Open the room now": the lead lets a client in before the first payment (a payment arranged another way). */
export async function openRoomNow(db: Database, actor: StaffActor, input: { engagementId: number }) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  const opened = await openRoomIfFirstPayment(db, input.engagementId);
  if (opened) await recordAudit(db, { action: "engagement_room_opened", actorUserId: actor.id, details: { engagementId: input.engagementId, before: "first payment" } });
  return { success: true, opened } as const;
}
