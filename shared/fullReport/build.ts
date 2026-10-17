import { DISC_STYLES, READINESS_LABELS, sectorOf, type AreaRead, type CheckResult } from "../businessCheck/engine";
import { SECTOR_NOUNS } from "../businessCheck/sectorExamples";
import { AREA_NAMES, GAP_LABELS, SECTIONS, type Answers, type Health } from "../businessCheck/questions";
import { BRAND } from "../brand";
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

/**
 * 2: products can be charged as a percentage of the deal, and the owner can type their margin.
 * 3: the consulting layout: a scorecard, key takeaways and what they mean, benchmark bars, the month's cash
 * waterfall, a risk matrix and the 90-day plan as a timeline.
 * 4: the strategic plan: the structure of IP Factory's partner-written plans (ET, 14 October 2026). A Background, then
 * Sections One to Nine, each with an overview, a scope, numbered subsections and numbered Recommendations; the
 * arithmetic of the owner's 12-month target; a 12-month work plan in three phases with a gate; outstanding items.
 */
export const REPORT_VERSION = 4;

export type ReportHealth = Health | "not_assessed";

export type ReportBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "facts"; rows: { label: string; value: string }[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "metrics"; items: { label: string; value: string; note: string }[] }
  | { kind: "table"; columns: string[]; rows: string[][]; widths?: number[] }
  /** `code` numbers the reading's First move as a Recommendation ("4.2") once it is placed in a section. */
  | { kind: "reading"; area: string; health: ReportHealth; theirWords: string; shows: string[]; meaning: string[]; good: string; move: string; thisWeek: string; watch: string; code?: string }
  /** A numbered subsection heading: "1.2 The four money basics". */
  | { kind: "subsection"; code: string; title: string }
  /** A numbered Recommendation in a tinted box: one or more short paragraphs. */
  | { kind: "recommendation"; code: string; lines: string[] }
  /** A numbered list under an optional small-capitals title. */
  | { kind: "numbered"; title?: string; items: string[] }
  /** Today to the target in naira: totals at each end, the levers as steps between them. */
  | { kind: "bridge"; steps: { label: string; amount: number; display: string; total?: boolean }[] }
  | { kind: "callout"; title: string; text: string }
  /** The heat map: every area we looked at, its health and the finding in one line. */
  | { kind: "scorecard"; rows: ScoreRow[] }
  /** Numbered points, each a bold headline and a line under it. */
  | { kind: "takeaways"; title: string; items: { headline: string; detail: string; health?: ReportHealth }[] }
  /** Bullet bars: the owner's number against the thresholds the rules use, coloured stuck, watch and clear. */
  | { kind: "benchmarks"; items: Benchmark[] }
  /** The month in naira: money in, costs out, what is left. */
  | { kind: "waterfall"; steps: { label: string; amount: number; display: string }[] }
  /** Likelihood against impact, each risk a numbered dot that matches the register's numbering. */
  | { kind: "riskMatrix"; risks: { number: number; risk: string; likelihood: number; impact: number }[] }
  | { kind: "timeline"; moves: PlanMove[] };

export type ScoreRow = { area: string; health: ReportHealth; finding: string };

/** A scale from min to max cut into coloured zones; `value` is clamped to the scale when drawn. */
export type Benchmark = {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  zones: { to: number; health: Health }[];
  /** What good looks like, in words, printed under the bar. */
  target: string;
  health: Health;
};

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

/** One of the plan's nine sections, in the order of IP Factory's strategic plans. */
export type ReportSection = {
  number: number;
  title: string;
  /** The finding, as the section's opening line. */
  standfirst: string;
  health?: ReportHealth;
  overview: string;
  scope: string[];
  blocks: ReportBlock[];
};

/** Where the business stands and the question the plan answers, before Section One. */
export type ReportBackground = {
  overview: string;
  engagement: string[];
  position: { label: string; figure: string; meaning: string }[];
  facts: { headline: string; detail: string }[];
  /** Absent when there is no 12-month target to work towards. */
  question?: { text: string[]; levers: { lever: string; factor: string; fromTo: string; difficulty: string }[]; bridge?: Extract<ReportBlock, { kind: "bridge" }> };
  headline: string[];
};

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
    scorecard: ScoreRow[];
    takeaways: { headline: string; detail: string; health?: Health }[];
    implications: string[];
    benchmarks: Benchmark[];
  };
  background: ReportBackground;
  sections: ReportSection[];
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
  return { block, health, finding, area, notes: input.notes ?? [] };
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
/** The money basics as things to practise, for the Recommendation that closes them. */
const BASIC_PRACTICE: Record<string, string> = { pl: "reading a profit and loss statement", cash: "telling profit from cash", unit: "working out a unit cost", margin: "knowing your margin" };
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

  const bench = benchmarks(intake, metrics, { cover: coverHealth, result: deficit ? "stuck" : thinResult ? "watch" : "clear", owed: (metrics.owedMonths ?? 0) >= 1 ? "watch" : "clear", conversion: lowConversion ? "watch" : "clear" });

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
      ...benchmarkBlock(bench.filter((item) => item.label === "Gross margin")),
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
      ...benchmarkBlock(bench.filter((item) => item.label === "Enquiries that buy")),
      sales.block,
    ],
  });
  parts.push({ number: 6, title: "How the business runs", method: "Operational plan", finding: operations.finding, health: operations.health, blocks: [operations.block] });
  parts.push({
    number: 7, title: "What could go wrong", method: "Risk assessment", finding: risk.finding, health: worst(risk.health, ...extraReadings.map((item) => item.health)),
    blocks: [...riskRegister(answers, result, intake, metrics), risk.block, ...extraReadings.map((item) => item.block)],
  });
  parts.push({
    number: 8, title: "The numbers", method: "Financial analysis", finding: finance.finding, health: finance.health,
    blocks: [
      { kind: "metrics", items: [
        { label: "Last month in", value: intake.lastMonthRevenue !== null ? formatNaira(intake.lastMonthRevenue) : "Not known", note: "Revenue, not profit" },
        { label: "Left after costs", value: metrics.result !== null ? `${metrics.result < 0 ? "−" : ""}${formatNaira(Math.abs(metrics.result))}` : "Not known", note: metrics.resultMargin !== null ? `${Math.round(metrics.resultMargin * 100)}% of revenue` : "Revenue minus all costs" },
        { label: "Cash cover", value: coverText(metrics.cover), note: "Weeks of costs your cash would pay" },
      ] },
      ...(metrics.revenue !== null && metrics.costs !== null && metrics.result !== null ? [{ kind: "heading" as const, text: "Last month in naira" }, { kind: "waterfall" as const, steps: [
        { label: "Money in", amount: metrics.revenue, display: formatNaira(metrics.revenue) },
        { label: "Costs", amount: -metrics.costs, display: `−${formatNaira(metrics.costs)}` },
        { label: metrics.result < 0 ? "Shortfall" : "Left over", amount: metrics.result, display: `${metrics.result < 0 ? "−" : ""}${formatNaira(Math.abs(metrics.result))}` },
      ] }] : []),
      ...benchmarkBlock(bench.filter((item) => ["Cash cover", "Left after costs", "Owed to you"].includes(item.label))),
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
  const scorecard: ScoreRow[] = [
    ...(outlineRow(result, 0) ? [{ area: AREA_NAMES[0], health: outlineRow(result, 0)!.health, finding: READINESS_LABELS[founder.level] }] : []),
    ...Array.from(areaHealth.keys()).sort((a, b) => a - b).map((area) => ({ area: AREA_NAMES[area], health: areaHealth.get(area)!.health, finding: areaHealth.get(area)!.finding })),
  ];

  parts.push({
    number: 9, title: "The diagnosis", method: "Synthesis",
    finding: mainArea !== undefined ? `The place to start is ${AREA_NAMES[mainArea].toLowerCase()}: ${lower(areaHealth.get(mainArea)!.finding)}` : "No area is stuck or needs watching: the work is to protect what is working and grow from it.",
    health: mainArea !== undefined ? areaHealth.get(mainArea)!.health : "clear",
    blocks: [
      { kind: "scorecard", rows: scorecard },
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
      { kind: "timeline", moves },
      { kind: "paragraph", text: `Your goal for the year, in your words: “${intake.goal.replace(/[.\s]+$/, "")}.” Check each month whether these moves are bringing it closer, and drop anything that is not.` },
    ],
  });

  // ---- How we can help -----------------------------------------------------------------------
  parts.push({
    number: 11, title: "How we can help", method: "Services that fit",
    finding: result.offerings.length ? "If you want support with the plan, these are the services that fit what you told us." : "If you want support with the plan, start with a free Discovery Call.",
    blocks: [
      ...(result.offerings.length ? [{ kind: "table" as const, columns: ["Service", "What it does"], widths: [0.38, 0.62], rows: result.offerings.map((offering) => [offering.name, offering.summary]) }] : []),
      { kind: "callout", title: `${CURRENT_STATE.name} · ${formatNaira(PRICES.currentState)}`, text: `${CURRENT_STATE.what} ${CURRENT_STATE.start} It starts with a free Discovery Call, where we tell you honestly whether we can help.` },
    ],
  });

  // ---- The strategic plan: Background and Sections One to Nine ----------------------------
  // The parts above are the building material; the plan below arranges them in the order of IP Factory's
  // partner-written strategic plans, numbers every Recommendation and adds the target, the phases and the gaps.
  const recCodes = new Map<number, string>();
  const section = (number: number) => {
    let sub = 0;
    let rec = 0;
    return {
      sub: (title: string): ReportBlock => ({ kind: "subsection", code: `${number}.${++sub}`, title }),
      rec: (lines: string[]): ReportBlock => ({ kind: "recommendation", code: `${number}.${++rec}`, lines }),
      read: (item: { block: Reading; area: number }): ReportBlock => {
        const code = `${number}.${++rec}`;
        recCodes.set(item.area, code);
        return { ...item.block, code };
      },
    };
  };
  const partBlocks = (number: number) => parts.find((part) => part.number === number)!.blocks;
  const metricsOf = (number: number) => partBlocks(number).find((block) => block.kind === "metrics");
  const revenue = intake.lastMonthRevenue;
  const target = intake.revenueTarget ?? null;
  const productsTable = partBlocks(1).find((block) => block.kind === "table")!;

  // The arithmetic of the target: today's sales to the 12-month figure, as price, conversion and reach.
  const question: ReportBackground["question"] = (() => {
    if (target === null || revenue === null || revenue <= 0 || idea) return undefined;
    const factor = target / revenue;
    if (factor <= 1) return { text: [`Your target of ${money(target)} a month is at or below last month's ${money(revenue)}. The work is to hold that level while fixing the areas this plan names, not to chase growth.`], levers: [] };
    const priceLift = intake.pricePosition === "lower" ? 1.15 : intake.pricePosition === "same" ? 1.1 : intake.pricePosition === "not_sure" ? 1.05 : 1;
    const conversion = intake.conversion;
    const convLift = conversion !== null && conversion > 0 && conversion < 5 ? Math.min((Math.min(conversion + 2, 5)) / conversion, 2) : 1;
    const reach = factor / (priceLift * convLift);
    const times = (value: number) => `×${value >= 10 ? value.toFixed(0) : value < 2 ? String(Number(value.toFixed(2))) : value.toFixed(1)}`;
    const levers = [
      { lever: "Price", factor: times(priceLift), fromTo: priceLift > 1 ? `Prices up about ${Math.round((priceLift - 1) * 100)}%, ${intake.pricePosition === "lower" ? "from below competitors to level with them" : intake.pricePosition === "same" ? "with the offer made worth it" : "once you know where you stand"}` : "Hold your prices: you already charge more than competitors", difficulty: priceLift > 1 ? "A decision" : "Holding is the work" },
      { lever: "Conversion", factor: times(convLift), fromTo: convLift > 1 ? `From ${conversion} to ${Math.min(conversion! + 2, 5)} of every 10 people who ask` : conversion === null ? "Not known yet: count enquiries and sales for a month" : "Already strong: keep the follow-up", difficulty: convLift > 1 ? "Achievable with follow-up" : "Keep it" },
      { lever: "Reach and capacity", factor: times(Math.max(reach, 1)), fromTo: reach > 1 ? "More customers reached, and the people and stock to serve them" : "Not needed: price and conversion close the gap", difficulty: reach > 2 ? "The hard one" : reach > 1 ? "Planned growth" : "None" },
    ];
    const round = (value: number) => Math.round(value / 1000) * 1000;
    const steps = [
      { label: "Today", amount: round(revenue), total: true },
      ...(priceLift > 1 ? [{ label: "Price", amount: round(revenue * (priceLift - 1)) }] : []),
      ...(convLift > 1 ? [{ label: "Conversion", amount: round(revenue * priceLift * (convLift - 1)) }] : []),
      ...(reach > 1 ? [{ label: "Reach", amount: round(target - revenue * priceLift * convLift) }] : []),
      { label: "Target", amount: round(target), total: true },
    ].map((step) => ({ ...step, display: `${step.total ? "" : "+"}${money(step.amount)}` }));
    return {
      text: [
        `The gap from ${money(revenue)} a month to the ${money(target)} you want is a factor of about ${factor.toFixed(1)}. It is less frightening broken into three ordinary parts.`,
        reach > 2 ? "Most of the gap is reach: more customers and the capacity to serve them. That is where the plan has to be strongest." : reach > 1 ? "Price and conversion carry much of it; the rest is planned growth in reach." : "Price and conversion alone would close the gap, which makes this a plan about decisions rather than expansion.",
      ],
      levers,
      bridge: { kind: "bridge", steps },
    };
  })();

  // The work plan: twelve months, three phases, numbered actions with an owner and a month.
  const phaseTwoAreas = planAreas.filter((area, index) => planAreas.indexOf(area) === index && !chosen.includes(area)).slice(0, 4);
  // Area names can contain "and", so lists of them keep their capitals and an Oxford comma.
  const areaList = (areas: number[]) => {
    const names = areas.map((area) => (idea && area === 1 ? "Your idea" : AREA_NAMES[area]));
    return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  };
  const firstFocus = chosen.length ? areaList(chosen) : "the weekly numbers";
  const phases = [
    { phase: "Phase One: Build", months: "1 to 3", goal: `Fix the root: ${firstFocus}, and start the weekly numbers. No growth target.` },
    { phase: "Phase Two: Execute", months: "4 to 9", goal: phaseTwoAreas.length ? `Work through ${areaList(phaseTwoAreas)}; move towards your goal.` : "Grow from the base: the next step, chosen on purpose." },
    { phase: "Phase Three: Consolidate", months: "10 to 12", goal: "Hold the gains, and make the business depend less on you." },
  ];
  const gateMeasure = moves[0]?.watch ? lower(moves[0].watch) : "the first measure";

  // What the plan still needs from the owner: every "I'm not sure", in the order it matters.
  const needs: [string, string][] = [
    ...(revenue === null ? [["Last month's money in", "Every figure in Section Six depends on it."] as [string, string]] : []),
    ...(intake.monthlyCosts === null ? [["Last month's running costs", "Without them the plan cannot tell profit from loss."] as [string, string]] : []),
    ...(intake.cash === "not_sure" ? [["Cash in the bank today", "Cash cover is the number that ends businesses that look profitable on paper."] as [string, string]] : []),
    ...(intake.costShare === "not_sure" && intake.marginPercent === null ? [["How much of each ₦100 goes on direct costs", "Pricing and the business model in Section Four rest on it."] as [string, string]] : []),
    ...(target === null && !idea ? [["The monthly sales you want in 12 months", "It turns your goal into a number this plan can be measured against."] as [string, string]] : []),
    ...(intake.conversion === null ? [["How many of every 10 people who ask go on to buy", "It shows whether sales are lost before or after people ask."] as [string, string]] : []),
    ...(intake.enquiries === "not_sure" ? [["How many people ask about buying each month", "Section Five's demand numbers start here."] as [string, string]] : []),
    ...(intake.topEarner === null ? [["Which product or service earns the most", "The offer should be built around a clear winner."] as [string, string]] : []),
    ...(intake.competitors.length === 0 ? [["Up to three competitors, by name", "You cannot price against a competitor you cannot name."] as [string, string]] : []),
    ...(intake.pricePosition === "not_sure" ? [["Where your prices sit against theirs", "The price lever in the Background depends on it."] as [string, string]] : []),
    ...(intake.topCustomerShare === "not_sure" ? [["How much of your sales come from your three biggest customers", "Dependence on a few customers is a risk Section Seven cannot size without it."] as [string, string]] : []),
    ...(intake.owed === "not_sure" ? [["Money customers owe you", "Collecting it is the cheapest money the business can raise."] as [string, string]] : []),
    ...(intake.loans === "not_sure" ? [["Loans and what they cost each month", "Repayments come before growth."] as [string, string]] : []),
    ...(intake.registration === "not_sure" ? [["How the business is registered", "It decides which contracts, loans and tax rules apply."] as [string, string]] : []),
    ...(intake.repeat === "not_sure" ? [["Whether customers come back", "Repeat business is the cheapest growth there is."] as [string, string]] : []),
    ...(!founder.instinct ? [["The behaviour questions in the Business Check", "Section One is left open without them."] as [string, string]] : []),
  ];
  const openRecord = [market, offer, model, sales, operations, finance, risk, ...extraReadings].flatMap((item) => item.notes);

  // Section One: the founder.
  const s1 = section(1);
  const missingBasics = Object.keys(FINANCE_SKILLS).filter((key) => !(Array.isArray(answers.f_finance) && (answers.f_finance as string[]).includes(key)));
  const sectionOne: ReportSection = {
    number: 1, title: "Founder readiness",
    standfirst: `${READINESS_LABELS[founder.level]}. No business outgrows the person running it.`,
    health: outlineRow(result, 0)?.health ?? "not_assessed",
    overview: "This section asks whether you are equipped for the business this plan describes, and names the gaps to close first. It is built from your answers about yourself in the Business Check.",
    scope: ["Your behavioural profile.", "The four money basics.", "Time, the hard calls and who carries the business with you."],
    blocks: [
      s1.sub("Your behavioural profile"),
      ...(style ? [
        { kind: "facts" as const, rows: [{ label: "Under pressure", value: `${style.name}. ${style.strength}` }, ...(seen ? [{ label: "Others see you as", value: `${seen.name}. ${seen.strength}` }] : []), { label: "Watch for", value: style.watch }] },
        { kind: "numbered" as const, title: "Why it matters now", items: ["On your own, behaviour is a matter of style. With a team, it becomes how the business runs.", ...(seen && seen.name !== style.name ? [`You see yourself as a ${style.name.toLowerCase()} and others see a ${seen.name.toLowerCase()}. Ask two people who work with you which is right: the gap is where misunderstandings start.`] : []), `Your watch-out is a pattern, not a flaw: ${lower(style.watch)} Name it, then design around it.`] },
      ] : [{ kind: "paragraph" as const, text: "You did not complete the behaviour questions in the Business Check, so this part is left open rather than guessed at. Section Nine lists it." }]),
      ...(Array.isArray(answers.f_finance) ? [
        s1.sub("The four money basics"),
        { kind: "table" as const, columns: ["The basic", "Today", "Weight in this plan"], widths: [0.5, 0.2, 0.3], rows: Object.entries(FINANCE_SKILLS).map(([key, skill]) => [upperFirst(skill), (answers.f_finance as string[]).includes(key) ? "Yes" : "Not yet", key === "pl" ? "High" : "Critical"]) },
        ...(missingBasics.length ? [s1.rec([`Use your own numbers as the classroom. One hour in the first week of each month: work out last month's margin and cash, change one price or cost on paper, and watch what moves. Three months of that will cover most of what is missing: ${list(missingBasics.map((key) => BASIC_PRACTICE[key]))}.`])] : []),
      ] : []),
      s1.sub("Time, the hard calls and the bottleneck"),
      { kind: "facts", rows: [
        ...(answers.f_team ? [{ label: "Who carries it with you", value: TEAM[String(answers.f_team)] ?? "" }] : []),
        ...(answers.f_tough ? [{ label: "The hard calls", value: TOUGH[String(answers.f_tough)] ?? "" }] : []),
        ...(answers.f_hours ? [{ label: "Time on the business", value: HOURS[String(answers.f_hours)] ?? "" }] : []),
        { label: "Readiness", value: READINESS_LABELS[founder.level] },
      ] },
      ...(founder.needsDriver ? [s1.rec(["Decide who owns the hard calls: chasing debts, closing deals, letting someone go. If it is you, give them a fixed slot each week rather than waiting until they cannot be avoided."])] : []),
      ...(answers.f_hours === "lt2" ? [s1.rec(["Protect two hours a week to work on the business rather than in it: the same day, the same time, phone away. Every action in Section Eight needs them."])] : []),
      ...(idea ? [] : [s1.rec(["Before your next hire, write down five decisions you will keep and five you will hand over. Hiring removes work from your hands only if the decision moves with it."])]),
    ],
  };

  // Section Two: strategic intent.
  const s2 = section(2);
  const sectionTwo: ReportSection = {
    number: 2, title: "Strategic intent", standfirst: parts[1].finding, health: parts[1].health,
    overview: "Strategic intent is not a sentence for a website. It is a rule that lets you say no to things that look like opportunities, and it is tested by what it makes you refuse.",
    scope: ["Your goal and its horizon.", "What your answers say about direction.", "The order of priorities across twelve months."],
    blocks: [
      s2.sub("Your goal"),
      { kind: "paragraph", text: `In your words: “${intake.goal.replace(/[.\s]+$/, "")}.”` },
      ...(target !== null && revenue !== null ? [{ kind: "facts" as const, rows: [{ label: "Monthly sales wanted", value: formatNaira(target) }, { label: "Last month", value: formatNaira(revenue) }, { label: "The gap", value: target > revenue ? `About ×${(target / revenue).toFixed(1)}: the Background breaks it down` : "None: the work is to hold it" }] }] : []),
      s2.rec(["State the goal in two parts: the long ambition, which is yours and not ours to moderate, and a twelve-month definition of arrival that can be tested: a monthly sales figure, a margin, and the hours you work."]),
      s2.sub("What your answers say"),
      ...(intent ? [s2.read(intent)] : partBlocks(2)),
      s2.sub("The order of priorities"),
      { kind: "paragraph", text: "One goal per phase, not three. The most common failure is not a bad plan but five good plans running at once, none of them finished." },
      { kind: "table", columns: ["Months", "The single goal"], widths: [0.2, 0.8], rows: phases.map((phase) => [phase.months, phase.goal]) },
    ],
  };

  // Section Three: the market.
  const s3 = section(3);
  const sectionThree: ReportSection = {
    number: 3, title: "Market and industry", standfirst: market.finding, health: market.health,
    overview: "This section tests whether the ground will carry the plan: who buys, who else sells to them, and where your prices sit.",
    scope: ["Your best customer and your competitors.", "Where your prices sit.", "Your position at a glance."],
    blocks: [s3.read(market), s3.sub("Your position at a glance"), partBlocks(3)[1]],
  };

  // Section Four: what you sell.
  const s4 = section(4);
  const sectionFour: ReportSection = {
    number: 4, title: "Offer and proposition", standfirst: (HEALTH_RANK[model.health] >= HEALTH_RANK[offer.health] ? model : offer).finding, health: worst(offer.health, model.health),
    overview: "What you sell, at what price, and how much of each sale the business keeps. The offer is what persuades a customer to choose you; the model is whether that choice makes money.",
    scope: ["What you sell and how you charge.", "What each sale leaves behind.", "The offer and the business model."],
    blocks: [
      s4.sub("What you sell"),
      productsTable,
      ...partBlocks(4).filter((block) => block.kind === "metrics" || block.kind === "benchmarks"),
      s4.sub("The offer"), s4.read(offer),
      s4.sub("How it makes money"), s4.read(model),
      s4.sub("Your business model on one page"),
      partBlocks(4).find((block) => block.kind === "facts")!,
    ],
  };

  // Section Five: the operational plan.
  const s5 = section(5);
  const weeklyTarget = target !== null ? `${money(Math.round(target / 4.33 / 1000) * 1000)} a week by month 12` : "Up on the same week last month";
  const sectionFive: ReportSection = {
    number: 5, title: "Operational plan", standfirst: worst(sales.health, operations.health) === sales.health && sales.health !== "clear" ? sales.finding : operations.finding, health: worst(sales.health, operations.health),
    overview: "A business that cannot deliver without its owner present does not have an operation: it has a job with paperwork. This section covers how customers come in and how the work gets done, and sets the rhythm that keeps the plan honest.",
    scope: ["Winning and keeping customers.", "How the business runs.", "The six numbers to watch every week.", "The rhythm of reviews."],
    blocks: [
      s5.sub("Winning and keeping customers"),
      ...partBlocks(5).filter((block) => block.kind !== "reading"),
      s5.read(sales),
      s5.sub("How the business runs"),
      s5.read(operations),
      s5.sub("The six numbers to watch every week"),
      { kind: "paragraph", text: "Run the business on a few numbers looked at often, rather than many looked at never. Thirty minutes, the same day each week." },
      { kind: "table", columns: ["Number", "Why it matters", "Target"], widths: [0.32, 0.4, 0.28], rows: [
        ["Sales this week", "The plan made visible", weeklyTarget],
        ["Enquiries, and how many buy", "Where sales are won or lost", intake.conversion !== null && intake.conversion < 5 ? `${Math.min(intake.conversion + 2, 5)} in 10` : "3 in 10 or more"],
        ["Cash in the bank", "The number that ends businesses profitable on paper", "8 weeks of costs"],
        ["Money owed to you", "The cheapest money you can raise", "Under one month of sales"],
        [`Margin on ${topProduct ?? "your top earner"}`, "Whether you are selling or giving away", "50% or more"],
        ["Hours on the business, not in it", "The founder bottleneck", "At least 2 a week"],
      ] },
      s5.sub("The rhythm of reviews"),
      { kind: "table", columns: ["Rhythm", "The habit", "What it produces"], widths: [0.16, 0.34, 0.5], rows: [
        ["Weekly", "The six numbers", "Thirty minutes: sales, enquiries, cash, money owed, margin and your hours."],
        ["Monthly", "The one-hour close", "One page: money in, costs out, cash, and the number you are watching. Filed, not discussed."],
        ["Quarterly", "The review", "Progress against Section Eight and the risks in Section Seven, with one person outside the business who reads the numbers first."],
        ["Yearly", "Renewals and the plan", "Registration, tax, insurance and the lease in one sitting. Then this plan, rewritten."],
      ] },
      s5.rec(["Start the weekly six numbers and the monthly close this month, before any other change. Every later decision in this plan is better made with them in front of you."]),
    ],
  };

  // Section Six: the financial case.
  const s6 = section(6);
  const sectionSix: ReportSection = {
    number: 6, title: "The financial case", standfirst: finance.finding, health: finance.health,
    overview: "The arithmetic of the business today, what it leaves behind each month, and what your target requires. It summarises your answers; it is not an audit.",
    scope: ["Last month in naira.", "Your numbers against what good looks like.", ...(question?.levers.length ? ["The arithmetic of your target."] : []), "What it means and what to do."],
    blocks: [
      ...partBlocks(8).filter((block) => block.kind === "metrics"),
      ...(partBlocks(8).some((block) => block.kind === "waterfall") ? [s6.sub("Last month in naira"), ...partBlocks(8).filter((block) => block.kind === "waterfall")] : []),
      ...(bench.length ? [s6.sub("Against what good looks like"), { kind: "benchmarks" as const, items: bench }] : []),
      ...(question?.levers.length ? [
        s6.sub("The arithmetic of your target"),
        ...question.text.map((text) => ({ kind: "paragraph" as const, text })),
        { kind: "table" as const, columns: ["Lever", "Factor", "From and to", "Difficulty"], widths: [0.2, 0.12, 0.46, 0.22], rows: question.levers.map((lever) => [lever.lever, lever.factor, lever.fromTo, lever.difficulty]) },
        question.bridge!,
      ] : []),
      s6.sub("What it means"),
      s6.read(finance),
    ],
  };

  // Section Seven: risk.
  const s7 = section(7);
  const sectionSeven: ReportSection = {
    number: 7, title: "Risk", standfirst: risk.finding, health: parts[6].health,
    overview: "What could stop the business, how likely it is and how much it would hurt, with a first control for each. A risk you have named is one you can fence.",
    scope: ["The risk map.", "The register, worst first.", "Registration, compliance and dependence."],
    blocks: [
      s7.sub("The risk map and register"),
      ...partBlocks(7).filter((block) => block.kind === "riskMatrix" || block.kind === "table" || (block.kind === "paragraph")),
      s7.sub("What your answers show"),
      s7.read(risk),
      ...extraReadings.map((item) => s7.read(item)),
    ],
  };

  const unregisteredNow = intake.registration === "not_registered";
  type Action = { action: string; owner: string; month: string };
  const phaseOne: Action[] = [
    { action: "Start the six weekly numbers and the one-hour monthly close (Section Five)", owner: "You", month: "1" },
    ...moves.map((move, index) => ({ action: `${move.move}${recCodes.has(chosen[index]) ? ` (Recommendation ${recCodes.get(chosen[index])})` : ""}`, owner: "You", month: String(index + 1) })),
    ...(unregisteredNow ? [{ action: "Register with CAC, get a tax identification number and diarise the filing dates", owner: "You, with an accountant", month: "2" }] : []),
    { action: "Phase One review: are the numbers tracked weekly, and has the first measure moved?", owner: "You", month: "3" },
  ];
  const phaseTwo: Action[] = [
    ...phaseTwoAreas.map((area, index) => ({ action: `${moveFor(area).move}${recCodes.has(area) ? ` (Recommendation ${recCodes.get(area)})` : ""}`, owner: "You", month: String(4 + index) })),
    ...(coverHealth ? [{ action: "Build cash towards 8 weeks of costs, a fixed share of every month's sales set aside", owner: "You", month: "4 to 9" }] : []),
    { action: "Mid-plan review: check progress against your goal and reforecast the year", owner: "You", month: "6" },
    ...(phaseTwoAreas.length ? [] : [{ action: "Choose the next growth step on purpose, and test it small before committing", owner: "You", month: "7 to 9" }]),
  ];
  const phaseThree: Action[] = [
    { action: "Hold the gains through a full quarter: the six numbers steady or rising", owner: "You", month: "10 to 12" },
    { action: "Test the business against a month without you: what would be waiting when you came back?", owner: "You", month: "11" },
    { action: "Rewrite this plan for the next twelve months", owner: "You", month: "12" },
  ];
  let actionNumber = 0;
  const actionRows = (items: Action[]) => items.map((item) => [String(++actionNumber), item.action, item.owner, item.month]);
  const actionTable = (items: Action[]): ReportBlock => ({ kind: "table", columns: ["#", "Action", "Owner", "Month"], widths: [0.06, 0.6, 0.2, 0.14], rows: actionRows(items) });

  // Section Eight: the work plan.
  const sectionEight: ReportSection = {
    number: 8, title: "The work plan", standfirst: `Twelve months, three phases, ${phaseOne.length + phaseTwo.length + phaseThree.length} actions. Every Recommendation in this plan, sequenced, with an owner and a month.`,
    overview: "This is the part to work from. Phase One is judged on what exists at the end of month three, not on what it earned along the way.",
    scope: ["The three phases.", "Phase One: Build, months 1 to 3.", "Phase Two: Execute, months 4 to 9.", "Phase Three: Consolidate, months 10 to 12."],
    blocks: [
      { kind: "table", columns: ["Phase", "Months", "The single objective"], widths: [0.26, 0.14, 0.6], rows: phases.map((phase) => [phase.phase, phase.months, phase.goal]) },
      { kind: "timeline", moves },
      { kind: "subsection", code: "8.1", title: "Phase One: Build (months 1 to 3)" },
      actionTable(phaseOne),
      { kind: "callout", title: "The gate at the end of Phase One", text: `Do not move to Phase Two until three things are true. One: ${gateMeasure} is tracked every week and moving the right way. Two: the monthly close has run three times. Three: the items in Section Nine are closed. If any one is not true, extend Phase One rather than moving on.` },
      { kind: "subsection", code: "8.2", title: "Phase Two: Execute (months 4 to 9)" },
      actionTable(phaseTwo),
      { kind: "subsection", code: "8.3", title: "Phase Three: Consolidate (months 10 to 12)" },
      actionTable(phaseThree),
    ],
  };

  // Section Nine: outstanding items.
  const s9 = section(9);
  const sectionNine: ReportSection = {
    number: 9, title: "Outstanding items", standfirst: needs.length ? `${upperFirst(["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][needs.length] ?? String(needs.length))} thing${needs.length === 1 ? "" : "s"} we still need from you before this plan is complete.` : "Nothing outstanding: every question was answered.",
    overview: "This plan is deliberately explicit about its own gaps. Nothing below stops Phase One from starting, but each item makes the plan sharper, and only you can close them.",
    scope: ["What we need from you.", "Open on the record.", "How to use this document.", "If you want help."],
    blocks: [
      s9.sub("What we need from you"),
      needs.length
        ? { kind: "table", columns: ["#", "Item", "Why it matters"], widths: [0.06, 0.44, 0.5], rows: needs.map(([item, why], index) => [String(index + 1), item, why]) }
        : { kind: "paragraph", text: "You answered every question. Keep the answers current: the weekly numbers in Section Five will replace most of them with measured figures." },
      ...(openRecord.length ? [s9.sub("Open on the record"), { kind: "numbered" as const, items: openRecord }] : []),
      s9.sub("How to use this document"),
      { kind: "numbered", items: [
        "Read it once in full, then work from Section Eight. Its measure is not whether the analysis was right, but whether Phase One's actions are done by the end of month three.",
        "Mark it up. Tell us what is wrong, what is missing and what you would do differently, by replying to the email this plan came with.",
        "Review it twice: at the Phase One gate in month three, and at the mid-plan review in month six. A plan that is never revisited becomes an old plan.",
      ] },
      s9.sub("If you want help"),
      ...partBlocks(11),
    ],
  };

  const sections = [sectionOne, sectionTwo, sectionThree, sectionFour, sectionFive, sectionSix, sectionSeven, sectionEight, sectionNine];

  const positionRows: ReportBackground["position"] = [
    ...(answers.p_age ? [{ label: "Trading for", figure: optionLabel("p_age", answers.p_age) ?? "", meaning: idea ? "Not yet trading" : TREND[String(answers.p_trend)] ?? "" }] : []),
    { label: "Money in last month", figure: revenue !== null ? formatNaira(revenue) : "Not known", meaning: metrics.revenueVsTypical === "within" ? "Within the typical month you described" : metrics.revenueVsTypical ? `${upperFirst(metrics.revenueVsTypical)} the typical month you described` : "Revenue, not profit" },
    { label: "Left after costs", figure: metrics.result !== null ? `${metrics.result < 0 ? "−" : ""}${formatNaira(Math.abs(metrics.result))}` : "Not known", meaning: deficit ? "Costs ran ahead of sales" : thinResult ? "Thin: under 10% of revenue" : metrics.result !== null ? "A real surplus" : "Needs last month's costs" },
    { label: "Gross margin", figure: metrics.margin?.text ?? "Not known", meaning: metrics.margin ? (metrics.margin.health === "clear" ? `Healthy for each ${metrics.per}` : metrics.margin.health === "watch" ? "Workable, with little room for mistakes" : "Too thin to carry the business") : "Needs your direct costs" },
    { label: "Cash cover", figure: coverText(metrics.cover), meaning: coverHealth === "stuck" ? "One bad month is a crisis" : coverHealth === "watch" ? "Below the 8 weeks a business needs" : metrics.cover ? "A cushion for a bad month" : "Needs cash and costs" },
    { label: "Enquiries a month", figure: `${labelOf(ENQUIRIES, intake.enquiries)}${intake.conversion !== null ? `; ${intake.conversion} in 10 buy` : ""}`, meaning: lowConversion ? "Sales are lost after people ask" : "The demand the plan starts from" },
    ...(answers.p_staff ? [{ label: "People", figure: optionLabel("p_staff", answers.p_staff) ?? "", meaning: answers.f_team ? TEAM[String(answers.f_team)] ?? "" : "" }] : []),
    { label: "Top three customers", figure: labelOf(TOP_CUSTOMER_SHARE, intake.topCustomerShare), meaning: intake.topCustomerShare === "over_50" ? "Losing one would change the business overnight" : "Share of your sales" },
  ];
  const background: ReportBackground = {
    overview: `You took the Business Check and completed the Report Intake. This plan brings what you told us into one place, as a plan you can work from. Where it quotes you, the words are yours; where it records a number, the number came from your answers.`,
    engagement: [
      "Your Business Check: the ten places a business gets stuck, and you as a founder, in your words.",
      `Your Report Intake, completed ${reportDate(input.date)}: what you sell, who buys, how the business runs, and the numbers.`,
      "This plan: built by fixed rules from both, so every finding traces back to an answer you gave.",
    ],
    position: positionRows,
    facts: takeaways().slice(0, 2).map(({ headline, detail }) => ({ headline, detail })),
    question,
    headline: implications(),
  };

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
      scorecard,
      takeaways: takeaways(),
      implications: implications(),
      benchmarks: bench,
    },
    background,
    sections,
    appendix: appendix(answers, intake),
    method: `Built by the fixed rules of ${BRAND.productName} from the Business Check you took and the Report Intake you completed. The same answers always give the same report. It reflects what you told us on ${reportDate(input.date)}. It is not an audit, a valuation, or financial, legal or tax advice.`,
  };

  /** The three findings that matter most, root cause first. */
  function takeaways() {
    const ranked = [...(mainArea !== undefined ? [mainArea] : []), ...order.filter((area) => area !== mainArea && areaHealth.get(area)!.health === "stuck"), ...order.filter((area) => area !== mainArea && areaHealth.get(area)!.health === "watch")];
    if (!ranked.length) return [{ headline: "Every area we looked at is clear", detail: "The risk for a business in good shape is standing still." }];
    return ranked.slice(0, 3).map((area) => ({
      headline: area === 1 && idea ? "Your idea" : AREA_NAMES[area],
      detail: areaHealth.get(area)!.finding,
      health: areaHealth.get(area)!.health,
    }));
  }
  /** What the findings mean for the owner's next decisions: the "so what". */
  function implications() {
    if (mainArea === undefined) return ["Protect what works: keep the routines that got you here.", "Choose the next growth step on purpose, and review the numbers every month."];
    const items = [`Start with ${AREA_NAMES[mainArea].toLowerCase()}: ${gap ? GAP_ADVICE[gap].replace(/^So t/, "t") : "fix the root before the symptoms."}`];
    if (deficit) items.push(`At last month's pace the business spends ${money(-metrics.result!)} more than it brings in each month. Only higher prices, lower costs or more sales close that gap: choose which this month.`);
    if (coverHealth) items.push(`Cash would cover ${lower(coverText(metrics.cover))} of costs. Until it covers 8 weeks, plan every spend against a 13-week cash forecast.`);
    if (stuck.length >= 2) items.push(`${upperFirst(["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][stuck.length] ?? String(stuck.length))} areas are stuck, but they are rarely separate problems. Fixing the root first should ease the rest.`);
    if (items.length < 3) items.push(`Measure progress by ${lower(mainArea === 1 && idea ? IDEA_CONTENT.watch : AREA_CONTENT[mainArea].watch)}, checked every month.`);
    return items.slice(0, 3);
  }
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
/** What a typed or banded gross margin looks like on the scale: the middle of the band the owner chose. */
const MARGIN_MID: Record<string, number> = { under_25: 85, "25_50": 62.5, "50_75": 37.5, over_75: 15 };

/**
 * The owner's numbers against the thresholds the readings above already use, so a bar's colour always agrees with
 * the part's health. A number the owner did not give is left out.
 */
function benchmarks(intake: ReportIntake, metrics: ReportMetrics, health: { cover?: Health; result: Health; owed: Health; conversion: Health }): Benchmark[] {
  const items: Benchmark[] = [];
  if (metrics.coverMid !== null) items.push({ label: "Cash cover", value: metrics.coverMid, display: coverText(metrics.cover), min: 0, max: 16, zones: [{ to: 4, health: "stuck" }, { to: 8, health: "watch" }, { to: 16, health: "clear" }], target: "Good: 8 weeks of costs or more", health: health.cover ?? "clear" });
  if (metrics.resultMargin !== null) items.push({ label: "Left after costs", value: metrics.resultMargin * 100, display: `${metrics.resultMargin < 0 ? "−" : ""}${Math.round(Math.abs(metrics.resultMargin) * 100)}% of revenue`, min: -20, max: 40, zones: [{ to: 0, health: "stuck" }, { to: 10, health: "watch" }, { to: 40, health: "clear" }], target: "Good: 10% of revenue or more", health: health.result });
  if (metrics.margin) items.push({ label: "Gross margin", value: intake.marginPercent ?? MARGIN_MID[intake.costShare] ?? 0, display: metrics.margin.text, min: 0, max: 100, zones: [{ to: 25, health: "stuck" }, { to: 50, health: "watch" }, { to: 100, health: "clear" }], target: `Good: 50% or more of each ${metrics.per}`, health: metrics.margin.health });
  if (metrics.owedMonths !== null) items.push({ label: "Owed to you", value: metrics.owedMonths, display: `${metrics.owedMonths === 0 ? "Nothing" : `${metrics.owedMonths.toFixed(1)} months of sales`}`, min: 0, max: 3, zones: [{ to: 1, health: "clear" }, { to: 3, health: "watch" }], target: "Good: under one month of sales", health: health.owed });
  if (intake.conversion !== null) items.push({ label: "Enquiries that buy", value: intake.conversion, display: `${intake.conversion} in 10`, min: 0, max: 10, zones: [{ to: 2, health: "watch" }, { to: 10, health: "clear" }], target: "Good: 3 in 10 or more", health: health.conversion });
  return items;
}
const benchmarkBlock = (items: Benchmark[]): ReportBlock[] => (items.length ? [{ kind: "benchmarks", items }] : []);

function riskRegister(answers: Answers, result: CheckResult, intake: ReportIntake, metrics: ReportMetrics): ReportBlock[] {
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
    ? [
      { kind: "riskMatrix", risks: sorted.map((item, index) => ({ number: index + 1, risk: item.risk, likelihood: item.likelihood, impact: item.impact })) },
      { kind: "table", columns: ["#", "Risk", "Likelihood", "Impact", "First control"], widths: [0.06, 0.27, 0.15, 0.11, 0.41], rows: sorted.map((item, index) => [String(index + 1), item.risk, level(item.likelihood), level(item.impact), item.control]) },
    ]
    : [{ kind: "paragraph", text: "Your answers did not point to a pressing risk. Keep a short list of the five things that could hurt the business most, and review it once a year." }];
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
    goal: intake.revenueTarget ? `${sentence(intake.goal)} Monthly sales wanted in 12 months: ${formatNaira(intake.revenueTarget)}.` : intake.goal,
  };
  return [
    { title: "Your Business Check", rows: check },
    { title: "Your Report Intake", rows: INTAKE_QUESTIONS.map((question) => ({ question: intakeWording(question, earnsByDeal(intake.products)).prompt, answer: intakeAnswers[question.id] })) },
  ];
}
