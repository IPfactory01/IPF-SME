/**
 * Engagement fees (ET, 6 November 2026). There are no proposals or agreements on the platform: a client agrees by paying,
 * or on the call, under the Terms and Conditions. Each engagement keeps a fee schedule, filled in from the service's
 * price on the website, and the team records each payment. Fees are in whole naira. (The file keeps its name so the 0019
 * tables it describes are easy to find.)
 */
import { PRODUCTS, firstHalf, isService, perMonthAmount, quarterAmount, stageAmount, type Product } from "./products";
import { TYPE_PRODUCT, type EngagementType } from "./engagementTypes";
import type { EngagementDeliverableKind } from "./engagement";

/** The statuses of the retired engagement_agreements table (0019), kept for the schema; nothing writes them now. */
export const AGREEMENT_STATUSES = ["draft", "sent", "accepted"] as const;

export type FeeLineDraft = { label: string; amount: number; dueOn: string | null };

/** Limits, shared by the form and the server. */
export const AGREEMENT_LIMITS = { label: 200, feeLines: 24, amount: 100_000_000 } as const;

/** A day `days` after a date ("2026-11-09"), as a date. */
export const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/**
 * The fee lines a service starts with, from its price on the website and how it is bought (R36, ET 10 November 2026):
 * bought online, paid before we start; agreed on a call, half to start and half on delivery (the Six-Week Fix's stages
 * are those two halves); a Monthly Service, its first quarter; Digital Marketing, each month before it begins (on
 * starting, then before day 31 and day 61). The first part is dated the start day; a second half has no date until
 * delivery (`dateBalancesOnDelivery`).
 */
export function feeLinesFor(product: Product, startsOn: string | null = null): FeeLineDraft[] {
  const price = product.price;
  switch (price.kind) {
    case "free": return [];
    case "fixed": {
      if (!isService(product)) return [{ label: `${product.name}, payable before work begins`, amount: price.amount, dueOn: startsOn }];
      const first = firstHalf(price.amount);
      return [
        { label: `${product.name}: half to start`, amount: first, dueOn: startsOn },
        { label: `${product.name}: half on delivery`, amount: price.amount - first, dueOn: null },
      ];
    }
    case "milestones": return price.stages.map((stage, index) => ({ label: `${product.name}: ${stage.name.toLowerCase()} (${stage.percent}%)`, amount: stageAmount(price, stage.percent), dueOn: index === 0 ? startsOn : null }));
    case "per_month": return [{ label: `${product.name}: ${price.minMonths} months of records`, amount: perMonthAmount(price, price.minMonths), dueOn: startsOn }];
    case "quarterly": return [{ label: `${product.name}: first quarter, payable before it starts`, amount: quarterAmount(price), dueOn: startsOn }];
    case "monthly": return Array.from({ length: price.months }, (_, index) => ({
      label: index === 0 ? "Month 1 service fee, payable on starting" : `Month ${index + 1} service fee, payable before day ${index * 30 + 1}`,
      amount: price.perMonth,
      dueOn: startsOn ? addDays(startsOn, index * 30) : null,
    }));
  }
}

/** Where an engagement's fees start: the price of the service bought, or of the product its type is (TYPE_PRODUCT). */
export function defaultFees(type: EngagementType, service: string | null, startsOn: string | null = null): FeeLineDraft[] {
  const product = PRODUCTS.find(item => item.id === (service ?? TYPE_PRODUCT[type]));
  return product ? feeLinesFor(product, startsOn) : [];
}

/** A month paid in arrears falls due this many days after it: day 30, 60 and 90 from the kickoff (R74, ET 10 November 2026). */
export const ARREARS_MONTH_DAYS = 30;

/** Whether an engagement can be paid in arrears: only one paid by the month, such as Digital Marketing (R74). */
export function arrearsOffered(type: EngagementType, service: string | null) {
  return PRODUCTS.find(item => item.id === (service ?? TYPE_PRODUCT[type]))?.price.kind === "monthly";
}

/**
 * A monthly engagement's fees from its kickoff, which officially starts it: in advance, each month's fee on the month's
 * first day (day 0, 30 and 60); in arrears, 30 days after the month (day 30, 60 and 90), with labels that say so (R74).
 */
export function monthlyFees(type: EngagementType, service: string | null, kickoffOn: string, inArrears: boolean): FeeLineDraft[] {
  const fees = defaultFees(type, service, kickoffOn);
  if (!inArrears) return fees;
  return fees.map((fee, index) => {
    const days = (index + 1) * ARREARS_MONTH_DAYS;
    return { ...fee, label: `Month ${index + 1} service fee, due ${days} days after kickoff`, dueOn: addDays(kickoffOn, days) };
  });
}

/**
 * When a planned item falls due in week `week` of an engagement (week 1 starts on the start day): day 3 of the week, or
 * the first `weekday` in it (0 Sunday to 6 Saturday), so the Digital Marketing footage falls due on a Thursday (R77).
 */
export function starterDueOn(startsOn: string, week: number, weekday?: number) {
  const first = addDays(startsOn, (week - 1) * 7);
  if (weekday === undefined) return addDays(first, 3);
  return addDays(first, (weekday - new Date(`${first}T12:00:00Z`).getUTCDay() + 7) % 7);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * A Session in week `week` at the standing slot (R79): the first `weekday` in that week, at `time` ("10:00") in Lagos.
 */
export const seriesStart = (startsOn: string, week: number, weekday: number, time: string) => new Date(`${starterDueOn(startsOn, week, weekday)}T${time}:00+01:00`);

/** "Tuesday at 10:00 am": the slot in words. */
export function slotInWords(weekday: number, time: string) {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${WEEKDAY_NAMES[weekday]} at ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** How many days after delivery a service's second half falls due (ET, 10 November 2026). */
export const BALANCE_DUE_DAYS = 7;

/** Today in Lagos, as a date ("2026-11-10"): fee dates are Lagos days. */
export const lagosDay = (now: Date | number = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date(now));

/** Work pauses this many days after an unpaid fee's date (D6, ET 10 November 2026). */
export const PAUSE_AFTER_DAYS = 7;

/**
 * Where an engagement stands on its fees today (a Lagos date): *late* from the day after an unpaid fee's date, and
 * *paused* from seven days after it (D6), named by its earliest late fee. Paying that fee, or giving it a new date,
 * lifts it; nothing is stored, so the hold always follows the fees as they are.
 */
export function feeHold<T extends { dueOn: string | null; paid: boolean }>(fees: readonly T[], today: string): { state: "late" | "paused"; fee: T; pausesOn: string } | null {
  const late = fees.filter(fee => !fee.paid && fee.dueOn !== null && fee.dueOn < today).sort((a, b) => a.dueOn!.localeCompare(b.dueOn!));
  const first = late[0];
  if (!first) return null;
  const pausesOn = addDays(first.dueOn!, PAUSE_AFTER_DAYS);
  return { state: pausesOn <= today ? "paused" : "late", fee: first, pausesOn };
}

/**
 * Whether sharing this Deliverable is the engagement's delivery, which dates its second half (R36): a Business Review's
 * Findings, a Six-Week Fix's Plan (its result), any work of a Done for You service. Digital marketing and Monthly
 * Services are paid by the month or the quarter, so nothing waits on a delivery.
 */
export function isDelivery(type: EngagementType, kind: EngagementDeliverableKind) {
  if (type === "business_review" || type === "assessment") return kind === "findings";
  if (type === "six_week_fix") return kind === "plan";
  return type === "done_for_you";
}

export const feeTotal = (lines: readonly { amount: number }[]) => lines.reduce((sum, line) => sum + line.amount, 0);
