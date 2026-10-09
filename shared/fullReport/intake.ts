import { z } from "zod";

/**
 * The Report Intake: 17 questions the owner answers after paying for the full report, so the report can describe their
 * business at business-plan depth (agreed 9 October 2026). Short answers and ranges, so an owner without bookkeeping can
 * finish in about 12 minutes. The report is built from these answers and the business check by fixed rules
 * (shared/fullReport/build.ts): the same answers always give the same report.
 */

type Choice<T extends string> = readonly { value: T; label: string }[];
const choice = <T extends string>(options: Choice<T>) => options;

export const REGISTRATION = choice([
  { value: "business_name", label: "A registered business name (CAC)" },
  { value: "company", label: "A limited company (CAC)" },
  { value: "not_registered", label: "Not registered yet" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const PRICE_POSITION = choice([
  { value: "higher", label: "Higher than theirs" },
  { value: "same", label: "About the same" },
  { value: "lower", label: "Lower than theirs" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

/** How the owner charges for each product or service: a business paid a commission or success fee has no price list. */
export const CHARGE_BASIS = choice([
  { value: "price", label: "A set price" },
  { value: "percent", label: "A percentage of the deal" },
  { value: "varies", label: "It varies" },
] as const);
/** Out of every ₦100 a customer pays, how much goes on materials, stock or the direct labour to deliver it. */
export const COST_SHARE = choice([
  { value: "under_25", label: "Less than ₦25" },
  { value: "25_50", label: "₦25 to ₦50" },
  { value: "50_75", label: "₦50 to ₦75" },
  { value: "over_75", label: "More than ₦75" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const TOP_CUSTOMER_SHARE = choice([
  { value: "under_20", label: "Less than a fifth" },
  { value: "20_50", label: "A fifth to a half" },
  { value: "over_50", label: "More than half" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const CHANNELS = choice([
  { value: "word_of_mouth", label: "Word of mouth" },
  { value: "social_media", label: "Social media (Instagram, TikTok, Facebook, WhatsApp status)" },
  { value: "walk_in", label: "Walk-ins to a shop or office" },
  { value: "marketplace", label: "Online marketplaces (Jumia, Konga and others)" },
  { value: "direct_sales", label: "Calling or visiting customers" },
  { value: "partners", label: "Agents, distributors or partners" },
  { value: "paid_ads", label: "Paid adverts" },
  { value: "website", label: "Our website" },
  { value: "other", label: "Something else" },
] as const);

export const ENQUIRIES = choice([
  { value: "under_10", label: "Fewer than 10" },
  { value: "10_50", label: "10 to 50" },
  { value: "50_200", label: "50 to 200" },
  { value: "over_200", label: "More than 200" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const REPEAT = choice([
  { value: "monthly", label: "Most come back at least once a month" },
  { value: "occasionally", label: "Most come back, but not often" },
  { value: "few", label: "A few come back" },
  { value: "once", label: "Most buy once" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const TOOLS = choice([
  { value: "whatsapp", label: "WhatsApp for orders or the team" },
  { value: "excel", label: "Excel or Google Sheets" },
  { value: "accounting_software", label: "Accounting software" },
  { value: "pos", label: "A till or POS system" },
  { value: "app", label: "A booking, ordering or customer app" },
  { value: "paper", label: "Paper records" },
  { value: "none", label: "None of these" },
] as const);

export const BIGGEST_COST = choice([
  { value: "stock", label: "Stock or materials" },
  { value: "salaries", label: "Salaries" },
  { value: "rent", label: "Rent" },
  { value: "transport", label: "Transport and logistics" },
  { value: "marketing", label: "Marketing" },
  { value: "loans", label: "Loan repayments" },
  { value: "other", label: "Something else" },
] as const);

export const CASH = choice([
  { value: "under_500k", label: "Less than ₦500,000" },
  { value: "500k_2m", label: "₦500,000 to ₦2 million" },
  { value: "2m_10m", label: "₦2 million to ₦10 million" },
  { value: "over_10m", label: "More than ₦10 million" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const OWED = choice([
  { value: "none", label: "Nothing" },
  { value: "under_1m", label: "Less than ₦1 million" },
  { value: "1m_5m", label: "₦1 million to ₦5 million" },
  { value: "over_5m", label: "More than ₦5 million" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

export const LOANS = choice([
  { value: "none", label: "None" },
  { value: "under_1m", label: "Less than ₦1 million" },
  { value: "1m_10m", label: "₦1 million to ₦10 million" },
  { value: "over_10m", label: "More than ₦10 million" },
  { value: "not_sure", label: "I'm not sure" },
] as const);

const values = <T extends string>(options: Choice<T>) => options.map((option) => option.value) as [T, ...T[]];
const text = (max: number) => z.string().trim().max(max);
const naira = z.number().int().min(0).max(100_000_000_000).nullable();
const percentage = z.number().positive("Enter a percentage above 0.").max(100, "Enter a percentage of 100 or less.");

/**
 * One product or service and how it is charged. Forms sent before the charge basis existed have only a name and a
 * price (null when it varied), so a missing basis is read from the price.
 */
const product = z.preprocess(
  (value) => (value && typeof value === "object" && !("basis" in value) ? { ...value, basis: (value as { price?: unknown }).price == null ? "varies" : "price" } : value),
  z.object({
    name: text(80).min(1, "Name the product or service."),
    basis: z.enum(values(CHARGE_BASIS)),
    price: naira.default(null),
    /** For a commission or success fee: the percentage of the deal, and optionally a typical deal size in naira. */
    percent: percentage.nullable().default(null),
    dealSize: naira.default(null),
  }).superRefine((item, context) => {
    if (item.basis === "price" && item.price === null) context.addIssue({ code: "custom", path: ["price"], message: `Enter the price of ${item.name || "each product"}, or choose It varies.` });
    if (item.basis === "percent" && item.percent === null) context.addIssue({ code: "custom", path: ["percent"], message: `Enter the percentage of the deal you earn on ${item.name || "each service"}.` });
  }).transform((item) => ({
    name: item.name,
    basis: item.basis,
    price: item.basis === "price" ? item.price : null,
    percent: item.basis === "percent" ? item.percent : null,
    dealSize: item.basis === "percent" ? item.dealSize : null,
  })),
);
export type ReportProduct = z.infer<typeof product>;

/** True when the owner earns a percentage of deals, so the money questions count fees, not the deal money passed on. */
export const earnsByDeal = (products: readonly { basis?: string }[]) => products.some((item) => item.basis === "percent");

/**
 * The cost-share band for a gross margin the owner typed. Bands overlap at their edges in words ("50% to 75%",
 * "25% to 50%"), so an edge goes to the band whose margin wording includes it.
 */
export function costShareForMargin(margin: number): (typeof COST_SHARE)[number]["value"] {
  if (margin > 75) return "under_25";
  if (margin >= 50) return "25_50";
  if (margin >= 25) return "50_75";
  return "over_75";
}

/** A percentage as people write it: 2, 2.5, 12.75. */
export const formatPercent = (value: number) => `${Number(value.toFixed(2))}%`;

export const intakeSchema = z.object({
  location: text(120).min(2, "Tell us where you sell from."),
  registration: z.enum(values(REGISTRATION)),
  products: z.array(product).min(1, "Add at least one product or service.").max(3),
  bestCustomer: text(200).min(2, "Describe your best customer in a line."),
  competitors: z.array(text(80).min(1)).max(3),
  pricePosition: z.enum(values(PRICE_POSITION)),
  /** Which of the products earns the most, by its position in `products`; null for "not sure". */
  topEarner: z.number().int().min(0).max(2).nullable(),
  costShare: z.enum(values(COST_SHARE)),
  /** The gross margin, when the owner typed it instead of choosing a band; it then decides the band. */
  marginPercent: z.number().min(0, "Enter a margin of 0 or more.").max(100, "Enter a margin of 100 or less.").nullable().default(null),
  topCustomerShare: z.enum(values(TOP_CUSTOMER_SHARE)),
  channels: z.array(z.enum(values(CHANNELS))).min(1, "Choose at least one way customers find you.").max(CHANNELS.length),
  enquiries: z.enum(values(ENQUIRIES)),
  /** Of every 10 people who ask, how many buy; null for "not sure". */
  conversion: z.number().int().min(0).max(10).nullable(),
  repeat: z.enum(values(REPEAT)),
  roles: text(400).min(2, "List who does what, including you."),
  tools: z.array(z.enum(values(TOOLS))).min(1, "Choose at least one, or None of these.").max(TOOLS.length),
  lastMonthRevenue: naira,
  monthlyCosts: naira,
  biggestCost: z.enum(values(BIGGEST_COST)),
  cash: z.enum(values(CASH)),
  owed: z.enum(values(OWED)),
  loans: z.enum(values(LOANS)),
  goal: text(300).min(2, "Tell us what would make the next 12 months a success."),
}).superRefine((intake, context) => {
  if (intake.topEarner !== null && intake.topEarner >= intake.products.length) {
    context.addIssue({ code: "custom", path: ["topEarner"], message: "Choose one of the products you listed." });
  }
}).transform((intake) => (intake.marginPercent === null ? intake : { ...intake, costShare: costShareForMargin(intake.marginPercent) }));

export type ReportIntake = z.infer<typeof intakeSchema>;

/**
 * An intake as stored, read with today's schema so forms sent before a field existed (the charge basis, the typed
 * margin) get its default. If a stored intake no longer passes, it is used as stored rather than losing the report.
 */
export function readIntake(stored: unknown): ReportIntake | null {
  if (!stored || typeof stored !== "object") return null;
  const parsed = intakeSchema.safeParse(stored);
  return parsed.success ? parsed.data : (stored as ReportIntake);
}

/** The questions in the order the form asks them, numbered 1 to 17 (two of them have two parts). */
export const INTAKE_QUESTIONS = [
  { id: "location", group: "Your business today", prompt: "Where do you sell from?", hint: "For example: a shop in Yaba, Lagos, and online across Nigeria." },
  { id: "registration", group: "Your business today", prompt: "How is the business registered?" },
  { id: "products", group: "Your business today", prompt: "Your top three products or services, and how you charge for each.", hint: "A set price in naira, a percentage of the deal (a commission or success fee), or a price that varies." },
  { id: "bestCustomer", group: "Your market", prompt: "Describe your best customer in one line.", hint: "Who they are, where they are and why they buy from you." },
  { id: "competitors", group: "Your market", prompt: "Name up to three competitors.", hint: "Businesses your customers compare you with." },
  { id: "pricePosition", group: "Your market", prompt: "Are your prices higher, about the same or lower than theirs?" },
  { id: "topEarner", group: "What you sell", prompt: "Which of your products or services earns you the most?" },
  {
    id: "costShare", group: "What you sell", prompt: "Out of every ₦100 a customer pays you, how much goes on materials, stock or the direct labour to deliver it?",
    dealPrompt: "Out of every ₦100 you earn in commission and fees, how much goes on delivering the deal?", dealHint: "For example: agents' or introducers' cuts, travel and subcontractors.",
  },
  { id: "topCustomerShare", group: "What you sell", prompt: "How much of your sales come from your three biggest customers?" },
  { id: "channels", group: "How customers buy", prompt: "Where do new customers come from?", hint: "Choose all that apply." },
  { id: "enquiries", group: "How customers buy", prompt: "About how many people ask about buying in a month, and how many of every 10 buy?" },
  { id: "repeat", group: "How customers buy", prompt: "Do customers come back?" },
  { id: "roles", group: "How it runs", prompt: "Who does what? List the roles, including yours.", hint: "For example: me (sales and buying), one shop attendant, a part-time bookkeeper." },
  { id: "tools", group: "How it runs", prompt: "Which tools do you use to run the business?", hint: "Choose all that apply." },
  {
    id: "lastMonthRevenue", group: "The numbers", prompt: "Last month: how much came in, and what did running the business cost?", hint: "Your best estimate in naira. Costs include stock, salaries, rent and everything else.",
    dealHint: "Count only your commission and fees, not the deal money you pass on to others. Costs include salaries, rent, travel and everything else.",
  },
  { id: "cash", group: "The numbers", prompt: "Cash in the bank today, money customers owe you, and any loans." },
  { id: "goal", group: "Your goal", prompt: "What would make the next 12 months a success?", hint: "In your words. A number helps: a sales level, a new shop, a hire." },
] as const;

export type IntakeQuestion = (typeof INTAKE_QUESTIONS)[number];

/** The question as this owner sees it: a business paid by the deal is asked about fees, not the money passed on. */
export function intakeWording(question: IntakeQuestion, byDeal: boolean): { prompt: string; hint?: string } {
  const prompt = byDeal && "dealPrompt" in question ? question.dealPrompt : question.prompt;
  const hint = byDeal && "dealHint" in question ? question.dealHint : "hint" in question ? question.hint : undefined;
  return { prompt, hint };
}

export const labelOf = <T extends string>(options: Choice<T>, value: T) => options.find((option) => option.value === value)?.label ?? value;
