/**
 * The IP Factory business-support offer: the ten problem areas, the journey with its prices,
 * and the engagement rules. Source: Business Support Concept Note and Launch Blueprint v0.8.1
 * (6 October 2026), sections 6, 7, 11 and 16. v0.1 scope is frozen; later edits go to v0.2.
 *
 * Copy rules (front matter): second person, short sentences, naira in full, no consulting words,
 * and never "door", "sprint", "playbook" or "retainer" on the site.
 *
 * The problem areas are also the taxonomy the business check, the engagement record and the
 * portal build on, so their numbers are stable identifiers.
 */

export type ProblemArea = {
  number: number;
  name: string;
  /** The problem as a business owner says it (section 6). */
  ownerWords: string;
  /** The shorter sentence used on the site (section 16); absent where the site does not list the area. */
  siteSentence?: string;
  /** What IP Factory and the business owner do together. */
  together: string;
  /** The one number watched together. */
  measure: string;
};

export const PROBLEM_AREAS: readonly ProblemArea[] = [
  { number: 0, name: "Founder readiness", ownerWords: "I have the skill, or the job, but not yet the business.", siteSentence: "I have the skill, or the job, but not yet the business.", together: "Test the idea and the founder; build a personal development plan and a first-90-days plan.", measure: "Go or no-go decision; plan in use" },
  { number: 1, name: "Strategic intent", ownerWords: "I'm busy every day and I don't know where this is going.", siteSentence: "I'm busy every day and I don't know where this is going.", together: "Set what the business is for and what it must become in three years; three priorities.", measure: "Priorities set; weekly time spent on them" },
  { number: 2, name: "Market and industry", ownerWords: "I don't really know who buys, why, or who else sells to them.", siteSentence: "I don't really know who buys, why, or who else sells to them.", together: "Size the market, map competitors, pick the segment to win.", measure: "Target segment chosen; share of sales from it" },
  { number: 3, name: "Service and offering", ownerWords: "People like what I do but they don't buy enough of it.", siteSentence: "People like what I do but they don't buy enough of it.", together: "Rebuild the offer: what is sold, to whom, at what promise.", measure: "Offer live; conversion or average sale" },
  { number: 4, name: "Business model", ownerWords: "Money comes in and the business still doesn't make money.", siteSentence: "Money comes in and the business still doesn't make money.", together: "Fix how value is made, delivered and captured; margin by line.", measure: "Gross margin; lines stopped or repriced" },
  { number: 5, name: "Market entry and sales", ownerWords: "How do I get customers, consistently, or launch this new thing?", siteSentence: "How do I get customers, consistently?", together: "Build the route to market, the pipeline and the launch plan.", measure: "Pipeline live; new customers per month" },
  { number: 6, name: "Operations and people", ownerWords: "Nothing moves unless I'm there.", siteSentence: "Nothing moves unless I'm there.", together: "Write the core processes, design roles, hire or delegate, set policies.", measure: "Processes in use; business owner hours freed" },
  { number: 7, name: "Financials", ownerWords: "Cash is always tight and my prices are guesses.", siteSentence: "Cash is always tight and my prices are guesses.", together: "Pricing, unit economics, 13-week cash forecast, projections.", measure: "Cash cover in weeks; margin per unit" },
  { number: 8, name: "Risk and compliance", ownerWords: "One tax visit, one key resignation or one bad month could end this.", siteSentence: "One tax visit or one resignation could end this.", together: "Map what could kill the business; fence it with controls and cover.", measure: "Register in place; top risks mitigated" },
  { number: 9, name: "Exit and value", ownerWords: "What is this business worth, and how do I get out one day?", siteSentence: "What is this business worth, and how do I get out one day?", together: "Make the business sellable: records, dependence on the business owner, valuation logic.", measure: "Valuation drivers improving" },
  { number: 10, name: "Owner transition", ownerWords: "Who am I after this business, and how do I lead what I built?", together: "Career and leadership plan for the business owner; succession where needed.", measure: "Transition plan in use" },
];

/**
 * The offer in three parts, in place of JUMP's "Learn, Apply & Decide", and the home page headline.
 * It starts with finding the problem because many owners can feel that something is wrong without
 * being able to name it, and ends on what the owner gets: results they can see.
 */
export const PROMISE = ["Find it.", "Fix it.", "See the results."] as const;

/**
 * Prices in naira, as ET set them on 21 October 2026 (Operational Business Plan, page 11): the Business Review at
 * ₦600,000 and the Six-Week Fix at ₦1,500,000, each at the top of its range. The whole menu, with every other price,
 * is shared/products.ts; these are the three the existing payment and report code reads. The Full Report and Business
 * Review figures are the DEFAULTS: what is charged and shown comes from the server (server/businessSupportPrices.ts,
 * which the FULL_REPORT_PRICE_NGN and CURRENT_STATE_PRICE_NGN settings override).
 */
export const PRICES = {
  fullReport: 100_000,
  currentState: 600_000,
  fix: 1_500_000,
} as const;

/** The paid full report offered on the business check result. Independent of the discovery call. */
export const FULL_REPORT = {
  name: "Your Full Report",
  pitch: "The Business Health Check summary tells you where you stand. The Full Report tells you what to do about it.",
  includes: [
    "Every area of your outline in depth: what your answers show and what it means for your business",
    "The root cause behind each red and amber, and how they connect",
    "What to fix first, in order, with the Measure of Success for each",
    "The services that fit your business, and what each step would involve",
  ],
  delivery: "Built from your answers. After payment you complete the Report Intake, and the Full Report is emailed to you the moment you finish.",
  /** The Report Intake after payment (shared/fullReport/intake.ts): about this long. */
  formMinutes: 12,
} as const;

/**
 * The Business Review (the code's `current_state`, its stored identifier): what happens once it is paid for, for the
 * journey copy and the payment confirmation email.
 */
export const CURRENT_STATE = {
  /** The name everywhere: site, emails, admin, report. */
  name: "Business Review",
  what: "Two weeks and two Sessions that test your whole business, to find the one problem to fix first and what to do about it.",
  start: "We take three working days to get set up; the review starts at your first Session.",
} as const;

/** One step of "How it works" on the home page (Operational Business Plan, page 18). */
export type JourneyStep = {
  id: "check" | "first-step" | "pay" | "records" | "deliver" | "next";
  name: string;
  body: string;
};

export const REFERRAL_RULE = "Refer another business owner and take 10% off your next invoice for each referral who pays, up to 30%. It never applies to a first payment.";

export function formatNaira(amount: number) {
  return `₦${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** The two prices the server can configure, as the site displays them. */
export type ServicePrices = { fullReport: number; currentState: number };

/**
 * How every sale runs, from the free check to finished work (plan page 18). `prices` are the server's for the two items
 * it can configure; every other price is on the menu (shared/products.ts).
 */
export const buildJourney = (prices: ServicePrices = PRICES): readonly JourneyStep[] => [
  { id: "check", name: "Free Business Health Check", body: "Ten minutes on your phone. A first read on where your business is stuck, in your own words." },
  { id: "first-step", name: "Your first step", body: `The check names the product that fits first, and the one after it. Want the detail behind it? The Full Report, ${formatNaira(prices.fullReport)}, by email.` },
  { id: "pay", name: "Pay by link", body: `The price and the delivery time are on the page. You pay by transfer or card before we start. For a Business Review (${formatNaira(prices.currentState)}) or a Six-Week Fix, we talk first on a free 20-minute Discovery Call.` },
  { id: "records", name: "Send your records", body: "Your statements and answers, through a secure form. We check they are complete and confirm your delivery date within one working day." },
  { id: "deliver", name: "We deliver", body: "Finished work, checked by a consultant who did not prepare it, with a 30-minute handover call. If we miss the date we gave you, ask for a full refund." },
  { id: "next", name: "What comes next", body: "Thirty days on, we check in. If it helps, we suggest the next step, or a Monthly Service that keeps it going." },
];

export const JOURNEY = buildJourney();
