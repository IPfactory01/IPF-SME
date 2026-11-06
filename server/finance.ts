/**
 * Finance (Admin › Finance): money across every client, in one place. Payment requests from the Business Health Check
 * route (Full Report, Business Review) and the fee lines of every engagement's agreement, each with what is due, paid
 * and late. Read only here; payments are confirmed where they belong (the check's record, the engagement's agreement).
 * Permission: view_financials (Finance, Super Admin).
 */
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { businessChecks, businesses, engagementAgreements, engagementFeeLines, engagements, paymentRequests } from "../drizzle/schema";
import { engagementTitle } from "../shared/engagementTypes";
import { PAYMENT_ITEM_TITLES } from "../shared/payments";
import { authorityAllows, type Authority } from "../shared/platformPermissions";
import type { Database } from "./accountAuth";

const lagosToday = (now: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(now));

export async function listFinance(db: Pick<Database, "select">, actor: { authority: Authority }, now = Date.now()) {
  if (!authorityAllows(actor.authority, "view_financials")) throw new TRPCError({ code: "FORBIDDEN", message: "Your role does not include finance." });
  const today = lagosToday(now);
  const requestRows = await db.select({
    id: paymentRequests.id, item: paymentRequests.item, amount: paymentRequests.amountNaira, status: paymentRequests.status, reference: paymentRequests.reference,
    requestedAt: paymentRequests.requestedAt, confirmedAt: paymentRequests.confirmedAt, fullName: businessChecks.fullName, businessName: businessChecks.businessName,
  }).from(paymentRequests).innerJoin(businessChecks, eq(paymentRequests.businessCheckId, businessChecks.id)).orderBy(desc(paymentRequests.id));
  const feeRows = await db.select({
    id: engagementFeeLines.id, engagementId: engagementFeeLines.engagementId, label: engagementFeeLines.label, amount: engagementFeeLines.amount, dueOn: engagementFeeLines.dueOn, paidAt: engagementFeeLines.paidAt,
    type: engagements.type, service: engagements.service, businessName: businesses.name, contactName: engagements.contactName, checkBusinessName: businessChecks.businessName, agreementStatus: engagementAgreements.status,
  }).from(engagementFeeLines).innerJoin(engagements, eq(engagementFeeLines.engagementId, engagements.id))
    .leftJoin(businesses, eq(engagements.businessId, businesses.id)).leftJoin(businessChecks, eq(engagements.businessCheckId, businessChecks.id))
    .leftJoin(engagementAgreements, eq(engagementAgreements.engagementId, engagements.id))
    .orderBy(asc(engagementFeeLines.dueOn), asc(engagementFeeLines.id));
  const requests = requestRows.map(row => ({ ...row, title: PAYMENT_ITEM_TITLES[row.item], client: row.businessName || row.fullName, paid: row.status === "confirmed" }));
  const fees = feeRows.map(row => ({
    id: row.id, engagementId: row.engagementId, label: row.label, amount: row.amount, dueOn: row.dueOn, paid: row.paidAt !== null, paidAt: row.paidAt,
    client: row.businessName ?? row.checkBusinessName ?? row.contactName ?? "", engagement: engagementTitle(row.type, row.service),
    // A fee counts as owed once its agreement is accepted; before that it is only proposed.
    agreed: row.agreementStatus === "accepted", late: row.paidAt === null && row.dueOn !== null && row.dueOn < today && row.agreementStatus === "accepted",
  }));
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return {
    requests,
    fees,
    totals: {
      paid: sum(requests.filter(row => row.paid).map(row => row.amount)) + sum(fees.filter(row => row.paid).map(row => row.amount)),
      owed: sum(requests.filter(row => !row.paid).map(row => row.amount)) + sum(fees.filter(row => !row.paid && row.agreed).map(row => row.amount)),
      late: sum(fees.filter(row => row.late).map(row => row.amount)),
      proposed: sum(fees.filter(row => !row.paid && !row.agreed).map(row => row.amount)),
    },
  };
}
