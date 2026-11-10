/**
 * The fee schedule of an engagement (ET, 6 November 2026: there are no proposals or agreements on the platform; a
 * client agrees by paying, or on the call, under the Terms and Conditions). Each engagement has its fee lines, filled in
 * from the service's price or the type's monthly fee when it is opened. Payments are in the ledger (server/ledger.ts):
 * Paystack records its own, and money that came another way is recorded by Finance or the Super Admin (server/finance.ts,
 * ET 10 November 2026). Finance counts a fee as owed once it is set, and late once its due date passes with something left.
 *
 * Authorisation: the team by the engagement's scope, plus manage_engagements to change fees; reading them needs the right
 * to see fees (canSeeFees: those who work on or approve engagements, and Finance). Saving keeps each fee's id, so a pay
 * link already emailed keeps working, and a fee that has been billed cannot be removed. Clients do not see this screen.
 * The engagement_agreements table from 0019 is kept, unused, so nothing recorded is lost.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { businessMemberships, engagementFeeLines, engagements, users } from "../drizzle/schema";
import { feeBalance, invoiceNumberLabel } from "../shared/ledger";
import { BRAND } from "../shared/brand";
import { formatNaira } from "../shared/businessSupport";
import { engagementTitle } from "../shared/engagementTypes";
import { dayLabel } from "../shared/engagementWork";
import { deliverEmail } from "./email";
import { getTrustedApplicationOrigin } from "./security";
import { AGREEMENT_LIMITS, arrearsOffered, defaultFees, feeTotal, monthlyFees, type FeeLineDraft } from "../shared/agreement";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { canSeeFees, requireStaffEngagement, type StaffActor } from "./engagements";
import { beginBusinessReview } from "./businessReview";
import { feeReference, openRoomIfFirstPayment, sendFeeLink } from "./feePayments";
import { anyCounted, namesOf, paymentView, writeOffView } from "./finance";
import { carryOver, paymentsOfFees, refreshFeePaid, refundsOfPayments } from "./ledger";
import { paystackMode } from "./paystack";
import { authorityAllows } from "../shared/platformPermissions";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Not found." });
const requireManage = (actor: StaffActor) => {
  if (!authorityAllows(actor.authority, "manage_engagements")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include working on engagements." });
};
/** Work before the first payment is a Partner's decision, or the Super Admin's (ET, 10 November 2026). */
const mayApproveUnpaidWork = (actor: StaffActor) => authorityAllows(actor.authority, "approve_work_before_payment");
export const UNPAID_WORK_REFUSALS = {
  openRoom: "Only a Partner or the Super Admin can open a client's room before the first payment.",
  firstFee: "Only a Partner or the Super Admin can move the first fee past the start date before it is paid.",
  arrears: "Only a Partner or the Super Admin can choose whether a client pays in arrears or in advance.",
} as const;

async function feeLinesOf(db: Pick<Database, "select">, engagementId: number) {
  return db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId)).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
}

/**
 * The team's view: the fee schedule, or, before the first save, what the service or type suggests; for each fee what is
 * paid and what is left, and its payments (the notes on them only for those who see Finance).
 */
export async function staffFees(db: Database, actor: StaffActor, engagementId: number) {
  const engagement = await requireStaffEngagement(db, actor, engagementId);
  if (!canSeeFees(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "Fees are for the team leading the engagement and Finance." });
  const feeLines = await feeLinesOf(db, engagementId);
  const ledger = await paymentsOfFees(db, feeLines.map(line => line.id));
  const refunds = await refundsOfPayments(db, ledger.map(entry => entry.id));
  const people = await namesOf(db, [...ledger.flatMap(entry => [entry.recordedByUserId, entry.cancelledByUserId]), ...refunds.flatMap(refund => [refund.recordedByUserId, refund.cancelledByUserId]), ...feeLines.map(line => line.writtenOffByUserId)]);
  const seesNotes = authorityAllows(actor.authority, "view_financials");
  return {
    feeLines: feeLines.map(line => {
      const own = ledger.filter(entry => entry.feeLineId === line.id);
      const { paid, left } = feeBalance(line, own);
      const shown = own.filter(entry => entry.status !== "started" && entry.status !== "failed").map(entry => paymentView(entry, people, refunds));
      return {
        id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paidAt: line.paidAt, reference: feeReference(line.id),
        paidOnline: own.some(entry => entry.method === "paystack" && (entry.status === "paid" || entry.status === "refunded")),
        paidAmount: paid, left,
        /** Billed: it has an invoice number or a payment, so it can be changed but not removed. */
        billed: line.invoiceNumber !== null || own.length > 0 || line.writtenOffAt !== null,
        invoice: line.invoiceNumber !== null ? invoiceNumberLabel(line.invoiceNumber) : null,
        payments: seesNotes ? shown : shown.map(payment => ({ ...payment, note: null, refunds: payment.refunds.map(refund => ({ ...refund, reason: "", reference: null })) })),
        writtenOff: writeOffView(line, people),
      };
    }),
    total: feeTotal(feeLines),
    suggested: feeLines.length ? null : engagement.paidInArrears && engagement.startedOn ? monthlyFees(engagement.type, engagement.service, engagement.startedOn, true) : defaultFees(engagement.type, engagement.service, engagement.startedOn ?? null),
    /** Paid in arrears or in advance, from the kickoff (R74): offered only to an engagement paid by the month. */
    timing: { offered: arrearsOffered(engagement.type, engagement.service), inArrears: engagement.paidInArrears, kickoffOn: engagement.startedOn ?? null },
    /** Waiting for its first payment: the client sees only the fee to pay until one is paid. */
    opensOnPayment: engagement.opensOnPayment,
    online: paystackMode() !== "off",
    can: { edit: authorityAllows(actor.authority, "manage_engagements"), sendLink: canSendLinks(actor), approveUnpaidWork: mayApproveUnpaidWork(actor), recordPayments: authorityAllows(actor.authority, "manage_payments"), writeOff: authorityAllows(actor.authority, "write_off_fees") },
  };
}

/** The fee lines a new engagement starts with (insertDirect), in the same transaction as the engagement. */
export function initialFeeRows(engagementId: number, lines: readonly FeeLineDraft[]) {
  return lines.map((line, index) => ({ engagementId, label: line.label, amount: line.amount, dueOn: line.dueOn, sortOrder: index }));
}

/** A fee line as the team saves it: `id` for a fee that is already on the engagement, none for a new one. */
export type SavedFeeLine = FeeLineDraft & { id?: number };

/**
 * Saves the schedule in place: each fee keeps its id (so a pay link already emailed keeps working), new ones are added,
 * and a removed one is deleted only if it was never billed. A fee's amount cannot go below what is paid on it; raising a
 * fee paid in full makes it part paid again. The owner is told when the schedule changes.
 */
export async function saveFees(db: Database, actor: StaffActor, input: { engagementId: number; feeLines: SavedFeeLine[] }) {
  requireManage(actor);
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (input.feeLines.length > AGREEMENT_LIMITS.feeLines) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many fee lines." });
  for (const line of input.feeLines) {
    if (!line.label.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Name every fee." });
    if (!Number.isInteger(line.amount) || line.amount <= 0 || line.amount > AGREEMENT_LIMITS.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Every fee needs an amount in naira." });
  }
  const ids = input.feeLines.flatMap(line => (line.id === undefined ? [] : [line.id]));
  if (new Set(ids).size !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A fee is on the list twice." });
  const outcome = await db.transaction(async tx => {
    // Every fee of the engagement, locked until the save ends, so a payment cannot land on a fee being changed.
    const existing = await tx.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, input.engagementId))
      .orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id)).for("update");
    const byId = new Map(existing.map(line => [line.id, line]));
    if (ids.some(id => !byId.has(id))) throw new TRPCError({ code: "BAD_REQUEST", message: "A fee on the list is not one of this engagement's. Refresh and try again." });
    for (const line of existing) await carryOver(tx, line);
    const ledger = await paymentsOfFees(tx, existing.map(line => line.id));
    // Before anything is paid, the first fee is due on the start date (terms follow what is bought, R36). Moving it
    // later, or taking its date away, is work before payment: a Partner's decision. A first fee already moved stays.
    const firstDue = (lines: readonly { dueOn: string | null }[]) => lines[0]?.dueOn || null;
    const unpaidYet = engagement.paymentRequestId === null && !existing.some(line => line.paidAt) && !anyCounted(ledger);
    const startsOn = engagement.startedOn ?? null;
    const newFirstDue = firstDue(input.feeLines);
    const defersFirstFee = unpaidYet && startsOn !== null && input.feeLines.length > 0 && (newFirstDue === null || newFirstDue > startsOn) && newFirstDue !== (existing.length ? firstDue(existing) : startsOn);
    if (defersFirstFee && !mayApproveUnpaidWork(actor)) throw new TRPCError({ code: "FORBIDDEN", message: UNPAID_WORK_REFUSALS.firstFee });
    // A billed fee stays: it is changed, or a Partner writes it off.
    const kept = new Set(ids);
    for (const line of existing.filter(item => !kept.has(item.id))) {
      if (line.invoiceNumber !== null || line.writtenOffAt !== null || ledger.some(entry => entry.feeLineId === line.id)) {
        throw new TRPCError({ code: "CONFLICT", message: `${line.label} has been billed, so it cannot be removed. Change it, or ask a Partner to write it off.` });
      }
    }
    for (const line of input.feeLines) {
      if (line.id === undefined) continue;
      const old = byId.get(line.id)!;
      const { paid } = feeBalance({ ...old, paidAt: null }, ledger.filter(entry => entry.feeLineId === old.id));
      if (line.amount < paid) throw new TRPCError({ code: "BAD_REQUEST", message: `${formatNaira(paid)} is already paid on ${old.label}, so it cannot be less.` });
      if (old.writtenOffAt !== null && (line.amount !== old.amount || (line.dueOn || null) !== old.dueOn)) throw new TRPCError({ code: "CONFLICT", message: `${old.label} is written off. Reverse the write-off before changing it.` });
    }
    const same = (a: readonly FeeLineDraft[], b: readonly FeeLineDraft[]) => a.length === b.length && a.every((line, index) => line.label.trim() === b[index]!.label.trim() && line.amount === b[index]!.amount && (line.dueOn || null) === (b[index]!.dueOn || null));
    const removed = existing.filter(item => !kept.has(item.id)).map(item => item.id);
    if (removed.length) await tx.delete(engagementFeeLines).where(inArray(engagementFeeLines.id, removed));
    for (let index = 0; index < input.feeLines.length; index += 1) {
      const line = input.feeLines[index]!;
      const values = { label: line.label.trim().slice(0, AGREEMENT_LIMITS.label), amount: line.amount, dueOn: line.dueOn || null, sortOrder: index };
      if (line.id === undefined) {
        await tx.insert(engagementFeeLines).values({ engagementId: input.engagementId, ...values });
        continue;
      }
      const old = byId.get(line.id)!;
      await tx.update(engagementFeeLines).set(values).where(eq(engagementFeeLines.id, line.id));
      // A higher or lower amount can open a fee paid in full again, or complete one paid in part.
      if (line.amount !== old.amount) await refreshFeePaid(tx, { ...old, ...values });
    }
    await recordAudit(tx, { action: "engagement_fees_saved", actorUserId: actor.id, details: { engagementId: input.engagementId, total: feeTotal(input.feeLines), lines: input.feeLines.length, ...(removed.length ? { removedFeeLineIds: removed } : {}), ...(defersFirstFee ? { firstFeeMovedTo: newFirstDue ?? "no date", startedOn: startsOn } : {}) } });
    return { changed: !same(existing, input.feeLines) };
  });
  // The owner is told when the fees change once they have the room (R47): the schedule as it now stands.
  const notified = outcome.changed ? await tellOwnerFeesChanged(db, engagement, input.feeLines) : false;
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

/**
 * Paid in arrears or in advance (R74, ET 10 November 2026), from the kickoff, which officially starts the engagement: a
 * Partner's decision, or the Super Admin's, for an engagement paid by the month. Every fee not yet paid takes its month's
 * date (30, 60 and 90 days after the kickoff in arrears; day 0, 30 and 60 in advance), and a standard label follows; a
 * fee paid in full or written off keeps its date, and a label the team wrote stays. In arrears the room opens at once.
 * Calling it again with a new kickoff moves the fees again. Nothing is emailed: the room shows the new dates.
 */
export async function setFeeTiming(db: Database, actor: StaffActor, input: { engagementId: number; inArrears: boolean; kickoffOn: string }) {
  requireManage(actor);
  if (!mayApproveUnpaidWork(actor)) throw new TRPCError({ code: "FORBIDDEN", message: UNPAID_WORK_REFUSALS.arrears });
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  if (!arrearsOffered(engagement.type, engagement.service)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only an engagement paid by the month, such as Digital Marketing, can be paid in arrears." });
  }
  const target = monthlyFees(engagement.type, engagement.service, input.kickoffOn, input.inArrears);
  const standard = new Set([...monthlyFees(engagement.type, engagement.service, input.kickoffOn, false), ...monthlyFees(engagement.type, engagement.service, input.kickoffOn, true)].map(fee => fee.label));
  return db.transaction(async tx => {
    const lines = await tx.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, input.engagementId))
      .orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id)).for("update");
    const ledger = await paymentsOfFees(tx, lines.map(line => line.id));
    let moved = 0;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      const month = target.at(index);
      // A fee past the schedule, or one with nothing left to pay, keeps its date.
      if (!month || feeBalance(line, ledger.filter(entry => entry.feeLineId === line.id)).left === 0) continue;
      const label = standard.has(line.label) ? month.label : line.label;
      if (line.dueOn === month.dueOn && line.label === label) continue;
      await tx.update(engagementFeeLines).set({ dueOn: month.dueOn, label }).where(eq(engagementFeeLines.id, line.id));
      moved += 1;
    }
    await tx.update(engagements).set({ paidInArrears: input.inArrears, startedOn: input.kickoffOn }).where(eq(engagements.id, input.engagementId));
    const opened = input.inArrears && (await openRoomIfFirstPayment(tx, input.engagementId));
    if (opened) await recordAudit(tx, { action: "engagement_room_opened", actorUserId: actor.id, details: { engagementId: input.engagementId, before: "first payment", via: "arrears" } });
    await recordAudit(tx, { action: "engagement_fee_timing_set", actorUserId: actor.id, details: { engagementId: input.engagementId, inArrears: input.inArrears, kickoffOn: input.kickoffOn, moved } });
    return { success: true, moved, opened } as const;
  });
}

/** "Open the room now": the lead lets a client in before the first payment (a payment arranged another way). */
export async function openRoomNow(db: Database, actor: StaffActor, input: { engagementId: number }) {
  requireManage(actor);
  if (!mayApproveUnpaidWork(actor)) throw new TRPCError({ code: "FORBIDDEN", message: UNPAID_WORK_REFUSALS.openRoom });
  await requireStaffEngagement(db, actor, input.engagementId);
  const opened = await openRoomIfFirstPayment(db, input.engagementId);
  if (opened) await recordAudit(db, { action: "engagement_room_opened", actorUserId: actor.id, details: { engagementId: input.engagementId, before: "first payment" } });
  // A Business Review on fees (F3): its plan loads and the owner is invited; the check moves to Won when it is paid.
  if (opened) await beginBusinessReview(db, input.engagementId, { opened, paid: false, actorUserId: actor.id });
  return { success: true, opened } as const;
}
