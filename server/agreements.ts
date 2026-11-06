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
import { asc, eq } from "drizzle-orm";
import { engagementFeeLines } from "../drizzle/schema";
import { AGREEMENT_LIMITS, defaultFees, feeTotal, type FeeLineDraft } from "../shared/agreement";
import type { Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { canSeeFees, requireStaffEngagement, type StaffActor } from "./engagements";
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
    feeLines: feeLines.map(line => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paidAt: line.paidAt })),
    total: feeTotal(feeLines),
    suggested: feeLines.length ? null : defaultFees(engagement.type, engagement.service),
    can: { edit: authorityAllows(actor.authority, "manage_engagements") },
  };
}

/** The fee lines a new engagement starts with (insertDirect), in the same transaction as the engagement. */
export function initialFeeRows(engagementId: number, lines: readonly FeeLineDraft[]) {
  return lines.map((line, index) => ({ engagementId, label: line.label, amount: line.amount, dueOn: line.dueOn, sortOrder: index }));
}

/** Replace the schedule. A line already paid keeps its payment when its label and amount are unchanged. */
export async function saveFees(db: Database, actor: StaffActor, input: { engagementId: number; feeLines: FeeLineDraft[] }) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  if (input.feeLines.length > AGREEMENT_LIMITS.feeLines) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many fee lines." });
  for (const line of input.feeLines) {
    if (!line.label.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Name every fee." });
    if (!Number.isInteger(line.amount) || line.amount <= 0 || line.amount > AGREEMENT_LIMITS.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Every fee needs an amount in naira." });
  }
  const existing = await feeLinesOf(db, input.engagementId);
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
  return { success: true } as const;
}

/** Record a fee as paid, or take it back. */
export async function setFeePaid(db: Database, actor: StaffActor, input: { feeLineId: number; paid: boolean }) {
  requireManage(actor);
  const [line] = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.id, input.feeLineId)).limit(1);
  if (!line) throw notFound();
  await requireStaffEngagement(db, actor, line.engagementId);
  await db.update(engagementFeeLines).set({ paidAt: input.paid ? new Date() : null }).where(eq(engagementFeeLines.id, line.id));
  await recordAudit(db, { action: "engagement_fee_paid", actorUserId: actor.id, details: { engagementId: line.engagementId, feeLineId: line.id, paid: input.paid, amount: line.amount } });
  return { success: true } as const;
}
