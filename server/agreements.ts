/**
 * The engagement agreement and its fees (0019). The team drafts it from the service bought, a lead sends it, the owner
 * accepts it in their room with their typed name, and the team records each payment. Authorisation: the team by the
 * engagement's scope plus manage_engagements (draft, record payments) or review rights (send, revise); the client by
 * membership: the owner and full-access staff read it, only the owner accepts it.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { businessMemberships, engagementAgreements, engagementFeeLines, engagements, users } from "../drizzle/schema";
import { AGREEMENT_LIMITS, AGREEMENT_STATUS_LABELS, defaultAgreement, feeTotal, type AgreementDraft } from "../shared/agreement";
import { engagementTitle } from "../shared/engagementTypes";
import { BRAND } from "../shared/brand";
import type { AccountSession, Database } from "./accountAuth";
import { recordAudit } from "./audit";
import { deliverEmail } from "./email";
import { canReviewEngagement, canSeeAgreement, clientViewerFor, requireStaffEngagement, type StaffActor } from "./engagements";
import { authorityAllows } from "../shared/platformPermissions";
import { getTrustedApplicationOrigin } from "./security";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Not found." });
const requireManage = (actor: StaffActor) => {
  if (!authorityAllows(actor.authority, "manage_engagements")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include working on engagements." });
};
const requireLead = async (db: Database, actor: StaffActor, engagementId: number) => {
  if (!(await canReviewEngagement(db, actor, engagementId))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the engagement's lead or the desk sends or revises the agreement." });
};

async function agreementRows(db: Pick<Database, "select">, engagementId: number) {
  const [agreement] = await db.select().from(engagementAgreements).where(eq(engagementAgreements.engagementId, engagementId)).limit(1);
  const feeLines = await db.select().from(engagementFeeLines).where(eq(engagementFeeLines.engagementId, engagementId)).orderBy(asc(engagementFeeLines.sortOrder), asc(engagementFeeLines.id));
  return { agreement: agreement ?? null, feeLines };
}

/** The team's view: the agreement and fees, or, before the first save, the draft the service suggests. */
export async function staffAgreement(db: Database, actor: StaffActor, engagementId: number) {
  const engagement = await requireStaffEngagement(db, actor, engagementId);
  if (!canSeeAgreement(actor)) throw new TRPCError({ code: "FORBIDDEN", message: "The agreement and fees are for the lead, the desk and Finance." });
  const { agreement, feeLines } = await agreementRows(db, engagementId);
  return {
    agreement: agreement ? { ...agreement, statusLabel: AGREEMENT_STATUS_LABELS[agreement.status] } : null,
    feeLines: feeLines.map(line => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paidAt: line.paidAt })),
    total: feeTotal(feeLines),
    suggested: agreement ? null : defaultAgreement(engagement.type, engagement.service),
    can: { edit: authorityAllows(actor.authority, "manage_engagements"), send: await canReviewEngagement(db, actor, engagementId) },
  };
}

function validate(input: AgreementDraft) {
  if (!input.scope.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Say what the engagement covers." });
  if (input.feeLines.length > AGREEMENT_LIMITS.feeLines) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many fee lines." });
  for (const line of input.feeLines) {
    if (!line.label.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Name every fee." });
    if (!Number.isInteger(line.amount) || line.amount <= 0 || line.amount > AGREEMENT_LIMITS.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Every fee needs an amount in naira." });
  }
}

/**
 * Save the draft. A sent agreement goes back to draft when it changes (send it again); an accepted one must be revised
 * first, so what the owner accepted is never changed under them. Paid fee lines keep their payment.
 */
export async function saveAgreement(db: Database, actor: StaffActor, input: AgreementDraft & { engagementId: number }) {
  requireManage(actor);
  await requireStaffEngagement(db, actor, input.engagementId);
  validate(input);
  const { agreement, feeLines } = await agreementRows(db, input.engagementId);
  if (agreement?.status === "accepted") throw new TRPCError({ code: "BAD_REQUEST", message: "The owner accepted this agreement. Revise it first; they accept the new version." });
  const values = { scope: input.scope.trim(), outOfScope: input.outOfScope.trim() || null, clientCommitments: input.clientCommitments.trim() || null, terms: input.terms.trim() || null };
  await db.transaction(async tx => {
    if (agreement) await tx.update(engagementAgreements).set({ ...values, status: "draft" }).where(eq(engagementAgreements.id, agreement.id));
    else await tx.insert(engagementAgreements).values({ engagementId: input.engagementId, ...values });
    // Fee lines are replaced; a payment already recorded against the same label and amount is kept.
    await tx.delete(engagementFeeLines).where(eq(engagementFeeLines.engagementId, input.engagementId));
    if (input.feeLines.length) {
      await tx.insert(engagementFeeLines).values(input.feeLines.map((line, index) => ({
        engagementId: input.engagementId, label: line.label.trim().slice(0, AGREEMENT_LIMITS.label), amount: line.amount, dueOn: line.dueOn || null, sortOrder: index,
        paidAt: feeLines.find(old => old.label === line.label.trim() && old.amount === line.amount)?.paidAt ?? null,
      })));
    }
    await recordAudit(tx, { action: "engagement_agreement_saved", actorUserId: actor.id, details: { engagementId: input.engagementId, total: feeTotal(input.feeLines) } });
  });
  return { success: true } as const;
}

/** Send it to the owner: it appears in their room to accept, and they are emailed. */
export async function sendAgreement(db: Database, actor: StaffActor, input: { engagementId: number }) {
  const engagement = await requireStaffEngagement(db, actor, input.engagementId);
  await requireLead(db, actor, input.engagementId);
  const { agreement, feeLines } = await agreementRows(db, input.engagementId);
  if (!agreement) throw new TRPCError({ code: "BAD_REQUEST", message: "Save the agreement first." });
  if (agreement.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: agreement.status === "accepted" ? "Already accepted." : "Already sent." });
  if (!feeLines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Add the fees before sending." });
  await db.update(engagementAgreements).set({ status: "sent", sentAt: new Date(), sentByUserId: actor.id, version: agreement.version + 1, acceptedAt: null, acceptedByUserId: null, acceptedName: null }).where(eq(engagementAgreements.id, agreement.id));
  await recordAudit(db, { action: "engagement_agreement_sent", actorUserId: actor.id, details: { engagementId: input.engagementId, version: agreement.version + 1 } });
  const owner = engagement.businessId === null ? undefined : (await db.select({ email: users.email, name: users.name }).from(businessMemberships).innerJoin(users, eq(businessMemberships.userId, users.id))
    .where(and(eq(businessMemberships.businessId, engagement.businessId), eq(businessMemberships.role, "owner"), eq(businessMemberships.status, "active"))).limit(1))[0];
  let notified = false;
  if (owner?.email) {
    try {
      const title = engagementTitle(engagement.type, engagement.service);
      await deliverEmail({
        to: owner.email, sender: "business_support",
        subject: `Your agreement for the ${title} is ready to read`,
        body: `Hello ${owner.name?.split(" ")[0] ?? ""},\n\nYour agreement for the ${title} is in your room: what we will do, what you do, the terms and the fees. Read it and accept it there when you are happy: ${getTrustedApplicationOrigin()}/dashboard#agreement\n\nAny questions, reply to this email.\n\n${BRAND.organisationName}`,
      });
      notified = true;
    } catch (error) {
      console.error("[Agreements] Sent, but the owner could not be emailed:", error instanceof Error ? error.message : error);
    }
  }
  return { success: true, notified } as const;
}

/** Reopen a sent or accepted agreement to change it; the owner accepts the new version once it is sent again. */
export async function reviseAgreement(db: Database, actor: StaffActor, input: { engagementId: number }) {
  await requireStaffEngagement(db, actor, input.engagementId);
  await requireLead(db, actor, input.engagementId);
  const { agreement } = await agreementRows(db, input.engagementId);
  if (!agreement || agreement.status === "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "There is nothing sent to revise." });
  await db.update(engagementAgreements).set({ status: "draft" }).where(eq(engagementAgreements.id, agreement.id));
  await recordAudit(db, { action: "engagement_agreement_revised", actorUserId: actor.id, details: { engagementId: input.engagementId, version: agreement.version, wasAccepted: agreement.status === "accepted", acceptedName: agreement.acceptedName } });
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

/**
 * The client's view, for the room: only once sent, and only for the owner and full-access staff (fees are commercial).
 * Contributors see nothing.
 */
export type ClientAgreement = {
  status: "sent" | "accepted" | "revising"; version: number; scope: string; outOfScope: string | null; clientCommitments: string | null; terms: string | null;
  sentAt: Date | null; acceptedAt: Date | null; acceptedName: string | null; feeLines: { id: number; label: string; amount: number; dueOn: string | null; paid: boolean }[]; total: number; canAccept: boolean;
};

export async function clientAgreement(db: Pick<Database, "select">, engagementId: number, viewer: { kind: "owner" } | { kind: "member"; access: string }): Promise<ClientAgreement | null> {
  if (viewer.kind !== "owner" && viewer.access !== "full") return null;
  const { agreement, feeLines } = await agreementRows(db, engagementId);
  if (!agreement || agreement.status === "draft" && !agreement.acceptedAt && agreement.version === 0) return null;
  // While the team revises an agreement already sent, the client keeps seeing that it is being updated, not the draft.
  if (agreement.status === "draft") return { status: "revising", version: agreement.version, scope: "", outOfScope: null, clientCommitments: null, terms: null, sentAt: agreement.sentAt, acceptedAt: null, acceptedName: null, feeLines: [], total: 0, canAccept: false };
  return {
    status: agreement.status, version: agreement.version, scope: agreement.scope, outOfScope: agreement.outOfScope, clientCommitments: agreement.clientCommitments, terms: agreement.terms,
    sentAt: agreement.sentAt, acceptedAt: agreement.acceptedAt, acceptedName: agreement.acceptedName,
    feeLines: feeLines.map(line => ({ id: line.id, label: line.label, amount: line.amount, dueOn: line.dueOn, paid: line.paidAt !== null })),
    total: feeTotal(feeLines),
    canAccept: viewer.kind === "owner" && agreement.status === "sent",
  };
}

/** The owner accepts the agreement in their room by typing their name. */
export async function acceptAgreement(db: Database, session: AccountSession, input: { engagementId: number; name: string }) {
  const business = session.activeBusiness;
  if (!business) throw notFound();
  const [engagement] = await db.select({ id: engagements.id, businessId: engagements.businessId, type: engagements.type, service: engagements.service }).from(engagements)
    .where(and(eq(engagements.id, input.engagementId), eq(engagements.businessId, business.businessId))).limit(1);
  if (!engagement) throw notFound();
  const viewer = await clientViewerFor(db, session, business.businessId);
  if (viewer.kind !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can accept the agreement." });
  const name = input.name.trim();
  if (name.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Type your full name to accept." });
  const updated = await db.update(engagementAgreements).set({ status: "accepted", acceptedAt: new Date(), acceptedByUserId: session.user.id, acceptedName: name.slice(0, 200) })
    .where(and(eq(engagementAgreements.engagementId, engagement.id), eq(engagementAgreements.status, "sent"))).returning({ id: engagementAgreements.id, version: engagementAgreements.version });
  if (!updated.length) throw new TRPCError({ code: "BAD_REQUEST", message: "There is no agreement waiting for you to accept." });
  await recordAudit(db, { action: "engagement_agreement_accepted", actorUserId: session.user.id, details: { engagementId: engagement.id, version: updated[0]!.version, name } });
  try {
    await deliverEmail({ to: BRAND.businessSupportMailbox, sender: "business_support", subject: `${business.businessName} accepted the ${engagementTitle(engagement.type, engagement.service)} agreement`, body: `${name} accepted version ${updated[0]!.version} of the agreement for ${business.businessName}. ${getTrustedApplicationOrigin()}/admin` });
  } catch (error) {
    console.error("[Agreements] Accepted, but the desk could not be emailed:", error instanceof Error ? error.message : error);
  }
  return { success: true } as const;
}
