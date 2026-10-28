/**
 * The launch menu of The Shift: every product on sale, how it is bought, what it costs, when it is delivered and what
 * we need from the owner. Source: IPF The Shift Operational Business Plan (22 October 2026), pages 10, 11, 15, 17, 18
 * and 24, with the prices ET set on 21 October and the refund promise adopted on 22 October.
 *
 * This is the first piece of the universal engagement model (docs/product/01-prd.md §11): a product is data, not code.
 * The site's menu and product pages, the Business Health Check's routing, the order flow, the intake form and the
 * payment plan all read from here, so a new product is a new entry. Product ids are stable identifiers stored on
 * orders; names and copy can change.
 *
 * Copy rules as everywhere on the site: second person, short sentences, naira in full, plain business terms, never
 * "door", "sprint", "playbook" or "retainer".
 */

import { DELIVERY_REMEDY, formatNaira } from "./businessSupport";

/** The four ways to buy (ET, 21 October 2026). */
export const WAYS_TO_BUY = ["assessment", "done_for_you", "six_week_fix", "monthly_service"] as const;
export type WayToBuy = (typeof WAYS_TO_BUY)[number];

export const WAY_DETAILS: Record<WayToBuy, { name: string; summary: string; charge: string }> = {
  assessment: {
    name: "Assessment",
    summary: "Find out what needs fixing first: the free Business Health Check, the two-week Business Review, and short readiness assessments.",
    charge: "Free, or paid before we start.",
  },
  done_for_you: {
    name: "Done for You",
    summary: "We deliver a finished piece of work, such as accounts, a forecast or a plan, from your records and answers. AI-assisted, checked by a consultant, in days.",
    charge: "A fixed price, paid before we start.",
  },
  six_week_fix: {
    name: "Six-Week Fix",
    summary: "Six weeks on one problem with a weekly review. We prescribe and equip; your team does the work; we track one number.",
    charge: "Half at the start, a quarter at the mid-point and a quarter at the result. Or pay in full and save 5%.",
  },
  monthly_service: {
    name: "Monthly Service",
    summary: "Work delivered every month, or a monthly review with an adviser, paid by the quarter.",
    charge: "Paid a quarter at a time, before the quarter starts. The price holds for twelve months. Stop at the end of any quarter.",
  },
};

/** The needs the menu is grouped by on the site (the plan's twelve needs, narrowed to those the launch menu serves). */
export const NEEDS = ["finance", "pricing", "funding", "strategy", "people", "sales", "whole_business"] as const;
export type Need = (typeof NEEDS)[number];

export const NEED_DETAILS: Record<Need, { name: string; ownerWords: string }> = {
  finance: { name: "Finance and accounts", ownerWords: "My records are behind and I can't see my cash." },
  pricing: { name: "Pricing and profit", ownerWords: "Are my prices still making money?" },
  funding: { name: "Funding", ownerWords: "I need a loan and I don't know if I'm ready." },
  strategy: { name: "Strategy and direction", ownerWords: "I'm busy every day and I don't know where this is going." },
  people: { name: "People and team", ownerWords: "I need to hire, and nothing moves unless I'm there." },
  sales: { name: "Sales and marketing", ownerWords: "Sales are flat and I need more customers every month." },
  whole_business: { name: "The whole business", ownerWords: "Several things are wrong at once and I don't know where to start." },
};

/**
 * How a product is charged. Amounts are whole naira. `fixed` is one payment; `per_month` is a price for each month of
 * records with a minimum; `milestones` splits the price into stages (the Six-Week Fix: 50, 25, 25) with an optional
 * pay-in-full discount; `quarterly` is a monthly price paid three months at a time.
 */
export type PriceModel =
  | { kind: "free" }
  | { kind: "fixed"; amount: number }
  | { kind: "per_month"; perMonth: number; minMonths: number; maxMonths: number }
  | { kind: "milestones"; total: number; stages: readonly { name: string; percent: number }[]; payInFullDiscountPercent: number }
  | { kind: "quarterly"; perMonth: number };

/**
 * How the owner starts: `check` (the free check itself), `self` (buy online now: details, pay, intake),
 * `after_call` (book the free 20-minute call; the team sends the payment link after it).
 */
export type BuyMode = "check" | "self" | "after_call";

/** Something the owner sends us for the work: a document to upload, with why we need it. */
export type IntakeRecord = { id: string; label: string; detail: string; required: boolean };
/** A short question on the intake form. */
export type IntakeQuestion = { id: string; label: string; kind: "text" | "textarea"; required: boolean; hint?: string };

export type Product = {
  /** Stable identifier, stored on orders. */
  id: string;
  /** Its page: /services/<slug>. */
  slug: string;
  name: string;
  way: WayToBuy;
  /** The needs it answers, for the menu (first is its home). */
  needs: readonly Need[];
  /** One line for the menu. */
  short: string;
  /** Who it is for, in the owner's words. */
  forWhom: string;
  /** What the owner gets. */
  youGet: readonly string[];
  price: PriceModel;
  /** The earlier price kept as a fallback if the payment test shows the price does not sell (plan page 15). Internal. */
  fallbackPrice?: number;
  /** The delivery promise as the site says it. */
  delivery: string;
  /** Working days from complete records to delivery, for the date we commit to. Undefined: no single date. */
  workingDays?: number;
  buy: BuyMode;
  /** Variants sold under one product (the Six-Week Fix's four problems). */
  variants?: readonly { id: string; name: string; problem: string }[];
  /** On the menu, the variant shown under each need, so a product listed under several needs names a different problem each time. */
  variantForNeed?: Partial<Record<Need, string>>;
  /** What the owner sends us after paying. */
  intake: { records: readonly IntakeRecord[]; questions: readonly IntakeQuestion[] };
  /** The product we usually suggest next (plan page 18), and which of its variants. */
  next?: string;
  nextVariant?: string;
  /** Limits we state on the page (plan page 11: management accounts only; the tax note states record readiness only). */
  boundary?: string;
};

const STATEMENTS = (months: string): IntakeRecord => ({ id: "bank_statements", label: `Business bank statements for ${months}`, detail: "Every business account, as PDF or spreadsheet exports from your bank.", required: true });
const SALES_RECORDS: IntakeRecord = { id: "sales_records", label: "Sales records", detail: "Invoices, POS reports or your sales book for the same months.", required: true };
const COSTS: IntakeRecord = { id: "costs", label: "Your main costs", detail: "Rent, salaries, suppliers and any loans, with what each costs a month.", required: true };
const GOAL: IntakeQuestion = { id: "goal", label: "What do you want this work to help you decide or do?", kind: "textarea", required: true };

/**
 * The delivery promise on every dated product (ET, 22 October 2026). The remedy is the Terms' (§8), not an automatic
 * refund: the sentence is DELIVERY_REMEDY, shared with the journey and the promise cards.
 */
export const DELIVERY_PROMISE = `We confirm your delivery date once your records are complete. ${DELIVERY_REMEDY}`;

export const PRODUCTS: readonly Product[] = [
  {
    id: "business_health_check",
    slug: "business-health-check",
    name: "Free Business Health Check",
    way: "assessment",
    needs: ["whole_business"],
    short: "Ten minutes on your phone. A first read on where your business is stuck, and the first thing to buy, if anything.",
    forWhom: "Any business owner who wants to know where to start.",
    youGet: ["A summary of where your business stands, area by area", "The first product that fits, and the one after it", "The option of a free 20-minute Discovery Call"],
    price: { kind: "free" },
    delivery: "At once, on screen and by email.",
    buy: "check",
    intake: { records: [], questions: [] },
  },
  {
    id: "full_report",
    slug: "full-report",
    name: "Full Report",
    way: "assessment",
    needs: ["whole_business"],
    short: "Your Business Health Check in depth: what your answers show, the root causes, and what to fix first.",
    forWhom: "Owners who have taken the Business Health Check and want the detail.",
    youGet: ["Every area of your outline in depth", "The root cause behind each red and amber", "What to fix first, in order, with the Measure of Success for each"],
    price: { kind: "fixed", amount: 100_000 },
    delivery: "Emailed the moment you finish the short Report Intake after paying.",
    buy: "check",
    intake: { records: [], questions: [] },
  },
  {
    id: "funding_readiness_assessment",
    slug: "funding-readiness-assessment",
    name: "Funding Readiness Assessment",
    way: "assessment",
    needs: ["funding"],
    short: "Before you apply: are you ready for the loan you want, and what is missing?",
    forWhom: "Owners with a lender window open, or about to apply for a loan or grant.",
    youGet: ["A readiness score against what lenders such as LSETF and BOI ask for", "The gaps in your records, plan and documents, in order", "What to fix before you apply, and how long it will take"],
    price: { kind: "fixed", amount: 150_000 },
    fallbackPrice: 100_000,
    delivery: "Three working days from complete records.",
    workingDays: 3,
    buy: "self",
    intake: {
      records: [STATEMENTS("the last six months"), { id: "registration", label: "Business registration documents", detail: "CAC certificate and status report, and your TIN.", required: true }, { id: "lender_form", label: "The lender's application form or checklist", detail: "So we check you against what this lender asks for.", required: false }],
      questions: [{ id: "lender", label: "Which lender or programme are you applying to?", kind: "text", required: true }, { id: "amount", label: "How much do you want to borrow, and for what?", kind: "textarea", required: true }],
    },
    next: "funding_application_pack",
  },
  {
    id: "business_review",
    slug: "business-review",
    name: "Business Review",
    way: "assessment",
    needs: ["whole_business"],
    short: "Two weeks and two Sessions that test your whole business, to find the one problem to fix first and what to do about it.",
    forWhom: "Owners with several connected problems who are not sure which to fix first.",
    youGet: ["Your numbers, how the business runs and your market, tested together", "The one problem to fix first, in your words", "The Prescription: the first steps, the tools and who owns each"],
    price: { kind: "fixed", amount: 600_000 },
    fallbackPrice: 500_000,
    delivery: "Two weeks, with two Sessions.",
    buy: "after_call",
    intake: { records: [], questions: [] },
    next: "six_week_fix",
  },
  {
    id: "strategy_90_day_plan",
    slug: "strategy-and-90-day-plan",
    name: "Strategy and 90-Day Plan",
    way: "done_for_you",
    needs: ["strategy"],
    short: "Three priorities for your business and a 90-day plan to deliver them.",
    forWhom: "Owners with no clear direction, or too many priorities at once.",
    youGet: ["Where the business is going and what to stop", "Three priorities, each with a number to watch", "A 90-day plan: who does what, by when", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 450_000 },
    fallbackPrice: 350_000,
    delivery: "Seven working days from complete records.",
    workingDays: 7,
    buy: "self",
    intake: {
      records: [STATEMENTS("the last six months"), { id: "existing_plans", label: "Any plan, budget or targets you already have", detail: "Even a page of notes helps.", required: false }],
      questions: [GOAL, { id: "priorities", label: "What are you trying to do over the next year?", kind: "textarea", required: true }, { id: "blockers", label: "What keeps getting in the way?", kind: "textarea", required: true }],
    },
    next: "monthly_adviser_review",
  },
  {
    id: "business_model",
    slug: "business-model",
    name: "Business Model",
    way: "done_for_you",
    needs: ["strategy", "pricing"],
    short: "How your business makes money, on one page, and what to change so each sale earns more.",
    forWhom: "Owners whose business works but does not earn enough, or who are starting out or changing direction.",
    youGet: ["How your business makes money, on one page", "Who you sell to, what they pay for, and how they find you", "What each sale really earns, and what to change first", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 300_000 },
    delivery: "Seven working days from complete records.",
    workingDays: 7,
    buy: "self",
    intake: {
      records: [{ id: "price_list", label: "Your price list", detail: "What you charge for each product or service, and the discounts you give.", required: true }, { ...COSTS }, { id: "existing_plans", label: "Any plan, pitch or notes", detail: "Even a page of notes helps.", required: false }],
      questions: [GOAL, { id: "customers", label: "Who are your best customers, and why do they buy from you?", kind: "textarea", required: true }, { id: "change", label: "What would you like to change about how the business makes money?", kind: "textarea", required: true }],
    },
    next: "business_plan",
  },
  {
    id: "financial_model",
    slug: "financial-model",
    name: "Financial Model",
    way: "done_for_you",
    needs: ["finance", "funding"],
    short: "Three years of numbers: sales, costs, profit, cash and how much funding you need, in three cases.",
    forWhom: "Owners raising money, planning growth, or who want to know when the business breaks even.",
    youGet: ["Three years of sales, costs, profit and cash, month by month for the first year", "Worst, medium and best cases, and what each depends on", "When you break even, and how much funding you need and when", "The Excel model, yours to keep, with a 30-minute handover call"],
    price: { kind: "fixed", amount: 350_000 },
    delivery: "Seven working days from complete records.",
    workingDays: 7,
    buy: "self",
    intake: {
      records: [STATEMENTS("the last twelve months"), SALES_RECORDS, COSTS],
      questions: [GOAL, { id: "plans", label: "What are you planning over the next three years?", kind: "textarea", required: true, hint: "New outlets, products, hires or equipment, and roughly when." }, { id: "funding", label: "How much funding are you looking for, if any, and from whom?", kind: "textarea", required: false }],
    },
    next: "business_plan",
  },
  {
    id: "business_plan",
    slug: "business-plan",
    name: "Business Plan",
    way: "done_for_you",
    needs: ["strategy", "funding"],
    short: "The whole plan: your Business Model, the market, how you will run and grow, and the Financial Model.",
    forWhom: "Owners bringing in a partner or investor, or who need one plan the whole team works from.",
    youGet: ["The Business Model and the Financial Model, both included", "The market, your competitors and where you win", "How you will sell, run and staff the business, and the risks to watch", "Written for your reader: partners, investors or your own team", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 750_000 },
    delivery: "Fifteen working days from complete records.",
    workingDays: 15,
    buy: "after_call",
    intake: {
      records: [STATEMENTS("the last twelve months"), SALES_RECORDS, COSTS, { id: "existing_plans", label: "Any plan, pitch or notes", detail: "Even a page of notes helps.", required: false }],
      questions: [GOAL, { id: "reader", label: "Who will read the plan, and what do you want them to do?", kind: "textarea", required: true, hint: "For example: an investor to put in money, a partner to join, or your managers to follow it." }, { id: "plans", label: "What are you planning over the next three years?", kind: "textarea", required: true }],
    },
    next: "funding_application_pack",
  },
  {
    id: "pitch_deck",
    slug: "pitch-deck",
    name: "Pitch Deck",
    way: "done_for_you",
    needs: ["funding", "strategy"],
    short: "Twelve slides that tell an investor or partner why your business, why now, and what you are asking for.",
    forWhom: "Owners meeting investors, partners or big customers who need the business told in ten minutes.",
    youGet: ["A deck of about twelve slides, in your brand, ready to present", "The story: the problem, your answer, the market, the traction and the team", "The numbers and the ask, consistent with your records", "The editable file, with a 30-minute rehearsal call"],
    price: { kind: "fixed", amount: 300_000 },
    delivery: "Seven working days from complete records.",
    workingDays: 7,
    buy: "self",
    intake: {
      records: [SALES_RECORDS, COSTS, { id: "existing_plans", label: "Any plan, deck or notes", detail: "Your logo and brand colours too, if you have them.", required: false }],
      questions: [GOAL, { id: "audience", label: "Who will you present to, and what do you want them to do?", kind: "textarea", required: true, hint: "For example: an investor to put in ₦20 million, or a buyer to stock your product." }, { id: "ask", label: "What are you asking for, and what will you do with it?", kind: "textarea", required: true }],
    },
    next: "financial_model",
  },
  {
    id: "pricing_unit_cost_review",
    slug: "pricing-and-unit-cost-review",
    name: "Pricing and Unit Cost Review",
    way: "done_for_you",
    needs: ["pricing"],
    short: "What each product really costs you, what it earns, and what to charge.",
    forWhom: "Owners whose prices are guesses, or whose margins are unclear.",
    youGet: ["The true cost of each product or service", "Margin by line: what makes money and what loses it", "New prices to test, with what each change is worth", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 400_000 },
    fallbackPrice: 450_000,
    delivery: "Seven working days from complete records.",
    workingDays: 7,
    buy: "after_call",
    intake: {
      records: [STATEMENTS("the last six months"), SALES_RECORDS, COSTS, { id: "price_list", label: "Your current price list", detail: "With what competitors charge, if you know.", required: true }],
      questions: [GOAL, { id: "lines", label: "Which products or services sell most?", kind: "textarea", required: true }],
    },
    next: "six_week_fix",
    nextVariant: "margin",
  },
  {
    id: "bookkeeping_catch_up",
    slug: "bookkeeping-catch-up",
    name: "Bookkeeping Catch-Up",
    way: "done_for_you",
    needs: ["finance"],
    short: "Your books brought up to date: every transaction sorted, and management accounts you can use.",
    forWhom: "Owners with no records, or numbers they cannot trust.",
    youGet: ["Every transaction categorised and reconciled to your bank statements", "Management accounts for each month: income, costs and profit", "Business and personal money separated", "A 30-minute handover call"],
    price: { kind: "per_month", perMonth: 100_000, minMonths: 3, maxMonths: 12 },
    fallbackPrice: 75_000,
    delivery: "Five working days for three months of complete records.",
    workingDays: 5,
    buy: "self",
    intake: {
      records: [STATEMENTS("the months you are buying"), SALES_RECORDS, { id: "receipts", label: "Receipts and supplier invoices", detail: "Photos are fine.", required: false }],
      questions: [{ id: "accounts", label: "Which bank accounts does the business use?", kind: "textarea", required: true }],
    },
    next: "monthly_accounts",
    boundary: "Management accounts only. We do not prepare statutory accounts or file tax returns.",
  },
  {
    id: "cash_flow_forecast",
    slug: "13-week-cash-flow-forecast",
    name: "13-Week Cash Flow Forecast",
    way: "done_for_you",
    needs: ["finance"],
    short: "Week by week for the next 13 weeks: what comes in, what goes out, and when cash runs short.",
    forWhom: "Owners whose cash is always tight.",
    youGet: ["A 13-week forecast built from your own records", "The weeks when cash runs short, and by how much", "What to do about each: collect, delay, cut or fund", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 300_000 },
    fallbackPrice: 200_000,
    delivery: "Five working days from complete records.",
    workingDays: 5,
    buy: "self",
    intake: {
      records: [STATEMENTS("the last three months"), COSTS, { id: "debtors", label: "Who owes you money, and who you owe", detail: "A list with amounts and due dates.", required: true }],
      questions: [GOAL],
    },
    next: "six_week_fix",
    nextVariant: "cash_pricing",
  },
  {
    id: "funding_application_pack",
    slug: "funding-application-pack",
    name: "Funding Application Pack",
    way: "done_for_you",
    needs: ["funding"],
    short: "The plan, forecasts and documents your lender asks for, checked against their list.",
    forWhom: "Owners applying for a loan or grant, ideally after a Funding Readiness Assessment.",
    youGet: ["The business plan in the format the lender asks for", "Financial forecasts built from your records", "The lender's checklist ticked item by item", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 900_000 },
    fallbackPrice: 400_000,
    delivery: "Ten working days from complete records.",
    workingDays: 10,
    buy: "after_call",
    intake: {
      records: [STATEMENTS("the last twelve months"), { id: "registration", label: "Business registration documents", detail: "CAC certificate and status report, and your TIN.", required: true }, { id: "lender_form", label: "The lender's application form and checklist", detail: "We build the pack to it.", required: true }, COSTS],
      questions: [{ id: "lender", label: "Which lender or programme, and when does the window close?", kind: "text", required: true }, { id: "amount", label: "How much do you want, and what will you spend it on?", kind: "textarea", required: true }],
    },
    next: "monthly_accounts",
  },
  {
    id: "hiring_toolkit",
    slug: "hiring-toolkit",
    name: "Hiring Toolkit",
    way: "done_for_you",
    needs: ["people"],
    short: "Everything you need to hire right the first time: the role, the interview, the offer and the first 90 days.",
    forWhom: "Owners about to hire.",
    youGet: ["A job description and what good looks like in the role", "An interview guide and scorecard", "Offer terms and a first-90-days plan for the new hire", "A 30-minute handover call"],
    price: { kind: "fixed", amount: 300_000 },
    fallbackPrice: 200_000,
    delivery: "Five working days from complete answers.",
    workingDays: 5,
    buy: "self",
    intake: {
      records: [{ id: "current_roles", label: "Your current team: roles and what each person does", detail: "A short list is enough.", required: false }],
      questions: [{ id: "role", label: "Which role are you hiring for, and why now?", kind: "textarea", required: true }, { id: "budget", label: "What can you pay for the role each month?", kind: "text", required: true }],
    },
    next: "six_week_fix",
    nextVariant: "delegation_structure",
  },
  {
    id: "six_week_fix",
    slug: "six-week-fix",
    name: "Six-Week Fix",
    way: "six_week_fix",
    needs: ["pricing", "sales", "finance", "people"],
    short: "Six weeks on one problem: we prescribe and equip, your team does the work, and we review it with you every week.",
    forWhom: "Owners who know the problem and want it fixed, with someone checking every week.",
    youGet: ["The Prescription: what to do, the tools and who owns each step", "A Weekly Check-in for six weeks", "One Measure of Success, tracked every week", "A Day-30 Review after the six weeks"],
    price: { kind: "milestones", total: 1_500_000, stages: [{ name: "At the start", percent: 50 }, { name: "At the mid-point", percent: 25 }, { name: "At the result", percent: 25 }], payInFullDiscountPercent: 5 },
    fallbackPrice: 1_200_000,
    delivery: "Six weeks from your first Session.",
    buy: "after_call",
    variants: [
      { id: "margin", name: "Margin", problem: "Money comes in, but the business does not make money." },
      { id: "sales", name: "Sales", problem: "Sales are flat and customers do not come consistently." },
      { id: "cash_pricing", name: "Cash and Pricing", problem: "Cash is always tight and prices are guesses." },
      { id: "delegation_structure", name: "Delegation and Structure", problem: "Nothing moves unless you are there." },
    ],
    variantForNeed: { pricing: "margin", sales: "sales", finance: "cash_pricing", people: "delegation_structure" },
    intake: { records: [], questions: [] },
    next: "monthly_adviser_review",
  },
  {
    id: "monthly_accounts",
    slug: "monthly-accounts-and-cash-report",
    name: "Monthly Accounts and Cash Report",
    way: "monthly_service",
    needs: ["finance"],
    short: "Know your profit and cash by the 10th of every month.",
    forWhom: "Owners who want their numbers every month without keeping the books themselves.",
    youGet: ["Monthly management accounts by the 10th", "Your cash position and the month ahead", "A note on whether your records are ready for tax", "A short call to walk you through it"],
    price: { kind: "quarterly", perMonth: 200_000 },
    fallbackPrice: 150_000,
    delivery: "By the 10th of each month.",
    buy: "after_call",
    intake: { records: [], questions: [] },
    boundary: "Management accounts only. The tax note says whether your records are ready; it is not tax advice.",
  },
  {
    id: "monthly_adviser_review",
    slug: "monthly-adviser-review",
    name: "Monthly Adviser Review",
    way: "monthly_service",
    needs: ["strategy"],
    short: "One Session a month with an adviser: your numbers, your priorities and the decisions in front of you.",
    forWhom: "Owners who want someone experienced to check their thinking every month.",
    youGet: ["One Session a month with an IP Factory adviser", "Your numbers and priorities reviewed before each Session", "Agreed actions in writing after each Session"],
    price: { kind: "quarterly", perMonth: 150_000 },
    fallbackPrice: 100_000,
    delivery: "One Session a month.",
    buy: "after_call",
    intake: { records: [], questions: [] },
  },
];

/**
 * Online ordering (the order form, payment by link and the intake form) is switched on here once it is live. Until
 * then, a product the owner would buy themselves starts with the free call instead, so no page offers a dead link.
 */
export const ONLINE_ORDERS_OPEN = false;

/** How a product starts today: as its catalogue says, or with the call while online ordering is not yet open. */
export const startMode = (product: Pick<Product, "buy">, ordersOpen: boolean = ONLINE_ORDERS_OPEN): BuyMode =>
  product.buy === "self" && !ordersOpen ? "after_call" : product.buy;

/** True when the owner can buy the product online now. */
export const orderable = (product: Pick<Product, "buy">, ordersOpen: boolean = ONLINE_ORDERS_OPEN) => startMode(product, ordersOpen) === "self";

export const productById = (id: string) => PRODUCTS.find(product => product.id === id);
export const productBySlug = (slug: string) => PRODUCTS.find(product => product.slug === slug);

/** The products for sale on the menu, in menu order (the free check and the Full Report are reached from the check). */
export const MENU_PRODUCTS = PRODUCTS.filter(product => product.buy !== "check");

export const servicePath = (product: Pick<Product, "slug">) => `/services/${product.slug}`;

/** The headline price, as the menu and product page say it. */
export function priceLabel(price: PriceModel): string {
  switch (price.kind) {
    case "free": return "Free";
    case "fixed": return formatNaira(price.amount);
    case "per_month": return `${formatNaira(price.perMonth)} a month of records`;
    case "milestones": return formatNaira(price.total);
    // Paid a quarter at a time, so the quarter is the price; the month is shown beside it.
    case "quarterly": return `${formatNaira(quarterAmount(price))} a quarter`;
  }
}

/** The line under the price: how it is paid. */
export function priceTerms(price: PriceModel): string {
  switch (price.kind) {
    case "free": return "No card needed.";
    case "fixed": return "Paid before we start, by transfer or card.";
    case "per_month": return `At least ${price.minMonths} months (${formatNaira(price.perMonth * price.minMonths)}), paid before we start.`;
    case "milestones": {
      const parts = price.stages.map(stage => `${formatNaira(stageAmount(price, stage.percent))} ${stage.name.toLowerCase()}`).join(", ");
      return `${parts}. Or ${formatNaira(payInFullAmount(price))} in full at the start, ${price.payInFullDiscountPercent}% less.`;
    }
    case "quarterly": return `${formatNaira(quarterAmount(price))} a quarter (${formatNaira(price.perMonth)} a month), paid before the quarter starts. Stop at the end of any quarter.`;
  }
}

export const stageAmount = (price: Extract<PriceModel, { kind: "milestones" }>, percent: number) => Math.round((price.total * percent) / 100);
export const payInFullAmount = (price: Extract<PriceModel, { kind: "milestones" }>) => Math.round((price.total * (100 - price.payInFullDiscountPercent)) / 100);
export const quarterAmount = (price: Extract<PriceModel, { kind: "quarterly" }>) => price.perMonth * 3;
export const perMonthAmount = (price: Extract<PriceModel, { kind: "per_month" }>, months: number) => price.perMonth * months;

/** The service a home-page visitor is sent to first for each need (operational plan, page 18). */
export const NEED_LEAD: Record<Need, string> = {
  finance: "cash_flow_forecast",
  pricing: "pricing_unit_cost_review",
  funding: "funding_readiness_assessment",
  strategy: "strategy_90_day_plan",
  people: "hiring_toolkit",
  sales: "six_week_fix",
  whole_business: "business_review",
};

/** The products of one need, in menu order. */
export const productsForNeed = (need: Need) => MENU_PRODUCTS.filter(product => product.needs.includes(need));

/** Every product's "next" names a product on the menu. Checked by test. */
export const nextProduct = (product: Product) => (product.next ? productById(product.next) : undefined);

/** The least a product costs to start, in naira: the full price, the minimum months, or the first quarter. */
export function startingAmount(price: PriceModel): number {
  switch (price.kind) {
    case "free": return 0;
    case "fixed": return price.amount;
    case "per_month": return perMonthAmount(price, price.minMonths);
    case "milestones": return price.total;
    case "quarterly": return quarterAmount(price);
  }
}

/** The cheapest product of one way to buy, for "from ₦…" copy. */
export const startingPriceOf = (way: WayToBuy) => Math.min(...MENU_PRODUCTS.filter(product => product.way === way).map(product => startingAmount(product.price)));

/** A product as the menu lists it under one need: the variant's name and problem where it has one for that need. */
export function menuEntry(product: Product, need: Need): { name: string; short: string } {
  const variantId = product.variantForNeed?.[need];
  const variant = variantId ? product.variants?.find(item => item.id === variantId) : undefined;
  return variant ? { name: `${product.name}: ${variant.name}`, short: `${variant.problem} ${product.short}` } : { name: product.name, short: product.short };
}
