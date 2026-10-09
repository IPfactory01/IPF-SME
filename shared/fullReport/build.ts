import { DISC_STYLES, READINESS_LABELS, sectorOf, type AreaRead, type CheckResult } from "../businessCheck/engine";
import { SECTOR_NOUNS } from "../businessCheck/sectorExamples";
import { AREA_NAMES, GAP_LABELS, SECTIONS, type Answers, type Health } from "../businessCheck/questions";
import { CURRENT_STATE, formatNaira, PRICES } from "../businessSupport";
import { AREA_CONTENT, AREA_DEFAULT_MOVE, IDEA_CONTENT, IDEA_READINGS, type DetailReading } from "./content";
import {
  BIGGEST_COST, CASH, CHANNELS, COST_SHARE, costShareForMargin, earnsByDeal, ENQUIRIES, formatPercent, INTAKE_QUESTIONS, intakeWording, labelOf, LOANS, OWED, PRICE_POSITION,
  REGISTRATION, REPEAT, TOOLS, TOP_CUSTOMER_SHARE, type ReportIntake, type ReportProduct,
} from "./intake";

/**
 * The full business check report, built by fixed rules from the business check and the Report Intake. Nothing here
 * calls a language model or reads the clock: the same inputs always give the same report, word for word. The PDF
 * renderer (server/fullReport/pdf.ts) only lays this structure out.
 *
 * Structure agreed 9 October 2026, modelled on the IPF business plan method: a one-page answer, eight parts that
 * describe the business today, the diagnosis, a 90-day plan, how we can help, and the owner's answers.
 */

/** 2: products can be charged as a percentage of the deal, and the owner can type their margin. */
export const REPORT_VERSION = 2;

export type ReportHealth = Health | "not_assessed";

export type ReportBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "metrics"; items: { label: string; value: string; note: string }[] }
  | { kind: "table"; columns: string[]; rows: string[][]; widths?: number[] }
  | { kind: "reading"; area: string; health: ReportHealth; theirWords: string; shows: string[]; meaning: string[]; good: string; move: string; thisWeek: string; watch: string }
  | { kind: "callout"; title: string; text: string };

export type ReportPart = {
  number: number;
  title: string;
  /** The IPF business plan section this part condenses. */
  method: string;
  finding: string;
  health?: ReportHealth;
  blocks: ReportBlock[];
};

export type PlanMove = { month: string; area: string; move: string; thisWeek: string; watch: string };

export type FullReport = {
  version: typeof REPORT_VERSION;
  reference: string;
  date: string;
  ownerName: string;
  businessName: string;
  descriptor: string;
  onePage: {
    position: string;
    fixFirst: { area: string; finding: string };
    moves: PlanMove[];
    watch: string;
    keyNumbers: { label: string; value: string; note: string }[];
    tally: Record<Health, number>;
  };
  parts: ReportPart[];
  appendix: { title: string; rows: { question: string; answer: string }[] }[];
  method: string;
};

export type ReportInput = {
  reference: string;
  /** When the intake was submitted: the report's date. Passed in, never read from the clock. */
  date: Date;
  contact: { fullName: string; businessName?: string | null };
  answers: Answers;
  result: CheckResult;
  intake: ReportIntake;
};

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const HEALTH_RANK: Record<Health, number> = { clear: 0, watch: 1, stuck: 2 };
const worst = (...values: (Health | undefined)[]): Health =>
  values.reduce<Health>((current, value) => (value && HEALTH_RANK[value] > HEALTH_RANK[current] ? value : current), "clear");
/** Lower-cases the first letter for use mid-sentence, but keeps "I", acronyms and names such as WhatsApp or CAC. */
const lower = (text: string) => (/^(I\b|I'|[A-Z][A-Za-z]*[A-Z])/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
export const reportDate = (date: Date) => DATE.format(date);

/** ₦1,250,000 reads as ₦1.25 million in running text; smaller amounts in full. */
function money(amount: number) {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const text = Number.isInteger(millions) ? String(millions) : millions.toFixed(millions >= 10 ? 1 : 2).replace(/0+$/, "").replace(/\.$/, "");
    return `₦${text} million`;
  }
  return formatNaira(amount);
}

function optionLabel(questionId: string, value: unknown): string | undefined {
  for (const section of Object.values(SECTIONS)) {
    const question = section.questions.find((item) => item.id === questionId);
    if (!question) continue;
    const options = [...question.options, ...(question.ideaOptions ?? [])];
    if (Array.isArray(value)) return value.map((item) => options.find((option) => option.value === item)?.label ?? item).join("; ");
    return options.find((option) => option.value === value)?.label;
  }
  return undefined;
}
const answer = (answers: Answers, id: string) => (typeof answers[id] === "string" ? (answers[id] as string) : undefined);

// ---------------------------------------------------------------------------------------------
// The numbers the rules work out from the intake
// ---------------------------------------------------------------------------------------------

type Range = [number, number | null];
const CASH_RANGE: Record<string, Range> = { under_500k: [0, 500_000], "500k_2m": [500_000, 2_000_000], "2m_10m": [2_000_000, 10_000_000], over_10m: [10_000_000, null] };
const OWED_RANGE: Record<string, Range> = { none: [0, 0], under_1m: [0, 1_000_000], "1m_5m": [1_000_000, 5_000_000], over_5m: [5_000_000, null] };
const ENQUIRY_RANGE: Record<string, Range> = { under_10: [0, 10], "10_50": [10, 50], "50_200": [50, 200], over_200: [200, null] };
const REVENUE_BAND: Record<string, Range> = { under1m: [0, 1_000_000], "1to3m": [1_000_000, 3_000_000], "3to5m": [3_000_000, 5_000_000], "5to10m": [5_000_000, 10_000_000], "10to25m": [10_000_000, 25_000_000], over25m: [25_000_000, null] };
const MARGIN_BAND: Record<string, { text: string; health: Health }> = {
  under_25: { text: "over 75%", health: "clear" },
  "25_50": { text: "50% to 75%", health: "clear" },
  "50_75": { text: "25% to 50%", health: "watch" },
  over_75: { text: "under 25%", health: "stuck" },
};

export type ReportMetrics = ReturnType<typeof reportMetrics>;

export function reportMetrics(intake: ReportIntake, answers: Answers) {
  const revenue = intake.lastMonthRevenue;
  const costs = intake.monthlyCosts;
  const result = revenue !== null && costs !== null ? revenue - costs : null;
  const resultMargin = result !== null && revenue ? result / revenue : null;
  const weeklyCosts = costs ? (costs * 12) / 52 : null;
  const cash = CASH_RANGE[intake.cash];
  const cover = cash && weeklyCosts ? { low: cash[0] / weeklyCosts, high: cash[1] === null ? null : cash[1] / weeklyCosts } : null;
  const coverMid = cover ? (cover.high === null ? cover.low * 1.5 : (cover.low + cover.high) / 2) : null;
  const enquiries = ENQUIRY_RANGE[intake.enquiries];
  const newCustomers = enquiries && intake.conversion !== null ? { low: Math.round((enquiries[0] * intake.conversion) / 10), high: enquiries[1] === null ? null : Math.round((enquiries[1] * intake.conversion) / 10) } : null;
  const owed = OWED_RANGE[intake.owed];
  const owedMonths = owed && revenue ? (owed[1] === null ? owed[0] / revenue : (owed[0] + owed[1]) / 2 / revenue) : null;
  const band = REVENUE_BAND[String(answers.p_revenue)];
  const revenueVsTypical = band && revenue !== null ? (revenue < band[0] ? "below" : band[1] !== null && revenue > band[1] ? "above" : "within") : null;
  // A typed margin is quoted as typed; otherwise the band the owner chose.
  const typedMargin = intake.marginPercent ?? null;
  const margin = typedMargin !== null ? { text: formatPercent(typedMargin), health: MARGIN_BAND[costShareForMargin(typedMargin)].health } : MARGIN_BAND[intake.costShare];
  /** What the margin is a share of: a business paid by the deal keeps part of each fee, not each sale. */
  const per = earnsByDeal(intake.products) ? "fee" : "sale";
  return { revenue, costs, result, resultMargin, cover, coverMid, newCustomers, owedMonths, revenueVsTypical, margin, per };
}

function coverText(cover: ReportMetrics["cover"]) {
  if (!cover) return "Not known";
  const low = Math.floor(cover.low);
  if (cover.high === null) return `More than ${low} weeks`;
  const high = Math.max(Math.ceil(cover.high), 1);
  if (low <= 0) return `Less than ${high} week${high === 1 ? "" : "s"}`;
  return low === high ? `About ${low} weeks` : `${low} to ${high} weeks`;
}

function customersText(range: ReportMetrics["newCustomers"]) {
  if (!range) return "Not known";
  if (range.high === null) return `More than ${range.low}`;
  return range.low === range.high ? `About ${range.low}` : `${range.low} to ${range.high}`;
}

/** "₦50 to ₦75", or the exact share when the owner typed their margin ("₦80" for a 20% margin). */
function costShareWords(intake: ReportIntake) {
  return intake.marginPercent != null ? `₦${Number((100 - intake.marginPercent).toFixed(2))}` : lower(labelOf(COST_SHARE, intake.costShare));
}

/** How a product is charged, in words: "₦18,000", "2% of the deal, about ₦1,000,000 on a ₦50,000,000 deal" or "Varies". */
export function chargeText(product: ReportProduct) {
  if (product.basis === "percent" && product.percent !== null) {
    const fee = product.dealSize ? Math.round((product.dealSize * product.percent) / 100) : null;
    return `${formatPercent(product.percent)} of the deal${fee !== null ? `, about ${formatNaira(fee)} on a ${formatNaira(product.dealSize!)} deal` : ""}`;
  }
  return product.basis === "price" && product.price !== null ? formatNaira(product.price) : "Varies";
}

// ---------------------------------------------------------------------------------------------
// Area readings: the check's answer, or the intake when the check did not ask
// ---------------------------------------------------------------------------------------------

type Reading = Extract<ReportBlock, { kind: "reading" }>;

function statusOf(area: number, answers: Answers) {
  const value = answer(answers, `s${area}_status`);
  return value ? AREA_CONTENT[area]?.status[value] : undefined;
}

function detailOf(area: number, answers: Answers): DetailReading | undefined {
  const value = answer(answers, `s${area}_detail`);
  return value ? AREA_CONTENT[area]?.detail[value] : undefined;
}

/** The follow-up reading the intake points to, when the owner did not answer one in the check. */
function fallbackDetail(area: number, intake: ReportIntake, metrics: ReportMetrics): DetailReading {
  const d = (key: string) => AREA_CONTENT[area].detail[key];
  switch (area) {
    case 1: return d("no_goals");
    case 2: return !intake.competitors.length || intake.pricePosition === "not_sure" ? d("competitors") : d("profitable");
    case 3: return intake.pricePosition === "lower" ? d("price_value") : d("why_us");
    case 4: return intake.topCustomerShare === "over_50" ? d("concentration") : d("price_feel");
    case 5: return intake.conversion !== null && intake.conversion <= 3 ? d("conversion") : intake.repeat === "once" || intake.repeat === "few" ? d("repeat") : d("awareness");
    case 6: return intake.tools.includes("paper") || intake.tools.includes("none") ? d("manual") : d("decisions");
    case 7: return (metrics.owedMonths ?? 0) >= 1 ? d("late_payers") : intake.loans !== "none" && intake.loans !== "not_sure" ? d("loan") : d("unit_cost");
    case 8: return intake.registration === "not_registered" || intake.registration === "not_sure" ? d("tax") : intake.topCustomerShare === "over_50" ? d("contracts") : d("key_person");
    default: return { meaning: "", ...AREA_DEFAULT_MOVE[area] };
  }
}

function outlineRow(result: CheckResult, area: number): AreaRead | undefined {
  return result.outline.find((row) => row.area === area);
}

function reading(input: { area: number; answers: Answers; result: CheckResult; intake: ReportIntake; metrics: ReportMetrics; intakeHealth: Health; shows: string[]; notes?: string[]; intakeFinding: string }) {
  const { area, answers, result, intake, metrics } = input;
  const row = outlineRow(result, area);
  const status = statusOf(area, answers);
  const detail = detailOf(area, answers) ?? fallbackDetail(area, intake, metrics);
  const health = worst(row?.health, input.intakeHealth);
  const block: Reading = {
    kind: "reading",
    area: AREA_NAMES[area],
    health,
    theirWords: row?.answer ? `“${row.answer}”` : "From your Report Intake answers",
    shows: input.shows,
    meaning: [status?.meaning, detailOf(area, answers)?.meaning, ...(input.notes ?? [])].filter((item): item is string => Boolean(item)),
    good: AREA_CONTENT[area].good,
    move: detail.move,
    thisWeek: detail.thisWeek,
    watch: AREA_CONTENT[area].watch,
  };
  if (!block.meaning.length) block.meaning = [detail.meaning || input.intakeFinding];
  // The finding is the owner's own reading when the check asked; the intake's when it did not, or when the intake
  // shows a problem the owner did not report.
  const finding = status && !(row?.health === "clear" && HEALTH_RANK[input.intakeHealth] > 0) ? status.finding : input.intakeFinding;
  return { block, health, finding, area };
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

const AGE: Record<string, string> = { under2: "under two years", "2to5": "two to five years", "5to10": "five to ten years", over10: "more than ten years" };
const MODEL: Record<string, string> = { maker: "makes and sells its own products", trader: "buys and sells goods", expert: "sells expertise and services", mixed: "mixes making, trading and services" };
const TREND: Record<string, string> = { growing: "Revenue has grown over the last 12 months.", flat: "Revenue has been flat for the last 12 months.", declining: "Revenue has fallen over the last 12 months.", early: "It is too early to read a revenue trend." };
const TEAM: Record<string, string> = { solo: "Mostly you", cofounder: "You and a co-founder or partner", team: "You and a small management team", family: "You, with family members" };
const HOURS: Record<string, string> = { lt2: "Less than 2 hours a week", "2to4": "2 to 4 hours a week", "5plus": "5 hours or more a week" };
const TOUGH: Record<string, string> = { me_easy: "You do, and it comes naturally", me_avoid: "You do, but you put it off", nobody: "It often does not happen" };
const FINANCE_SKILLS: Record<string, string> = { pl: "read a profit and loss statement", cash: "tell profit from cash", unit: "work out a unit cost", margin: "know your margin" };

/** Root-cause order, as in the business check: money and model problems usually sit under sales, offer and people. */
const ROOT_ORDER = [7, 4, 5, 3, 6, 1, 2, 8, 9, 10];

export function buildFullReport(input: ReportInput): FullReport {
  const { answers, result, intake } = input;
  const metrics = reportMetrics(intake, answers);
  const businessName = input.contact.businessName?.trim() || answer(answers, "p_name")?.trim() || "Your business";
  const sector = sectorOf(answers);
  const typeKey = answer(answers, "p_type") ?? "mixed";
  const idea = answers.p_stage === "idea";
  const descriptor = idea
    ? `A ${sector ? `${SECTOR_NOUNS[sector]} ` : ""}business idea, not yet trading`
    : `A ${sector ? `${SECTOR_NOUNS[sector]} ` : ""}business that ${MODEL[typeKey]}${answers.p_age ? `, trading for ${AGE[String(answers.p_age)]}` : ""}`;
  const products = intake.products.map((product, index) => ({ ...product, top: intake.topEarner === index }));
  const topProduct = intake.topEarner !== null ? intake.products[intake.topEarner]?.name : undefined;

  // ---- Readings for parts 2 to 8 -------------------------------------------------------------
  const competitorsKnown = intake.competitors.length > 0;
  const marketHealth = worst(!competitorsKnown ? "watch" : undefined, intake.pricePosition === "not_sure" ? "watch" : undefined);
  const market = reading({
    area: 2, answers, result, intake, metrics, intakeHealth: marketHealth,
    intakeFinding: !competitorsKnown ? "You can describe your best customer, but not yet the competitors they compare you with." : intake.pricePosition === "not_sure" ? "You know your best customer and your competitors, but not where your prices sit against theirs." : "You can describe your best customer and the competitors they compare you with.",
    shows: [
      `Your best customer: ${sentence(intake.bestCustomer)}`,
      competitorsKnown ? `Competitors you named: ${list(intake.competitors)}.` : "You did not name any competitors.",
      `Your prices against theirs: ${lower(labelOf(PRICE_POSITION, intake.pricePosition))}.`,
      ...(answer(answers, "s2_detail") ? [`What would help most: ${lower(optionLabel("s2_detail", answers.s2_detail) ?? "")}.`] : []),
    ],
    notes: outlineRow(result, 2)?.health === "clear" && !competitorsKnown ? ["Your check answer says you know who you are up against, but you did not name a competitor. Write them down: a competitor you cannot name is one you cannot price against."] : [],
  });

  const marginHealth = metrics.margin?.health ?? "watch";
  const concentrationHealth: Health | undefined = intake.topCustomerShare === "over_50" ? "watch" : undefined;
  const offerHealth = worst(intake.pricePosition === "lower" && marginHealth !== "clear" ? "watch" : undefined);
  const offer = reading({
    area: 3, answers, result, intake, metrics, intakeHealth: offerHealth,
    intakeFinding: topProduct ? `${topProduct} earns you the most, so the offer should be built around it.` : "You are not yet sure which product earns you the most, so the offer is not built around a clear winner.",
    shows: [
      `What you sell: ${list(intake.products.map((product) => product.name))}.`,
      topProduct ? `Your top earner: ${topProduct}.` : "You are not sure which product earns the most.",
      ...(earnsByDeal(intake.products) ? ["You earn a percentage of each deal, so your income rises and falls with the number and size of deals, not with a price list."] : []),
      ...(answer(answers, "s3_detail") ? [`Where the offer falls short: ${lower(optionLabel("s3_detail", answers.s3_detail) ?? "")}.`] : []),
    ],
  });
  const model = reading({
    area: 4, answers, result, intake, metrics, intakeHealth: worst(marginHealth, concentrationHealth),
    intakeFinding: metrics.margin ? `About ${metrics.margin.text} of each ${metrics.per} is left after direct costs${metrics.margin.health === "stuck" ? ", too little to cover the rest of the business" : ""}.` : `You do not yet know how much of each ${metrics.per} is left after direct costs.`,
    shows: [
      metrics.margin ? `Gross margin, from your answer: ${metrics.margin.text} (${costShareWords(intake)} of every ₦100 goes on direct costs).` : `You are not sure how much of each ${metrics.per} goes on direct costs.`,
      `Sales from your three biggest customers: ${lower(labelOf(TOP_CUSTOMER_SHARE, intake.topCustomerShare))}.`,
      `Your prices against competitors: ${lower(labelOf(PRICE_POSITION, intake.pricePosition))}.`,
      ...(answer(answers, "s4_detail") ? [`What sounds most like you: ${lower(optionLabel("s4_detail", answers.s4_detail) ?? "")}.`] : []),
    ],
    notes: [
      ...(outlineRow(result, 4)?.health === "clear" && marginHealth === "stuck" ? ["Your check answer says margins are healthy, but more than ₦75 of every ₦100 goes on direct costs. That leaves under 25% for rent, salaries and profit."] : []),
      ...(intake.pricePosition === "lower" && marginHealth !== "clear" ? ["You price below competitors on a thin margin, so you may be buying sales rather than earning them."] : []),
      ...(intake.topCustomerShare === "over_50" ? ["More than half your sales come from three customers. Losing one would change the business overnight."] : []),
    ],
  });

  const channelsOnlyWord = intake.channels.length === 1 && intake.channels[0] === "word_of_mouth";
  const lowConversion = intake.conversion !== null && intake.conversion <= 2;
  const salesHealth = worst(lowConversion ? "watch" : undefined, intake.repeat === "once" ? "watch" : undefined, channelsOnlyWord ? "watch" : undefined);
  const sales = reading({
    area: 5, answers, result, intake, metrics, intakeHealth: salesHealth,
    intakeFinding: lowConversion ? `Only ${intake.conversion} in 10 people who ask go on to buy, so enquiries are being lost.` : channelsOnlyWord ? "Every new customer comes by word of mouth, which you cannot turn up when you need more sales." : intake.repeat === "once" ? "Most customers buy once, so you pay to win every sale again." : "Customers find you through more than one route, and enquiries turn into sales.",
    shows: [
      `Where new customers come from: ${list(intake.channels.map((value) => lower(labelOf(CHANNELS, value))))}.`,
      `Enquiries a month: ${lower(labelOf(ENQUIRIES, intake.enquiries))}. ${intake.conversion !== null ? `Of every 10, ${intake.conversion} buy.` : "You are not sure how many buy."}`,
      `Do customers come back: ${lower(labelOf(REPEAT, intake.repeat))}.`,
      ...(answer(answers, "s5_detail") ? [`Where sales break down: ${lower(optionLabel("s5_detail", answers.s5_detail) ?? "")}.`] : []),
    ],
    notes: outlineRow(result, 5)?.health === "clear" && lowConversion ? [`Your check answer says customers come steadily, but only ${intake.conversion} in 10 enquiries buy. There is more to win from the people already asking.`] : [],
  });

  const paperOnly = intake.tools.every((tool) => tool === "paper" || tool === "none");
  const opsHealth = worst(paperOnly ? "watch" : undefined, result.founder.needsDriver ? "watch" : undefined);
  const operations = reading({
    area: 6, answers, result, intake, metrics, intakeHealth: opsHealth,
    intakeFinding: paperOnly ? "The business runs on paper and memory, which makes it slow to check and hard to hand over." : "Roles are named and the business uses tools to run, which is the base for handing work over.",
    shows: [
      `Who does what: ${sentence(intake.roles)}`,
      `Tools: ${list(intake.tools.map((value) => lower(labelOf(TOOLS, value))))}.`,
      ...(answers.f_hours ? [`Time you give to working on the business, not in it: ${lower(HOURS[String(answers.f_hours)] ?? "")}.`] : []),
      ...(answers.f_tough ? [`Who pushes hard (chasing debts, closing, hard calls): ${lower(TOUGH[String(answers.f_tough)] ?? "")}.`] : []),
      ...(answer(answers, "s6_detail") ? [`What hurts most: ${lower(optionLabel("s6_detail", answers.s6_detail) ?? "")}.`] : []),
    ],
    notes: result.founder.needsDriver ? ["Nobody in the business reliably makes the hard calls: chasing debts, closing deals, letting someone go. That role needs an owner."] : [],
  });

  const deficit = metrics.result !== null && metrics.result < 0;
  const thinResult = metrics.resultMargin !== null && metrics.resultMargin < 0.1;
  const numbersUnknown = [intake.lastMonthRevenue, intake.monthlyCosts].filter((value) => value === null).length + (intake.cash === "not_sure" ? 1 : 0);
  const coverHealth: Health | undefined = metrics.coverMid === null ? undefined : metrics.coverMid < 4 ? "stuck" : metrics.coverMid < 8 ? "watch" : undefined;
  const financeHealth = worst(deficit ? "stuck" : thinResult ? "watch" : undefined, coverHealth, numbersUnknown >= 2 ? "watch" : undefined, (metrics.owedMonths ?? 0) >= 1 ? "watch" : undefined);
  const finance = reading({
    area: 7, answers, result, intake, metrics, intakeHealth: financeHealth,
    intakeFinding: deficit ? `Last month the business spent ${money(-metrics.result!)} more than it brought in.` : numbersUnknown >= 2 ? "The basic numbers are not yet known, so decisions are made without a dashboard." : coverHealth === "stuck" ? "Cash in the bank covers less than a month of costs, so one bad month is a crisis." : `Last month the business kept ${money(metrics.result ?? 0)} after costs.`,
    shows: [
      `Last month in: ${intake.lastMonthRevenue !== null ? formatNaira(intake.lastMonthRevenue) : "not known"}. Costs: ${intake.monthlyCosts !== null ? formatNaira(intake.monthlyCosts) : "not known"}. Biggest cost: ${lower(labelOf(BIGGEST_COST, intake.biggestCost))}.`,
      `Cash in the bank: ${lower(labelOf(CASH, intake.cash))}. Owed to you: ${lower(labelOf(OWED, intake.owed))}. Loans: ${lower(labelOf(LOANS, intake.loans))}.`,
      ...(answer(answers, "s7_detail") ? [`Your biggest money worry: ${lower(optionLabel("s7_detail", answers.s7_detail) ?? "")}.`] : []),
    ],
    notes: [
      ...(outlineRow(result, 7)?.health === "clear" && deficit ? ["Your check answer says you know your numbers, but last month's costs were higher than sales. Knowing the numbers is the first step; acting on them is the second."] : []),
      ...((metrics.owedMonths ?? 0) >= 1 ? ["Customers owe you about a month of sales or more. Collecting it is the cheapest money the business can raise."] : []),
    ],
  });

  const unregistered = intake.registration === "not_registered" || intake.registration === "not_sure";
  const riskHealth = worst(unregistered ? "watch" : undefined, concentrationHealth, coverHealth);
  const risk = reading({
    area: 8, answers, result, intake, metrics, intakeHealth: riskHealth,
    intakeFinding: coverHealth === "stuck" ? "The biggest risk is cash: the bank balance covers less than a month of costs, so one bad month could stop the business."
      : unregistered ? "The business is not clearly registered, which exposes it to penalties and closes doors to contracts and loans."
      : intake.topCustomerShare === "over_50" ? "The biggest risk is dependence: more than half your sales come from three customers."
      : coverHealth === "watch" ? "Cash is the risk to watch: the bank balance covers less than two months of costs."
      : "The basics are registered; the next step is a short list of the risks that could hurt most.",
    shows: [
      `Registration: ${lower(labelOf(REGISTRATION, intake.registration))}.`,
      ...(answer(answers, "s8_detail") ? [`What worries you most: ${lower(optionLabel("s8_detail", answers.s8_detail) ?? "")}.`] : []),
    ],
  });

  const intent = idea ? null : reading({
    area: 1, answers, result, intake, metrics, intakeHealth: "clear",
    intakeFinding: "You have set a goal for the next 12 months; the work is to turn it into three priorities.",
    shows: [`Your goal for the next 12 months: “${intake.goal.replace(/[.\s]+$/, "")}.”`, ...(answer(answers, "s1_detail") ? [`Day to day: ${lower(optionLabel("s1_detail", answers.s1_detail) ?? "")}.`] : [])],
  });

  const extraReadings = [9, 10].filter((area) => statusOf(area, answers)).map((area) => reading({ area, answers, result, intake, metrics, intakeHealth: "clear", intakeFinding: "", shows: [`Your answer: ${lower(optionLabel(`s${area}_status`, answers[`s${area}_status`]) ?? "")}.`] }));

  // ---- Parts ---------------------------------------------------------------------------------
  const parts: ReportPart[] = [];
  const founder = result.founder;
  const style = founder.instinct ? DISC_STYLES[founder.instinct] : undefined;
  const seen = founder.seen ? DISC_STYLES[founder.seen] : undefined;
  const financeSkills = (Array.isArray(answers.f_finance) ? answers.f_finance : []).filter((value) => value in FINANCE_SKILLS).map((value) => FINANCE_SKILLS[value]);
  const typicalMonth = optionLabel("p_revenue", answers.p_revenue);

  parts.push({
    number: 1, title: "Your business today", method: "Business overview",
    finding: idea
      ? `${businessName} is an idea that has not started trading. ${outlineRow(result, 1)?.health === "clear" ? "The basics of a first sale are in place." : "Some basics of a first sale are still open."}`
      : `${businessName} ${MODEL[typeKey]}${answers.p_age ? ` and has traded for ${AGE[String(answers.p_age)]}` : ""}. ${TREND[String(answers.p_trend)] ?? ""}`.trim(),
    health: outlineRow(result, 0)?.health ?? "not_assessed",
    blocks: [
      { kind: "facts", rows: [
        { label: "Business", value: businessName },
        ...(answer(answers, "p_description") ? [{ label: "What it does", value: sentence(String(answers.p_description)) }] : []),
        { label: "Where it sells", value: intake.location },
        { label: "Registration", value: labelOf(REGISTRATION, intake.registration) },
        ...(sector ? [{ label: "Sector", value: optionLabel("p_sector", answers.p_sector) ?? sector }] : []),
        ...(answers.p_age ? [{ label: "Trading for", value: optionLabel("p_age", answers.p_age) ?? "" }] : []),
        ...(answers.p_staff ? [{ label: "People", value: optionLabel("p_staff", answers.p_staff) ?? "" }] : []),
        ...(typicalMonth ? [{ label: "A typical month", value: typicalMonth }] : []),
        { label: "Last month", value: intake.lastMonthRevenue !== null ? `${formatNaira(intake.lastMonthRevenue)} came in` : "Not known" },
        ...(answers.p_trend ? [{ label: "Last 12 months", value: optionLabel("p_trend", answers.p_trend) ?? "" }] : []),
      ] },
      earnsByDeal(intake.products)
        ? { kind: "table", columns: ["What you sell", "Price or fee", ""], widths: [0.42, 0.43, 0.15], rows: products.map((product) => [product.name, chargeText(product), product.top ? "Top earner" : ""]) }
        : { kind: "table", columns: ["What you sell", "Price", ""], widths: [0.6, 0.25, 0.15], rows: products.map((product) => [product.name, chargeText(product), product.top ? "Top earner" : ""]) },
      ...(metrics.revenueVsTypical && metrics.revenueVsTypical !== "within" ? [{ kind: "paragraph" as const, text: `Last month's ${formatNaira(intake.lastMonthRevenue!)} is ${metrics.revenueVsTypical} the typical month you described in the check (${lower(typicalMonth ?? "")}). Use a typical month when you plan.` }] : []),
      { kind: "heading", text: "You and your team" },
      { kind: "facts", rows: [
        { label: "Founder readiness", value: READINESS_LABELS[founder.level] },
        ...(style ? [{ label: "Under pressure", value: `${style.name}. ${style.strength}` }] : []),
        ...(seen ? [{ label: "Others see you as", value: seen.name }] : []),
        ...(style ? [{ label: "Watch for", value: style.watch }] : []),
        ...(answers.f_team ? [{ label: "Who carries it with you", value: TEAM[String(answers.f_team)] ?? "" }] : []),
        ...(answers.f_tough ? [{ label: "The hard calls", value: TOUGH[String(answers.f_tough)] ?? "" }] : []),
        ...(answers.f_hours ? [{ label: "Time on the business", value: HOURS[String(answers.f_hours)] ?? "" }] : []),
        ...(answers.f_finance ? [{ label: "Money skills", value: financeSkills.length ? `You can ${list(financeSkills)}.` : "None of the four basics yet." }] : []),
      ] },
      ...(founder.needsDriver ? [{ kind: "callout" as const, title: "A role without an owner", text: "Nobody reliably makes the hard calls: chasing debts, closing deals, letting someone go. Decide who owns that role, even if it is you on a fixed day each week." }] : []),
    ],
  });

  parts.push(idea ? ideaPart(answers, result, intake) : {
    number: 2, title: "Where it is going", method: "Strategic intent", finding: intent!.finding, health: intent!.health, blocks: [intent!.block],
  });
  parts.push({ number: 3, title: "Your market", method: "Market and industry assessment", finding: market.finding, health: market.health, blocks: [market.block, swot(result, intake, metrics)] });
  const offerModelWorst = HEALTH_RANK[model.health] >= HEALTH_RANK[offer.health] ? model : offer;
  parts.push({
    number: 4, title: "What you sell and how it makes money", method: "Service description and business model", finding: offerModelWorst.finding, health: worst(offer.health, model.health),
    blocks: [
      { kind: "metrics", items: [
        { label: "Gross margin", value: metrics.margin?.text ?? "Not known", note: `Left from each ${metrics.per} after direct costs` },
        { label: "Top three customers", value: labelOf(TOP_CUSTOMER_SHARE, intake.topCustomerShare), note: "Share of your sales" },
        { label: "Your prices", value: labelOf(PRICE_POSITION, intake.pricePosition), note: "Against competitors" },
      ] },
      offer.block, model.block,
      { kind: "heading", text: "Your business model on one page" },
      { kind: "facts", rows: [
        { label: "Best customer", value: sentence(intake.bestCustomer) },
        { label: "What they buy", value: `${list(intake.products.map((product) => product.name))}.` },
        { label: "How they find you", value: sentence(upperFirst(list(intake.channels.map((value) => lower(labelOf(CHANNELS, value)))))) },
        { label: "How you earn", value: `${MODEL[typeKey].charAt(0).toUpperCase()}${MODEL[typeKey].slice(1)}${metrics.margin ? `, keeping about ${metrics.margin.text} of each ${metrics.per} after direct costs` : ""}.` },
        { label: "Biggest cost", value: labelOf(BIGGEST_COST, intake.biggestCost) },
        { label: "Who runs it", value: sentence(intake.roles) },
      ] },
    ],
  });
  parts.push({
    number: 5, title: "How customers find you and buy", method: "Go-to-market", finding: sales.finding, health: sales.health,
    blocks: [
      { kind: "metrics", items: [
        { label: "Enquiries a month", value: labelOf(ENQUIRIES, intake.enquiries), note: "People who ask about buying" },
        { label: "Buy, of every 10", value: intake.conversion !== null ? String(intake.conversion) : "Not known", note: "Your conversion rate" },
        { label: "New customers a month", value: customersText(metrics.newCustomers), note: "Worked out from the two" },
      ] },
      sales.block,
    ],
  });
  parts.push({ number: 6, title: "How the business runs", method: "Operational plan", finding: operations.finding, health: operations.health, blocks: [operations.block] });
  parts.push({
    number: 7, title: "What could go wrong", method: "Risk assessment", finding: risk.finding, health: worst(risk.health, ...extraReadings.map((item) => item.health)),
    blocks: [riskRegister(answers, result, intake, metrics), risk.block, ...extraReadings.map((item) => item.block)],
  });
  parts.push({
    number: 8, title: "The numbers", method: "Financial analysis", finding: finance.finding, health: finance.health,
    blocks: [
      { kind: "metrics", items: [
        { label: "Last month in", value: intake.lastMonthRevenue !== null ? formatNaira(intake.lastMonthRevenue) : "Not known", note: "Revenue, not profit" },
        { label: "Left after costs", value: metrics.result !== null ? `${metrics.result < 0 ? "−" : ""}${formatNaira(Math.abs(metrics.result))}` : "Not known", note: metrics.resultMargin !== null ? `${Math.round(metrics.resultMargin * 100)}% of revenue` : "Revenue minus all costs" },
        { label: "Cash cover", value: coverText(metrics.cover), note: "Weeks of costs your cash would pay" },
      ] },
      finance.block,
    ],
  });

  // ---- Diagnosis -----------------------------------------------------------------------------
  const areaHealth = new Map<number, { health: Health; finding: string }>();
  if (intent) areaHealth.set(1, { health: intent.health, finding: intent.finding });
  if (idea) areaHealth.set(1, { health: outlineRow(result, 1)?.health ?? "watch", finding: parts[1].finding });
  for (const item of [market, offer, model, sales, operations, finance, risk, ...extraReadings]) areaHealth.set(item.area, { health: item.health, finding: item.finding });
  const order = ROOT_ORDER.filter((area) => areaHealth.has(area));
  const mainArea = (result.primaryArea && areaHealth.has(result.primaryArea.area) && areaHealth.get(result.primaryArea.area)!.health !== "clear")
    ? result.primaryArea.area
    : (["stuck", "watch"] as const).map((health) => order.find((area) => areaHealth.get(area)!.health === health)).find((area) => area !== undefined);
  const tally: Record<Health, number> = { clear: 0, watch: 0, stuck: 0 };
  for (const { health } of Array.from(areaHealth.values())) tally[health] += 1;
  if (outlineRow(result, 0)) tally[outlineRow(result, 0)!.health] += 1;
  const stuck = order.filter((area) => areaHealth.get(area)!.health === "stuck").map((area) => AREA_NAMES[area]);
  const watchList = order.filter((area) => areaHealth.get(area)!.health === "watch").map((area) => AREA_NAMES[area]);
  const gap = result.primaryGap;

  parts.push({
    number: 9, title: "The diagnosis", method: "Synthesis",
    finding: mainArea !== undefined ? `The place to start is ${AREA_NAMES[mainArea].toLowerCase()}: ${lower(areaHealth.get(mainArea)!.finding)}` : "No area is stuck or needs watching: the work is to protect what is working and grow from it.",
    health: mainArea !== undefined ? areaHealth.get(mainArea)!.health : "clear",
    blocks: [
      { kind: "table", columns: ["Area", "Where you are", "Finding"], widths: [0.26, 0.14, 0.6], rows: [
        ...(outlineRow(result, 0) ? [[AREA_NAMES[0], healthWord(outlineRow(result, 0)!.health), READINESS_LABELS[founder.level]]] : []),
        ...Array.from(areaHealth.keys()).sort((a, b) => a - b).map((area) => [AREA_NAMES[area], healthWord(areaHealth.get(area)!.health), areaHealth.get(area)!.finding]),
      ] },
      { kind: "paragraph", text: stuck.length || watchList.length
        ? `${stuck.length ? `${list(stuck)} ${stuck.length === 1 ? "is" : "are"} stuck. ` : ""}${watchList.length ? `${list(watchList)} need${watchList.length === 1 ? "s" : ""} watching. ` : ""}These are rarely separate problems. Money and business-model problems usually sit underneath sales, offer and people problems, so the plan starts where the root is, not where the pain is loudest.`
        : "Every area we looked at is clear. The risk for a business in good shape is standing still: keep the routines that got you here and choose the next growth step on purpose." },
      ...(gap ? [{ kind: "callout" as const, title: `The kind of gap: ${GAP_LABELS[gap].name.toLowerCase()}`, text: `${GAP_LABELS[gap].meaning} ${GAP_ADVICE[gap]}` }] : []),
    ],
  });

  // ---- 90-day plan ---------------------------------------------------------------------------
  const moveFor = (area: number): PlanMove => {
    if (idea && area === 1) return { month: "", area: "Your idea", move: IDEA_CONTENT.move, thisWeek: IDEA_CONTENT.thisWeek, watch: IDEA_CONTENT.watch };
    const detail = detailOf(area, answers) ?? fallbackDetail(area, intake, metrics);
    return { month: "", area: AREA_NAMES[area], move: detail.move, thisWeek: detail.thisWeek, watch: AREA_CONTENT[area].watch };
  };
  const planAreas = [
    ...(mainArea !== undefined ? [mainArea] : []),
    ...order.filter((area) => area !== mainArea && areaHealth.get(area)!.health === "stuck"),
    ...order.filter((area) => area !== mainArea && areaHealth.get(area)!.health === "watch"),
  ];
  if (numbersUnknown >= 2 && !planAreas.slice(0, 3).includes(7) && areaHealth.has(7)) planAreas.splice(Math.min(1, planAreas.length), 0, 7);
  const chosen = planAreas.filter((area, index) => planAreas.indexOf(area) === index).slice(0, 3);
  if (!chosen.length) chosen.push(...[5, 2].filter((area) => areaHealth.has(area)).slice(0, 1));
  const months = ["Month 1", "Month 2", "Month 3"];
  const moves = chosen.map((area, index) => ({ ...moveFor(area), month: months[index] }));
  parts.push({
    number: 10, title: "What to fix first: your 90-day plan", method: "Recommendation",
    finding: moves.length ? `${moves.length === 1 ? "One move" : `${["", "One", "Two", "Three"][moves.length]} moves`} over 90 days, starting with ${moves[0].area.toLowerCase()}.` : "Keep doing what works, and review the numbers monthly.",
    blocks: [
      { kind: "table", columns: ["When", "Move", "This week", "Number to watch"], widths: [0.13, 0.37, 0.3, 0.2], rows: moves.map((move) => [move.month, move.move, move.thisWeek, move.watch]) },
      { kind: "paragraph", text: `Your goal for the year, in your words: “${intake.goal.replace(/[.\s]+$/, "")}.” Check each month whether these moves are bringing it closer, and drop anything that is not.` },
    ],
  });

  // ---- How we can help -----------------------------------------------------------------------
  parts.push({
    number: 11, title: "How we can help", method: "Services that fit",
    finding: result.offerings.length ? "If you want support with the plan, these are the services that fit what you told us." : "If you want support with the plan, start with a free 20-minute call.",
    blocks: [
      ...(result.offerings.length ? [{ kind: "table" as const, columns: ["Service", "What it does"], widths: [0.38, 0.62], rows: result.offerings.map((offering) => [offering.name, offering.summary]) }] : []),
      { kind: "callout", title: `${CURRENT_STATE.name} · ${formatNaira(PRICES.currentState)}`, text: `${CURRENT_STATE.what} ${CURRENT_STATE.start} It starts with a free 20-minute call, where we tell you honestly whether we can help.` },
    ],
  });

  // ---- One-page answer -----------------------------------------------------------------------
  const position = idea
    ? `${businessName} is an idea not yet trading. Of the ${areaHealth.size + (outlineRow(result, 0) ? 1 : 0)} areas we looked at, ${tallyText(tally)}.`
    : `${businessName} ${MODEL[typeKey]}${answers.p_age ? ` and has traded for ${AGE[String(answers.p_age)]}` : ""}. Of the ${areaHealth.size + (outlineRow(result, 0) ? 1 : 0)} areas we looked at, ${tallyText(tally)}.`;

  return {
    version: REPORT_VERSION,
    reference: input.reference,
    date: reportDate(input.date),
    ownerName: input.contact.fullName.trim(),
    businessName,
    descriptor,
    onePage: {
      position,
      fixFirst: mainArea !== undefined ? { area: AREA_NAMES[mainArea], finding: areaHealth.get(mainArea)!.finding } : { area: "Growth", finding: "Every area we looked at is clear: protect what works and choose the next growth step on purpose." },
      moves,
      watch: mainArea !== undefined ? (idea && mainArea === 1 ? IDEA_CONTENT.watch : AREA_CONTENT[mainArea].watch) : "Monthly sales against your goal",
      keyNumbers: parts[7].blocks[0].kind === "metrics" ? [
        ...parts[7].blocks[0].items.slice(0, 2),
        { label: "Gross margin", value: metrics.margin?.text ?? "Not known", note: `Left from each ${metrics.per} after direct costs` },
        parts[7].blocks[0].items[2],
      ] : [],
      tally,
    },
    parts,
    appendix: appendix(answers, intake),
    method: `Built by The Shift's fixed rules from the business check you took and the Report Intake you completed. The same answers always give the same report. It reflects what you told us on ${reportDate(input.date)}. It is not an audit, a valuation, or financial, legal or tax advice.`,
  };

  function healthWord(health: Health) {
    return health === "clear" ? "Clear" : health === "watch" ? "Watch" : "Stuck";
  }
  function tallyText(counts: Record<Health, number>) {
    const phrases = [counts.clear && `${counts.clear} ${counts.clear === 1 ? "is" : "are"} clear`, counts.watch && `${counts.watch} need${counts.watch === 1 ? "s" : ""} watching`, counts.stuck && `${counts.stuck} ${counts.stuck === 1 ? "is" : "are"} stuck`].filter(Boolean) as string[];
    return list(phrases);
  }
}

const GAP_ADVICE: Record<string, string> = {
  clarity: "So the first job is to see the problem clearly, with numbers, before spending on a fix.",
  strategy: "So the first job is to choose, and to stop the options that were not chosen.",
  knowhow: "So the first job is to learn the method, then apply it to one part of the business at a time.",
  resources: "So the first job is to free up time and cash, and to sequence the plan so early steps pay for later ones.",
};

function ideaPart(answers: Answers, result: CheckResult, intake: ReportIntake): ReportPart {
  const row = outlineRow(result, 1);
  const readings = (["i_customer", "i_offer", "i_tested", "i_need"] as const)
    .map((id) => (answer(answers, id) ? IDEA_READINGS[id][String(answers[id])] : undefined))
    .filter((text): text is string => Boolean(text));
  return {
    number: 2, title: "Where it is going", method: "Strategic intent", health: row?.health ?? "not_assessed",
    finding: row?.health === "clear" ? "The basics of a first sale are in place: a first customer, a first offer and some proof." : "Before money is committed, the idea needs a named first customer, one offer with a price, and proof that someone will pay.",
    blocks: [{
      kind: "reading", area: "Your idea", health: row?.health ?? "not_assessed", theirWords: row?.answer ? `“${row.answer}”` : "From your answers",
      shows: [`Your goal for the next 12 months: “${intake.goal.replace(/[.\s]+$/, "")}.”`],
      meaning: readings, good: IDEA_CONTENT.good, move: IDEA_CONTENT.move, thisWeek: IDEA_CONTENT.thisWeek, watch: IDEA_CONTENT.watch,
    }],
  };
}

/** Strengths, weaknesses, opportunities and threats, chosen by rule from the answers. */
function swot(result: CheckResult, intake: ReportIntake, metrics: ReportMetrics): ReportBlock {
  const style = result.founder.instinct ? DISC_STYLES[result.founder.instinct] : undefined;
  const strengths = [
    ...result.outline.filter((row) => row.health === "clear" && row.area !== 0).map((row) => `${row.name} is clear`),
    ...(metrics.margin?.health === "clear" ? [`A healthy gross margin (${metrics.margin.text})`] : []),
    ...(intake.repeat === "monthly" ? ["Customers come back every month"] : []),
    ...(intake.conversion !== null && intake.conversion >= 5 ? [`${intake.conversion} of every 10 enquiries buy`] : []),
    ...(intake.competitors.length ? ["You can name your competitors"] : []),
    ...(intake.topCustomerShare === "under_20" ? ["Sales spread across many customers"] : []),
    ...(style ? [`A founder who leads as ${/^[aeiou]/i.test(style.name) ? "an" : "a"} ${style.name.toLowerCase()}`] : []),
  ].slice(0, 4);
  const weaknesses = [
    ...result.outline.filter((row) => row.health === "stuck" && row.area !== 0).map((row) => `${row.name} is stuck`),
    ...(metrics.margin?.health === "stuck" ? [`A thin gross margin (${metrics.margin.text})`] : []),
    ...(!intake.competitors.length ? ["Competitors not yet known"] : []),
  ].slice(0, 4);
  const opportunities = [
    ...(intake.conversion !== null && intake.conversion <= 5 ? ["Turning more enquiries into sales"] : []),
    ...(intake.repeat === "few" || intake.repeat === "once" || intake.repeat === "occasionally" ? ["More repeat business from existing customers"] : []),
    ...(intake.pricePosition === "lower" ? ["Room to move prices closer to competitors"] : []),
    ...(intake.channels.length <= 2 ? ["A new channel to reach customers like your best ones"] : []),
  ].slice(0, 4);
  const threats = [
    ...(intake.topCustomerShare === "over_50" ? ["Losing one of your three biggest customers"] : []),
    ...(metrics.coverMid !== null && metrics.coverMid < 8 ? ["A bad month with little cash to absorb it"] : []),
    ...(intake.registration === "not_registered" || intake.registration === "not_sure" ? ["Penalties from unregistered trading"] : []),
    ...(intake.pricePosition === "higher" ? ["Cheaper competitors winning price-sensitive customers"] : []),
  ].slice(0, 4);
  const none = "Nothing stood out in your answers";
  const rows = [
    ["Strengths", strengths.length ? strengths.join(". ") + "." : none],
    ["Weaknesses", weaknesses.length ? weaknesses.join(". ") + "." : none],
    ["Opportunities", opportunities.length ? opportunities.join(". ") + "." : none],
    ["Threats", threats.length ? threats.join(". ") + "." : none],
  ];
  return { kind: "table", columns: ["Your position at a glance", ""], widths: [0.24, 0.76], rows };
}

/** The risks the answers point to, worst first, each with a first control. */
function riskRegister(answers: Answers, result: CheckResult, intake: ReportIntake, metrics: ReportMetrics): ReportBlock {
  type Risk = { risk: string; likelihood: number; impact: number; control: string };
  const risks: Risk[] = [];
  if (metrics.coverMid !== null && metrics.coverMid < 8) risks.push({ risk: "Cash runs out in a bad month", likelihood: metrics.coverMid < 4 ? 3 : 2, impact: 3, control: "A 13-week cash forecast, updated every Monday." });
  if (metrics.result !== null && metrics.result < 0) risks.push({ risk: "Costs keep running ahead of sales", likelihood: 3, impact: 3, control: "Cut or delay one cost line this month and reprice the lowest-margin product." });
  if (intake.topCustomerShare === "over_50" || answers.s4_detail === "concentration") risks.push({ risk: "Losing a big customer", likelihood: 2, impact: 3, control: "Written agreements with the top customers, and a target for new ones." });
  if (intake.registration === "not_registered" || intake.registration === "not_sure" || answers.s8_detail === "tax") risks.push({ risk: "Tax or registration penalties", likelihood: intake.registration === "not_registered" ? 3 : 2, impact: 2, control: "Register with CAC and get a tax identification number; diarise filing dates." });
  if (answers.s6_status === "only_me" || answers.f_team === "solo" || answers.s8_detail === "key_person") risks.push({ risk: "The business stops without you or a key person", likelihood: 2, impact: 3, control: "Write down the key tasks and train a second person on each." });
  if ((metrics.owedMonths ?? 0) >= 1 || answers.s7_detail === "late_payers") risks.push({ risk: "Customers pay late or not at all", likelihood: 2, impact: 2, control: "Written payment terms, same-day invoices and a weekly chase list." });
  if (answers.s7_detail === "mixed_money") risks.push({ risk: "Personal and business money mixed", likelihood: 3, impact: 2, control: "A separate business account and a fixed monthly pay for you." });
  if (answers.s8_detail === "insurance") risks.push({ risk: "Stock or equipment lost to fire, theft or flood", likelihood: 1, impact: 3, control: "Insure stock and equipment; keep records backed up off-site." });
  if (answers.s8_detail === "contracts") risks.push({ risk: "Disputes with customers or suppliers", likelihood: 2, impact: 2, control: "A one-page written agreement with every major customer and supplier." });
  if (intake.loans === "over_10m" || (intake.loans === "1m_10m" && metrics.result !== null && metrics.result < 0)) risks.push({ risk: "Loan repayments the business cannot carry", likelihood: 2, impact: 3, control: "A repayment schedule set against the cash forecast; talk to the lender early." });
  const level = (value: number) => (value >= 3 ? "High" : value === 2 ? "Medium" : "Low");
  const sorted = risks.sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact).slice(0, 6);
  return sorted.length
    ? { kind: "table", columns: ["Risk", "Likelihood", "Impact", "First control"], widths: [0.3, 0.14, 0.12, 0.44], rows: sorted.map((item) => [item.risk, level(item.likelihood), level(item.impact), item.control]) }
    : { kind: "paragraph", text: "Your answers did not point to a pressing risk. Keep a short list of the five things that could hurt the business most, and review it once a year." };
}

function appendix(answers: Answers, intake: ReportIntake): FullReport["appendix"] {
  const check: { question: string; answer: string }[] = [];
  for (const section of Object.values(SECTIONS)) {
    for (const question of section.questions) {
      const value = answers[question.id];
      if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
      const text = question.kind === "text" ? String(value) : optionLabel(question.id, value) ?? String(value);
      check.push({ question: question.prompt, answer: text });
    }
  }
  const intakeAnswers: Record<string, string> = {
    location: intake.location,
    registration: labelOf(REGISTRATION, intake.registration),
    products: intake.products.map((product) => `${product.name}${chargeText(product) !== "Varies" ? ` (${chargeText(product)})` : ""}`).join("; "),
    bestCustomer: intake.bestCustomer,
    competitors: intake.competitors.length ? intake.competitors.join("; ") : "None named",
    pricePosition: labelOf(PRICE_POSITION, intake.pricePosition),
    topEarner: intake.topEarner !== null ? intake.products[intake.topEarner]?.name ?? "" : "Not sure",
    costShare: intake.marginPercent != null ? `A margin of ${formatPercent(intake.marginPercent)}` : labelOf(COST_SHARE, intake.costShare),
    topCustomerShare: labelOf(TOP_CUSTOMER_SHARE, intake.topCustomerShare),
    channels: intake.channels.map((value) => labelOf(CHANNELS, value)).join("; "),
    enquiries: `${labelOf(ENQUIRIES, intake.enquiries)}; ${intake.conversion !== null ? `${intake.conversion} of every 10 buy` : "not sure how many buy"}`,
    repeat: labelOf(REPEAT, intake.repeat),
    roles: intake.roles,
    tools: intake.tools.map((value) => labelOf(TOOLS, value)).join("; "),
    lastMonthRevenue: `In: ${intake.lastMonthRevenue !== null ? formatNaira(intake.lastMonthRevenue) : "not sure"}; costs: ${intake.monthlyCosts !== null ? formatNaira(intake.monthlyCosts) : "not sure"}; biggest cost: ${labelOf(BIGGEST_COST, intake.biggestCost)}`,
    cash: `Cash: ${labelOf(CASH, intake.cash)}; owed to you: ${labelOf(OWED, intake.owed)}; loans: ${labelOf(LOANS, intake.loans)}`,
    goal: intake.goal,
  };
  return [
    { title: "Your business check", rows: check },
    { title: "Your Report Intake", rows: INTAKE_QUESTIONS.map((question) => ({ question: intakeWording(question, earnsByDeal(intake.products)).prompt, answer: intakeAnswers[question.id] })) },
  ];
}
