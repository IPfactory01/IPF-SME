/**
 * "What we will do" (R47): the work of an engagement in one sentence, and what the owner receives, from the service
 * bought or the type of engagement. Read-only, nothing to sign; shown on the room's Overview and in the owner's welcome
 * email. (Named so that it is not confused with Your Plan, the method's plan handed over at the end.)
 */
import { CURRENT_STATE, formatNaira } from "./businessSupport";
import { DIGITAL_MARKETING } from "./engagementTypes";
import { PRODUCTS } from "./products";

export const WORK_TITLE = "What we will do";

export function workOf(input: { type: string; service: string | null }): { what: string; youGet: string[] } {
  const product = PRODUCTS.find(item => item.id === (input.service ?? (input.type === "business_review" ? "business_review" : "")));
  if (product) return { what: product.short, youGet: [...product.youGet] };
  if (input.type === "business_review") return { what: CURRENT_STATE.what, youGet: [] };
  if (input.type === "digital_marketing") {
    return {
      what: "Three months of content for your business, each piece approved by you before anything is published.",
      youGet: [...DIGITAL_MARKETING.monthly.map(item => `${item.count} ${item.label.toLowerCase()} a month`), "A Weekly Check-in in month 1, then every two weeks", "A review at the end of each month"],
    };
  }
  return { what: "", youGet: [] };
}

/** A day for an email, in Lagos, with its year: "Mon 2 Nov 2026". */
export const dayLabel = (day: string) => new Date(`${day}T12:00:00+01:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }).replace(",", "");

/** The welcome email's account of the work: the plain-text lines the email layout turns into a heading and lists. */
export function workLines(input: { type: string; service: string | null; startsOn: string | null; fees: readonly { label: string; amount: number; dueOn: string | null }[] }) {
  const work = workOf(input);
  if (!work.what) return [];
  return [
    WORK_TITLE.toUpperCase(),
    work.what,
    ...work.youGet.map(item => `• ${item}`),
    ...(input.startsOn ? ["", `Starts: ${dayLabel(input.startsOn)}`] : []),
    ...(input.fees.length ? ["", "FEES", ...input.fees.map(fee => `• ${fee.label}: ${formatNaira(fee.amount)}${fee.dueOn ? `, due ${dayLabel(fee.dueOn)}` : ""}`)] : []),
  ];
}
