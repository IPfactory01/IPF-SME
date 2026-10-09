/**
 * The business check engine: which question comes next, and what the answers add up to.
 * Deterministic by design. The same answers always produce the same path and the same outline;
 * the AI write-up (server/businessCheck.ts) only words the findings and may not change them.
 *
 * Path rules (5 October working session; concept note v0.8.1, section 15):
 * - Everyone starts with the business profile, then founder readiness.
 * - Idea stage: strategic intent is asked about the idea, then the check ends. No offering,
 *   sales or operations questions for a business that does not trade yet.
 * - Side business: strategic intent, offering, sales and financials; operations once there are staff.
 * - Main business: the stage (years trading) decides the areas. Under 2 years: areas 1 to 8, with
 *   follow-ups only where an early business usually breaks (offering, sales, financials).
 *   2 to 10 years: areas 1 to 8, plus exit and value from 5 years. Over 10 years: business model
 *   first, then every area including exit and owner transition.
 * - Large businesses (over ₦25 million a month or more than 50 people) stop after the profile
 *   and go straight to a conversation; very small ones (just the owner, under ₦1 million a month)
 *   stop after founder readiness.
 * - Follow-up questions open only when the owner says an area is not clear.
 */
import { OFFERINGS, offeringById, type Offering } from "./catalogue";
import { SECTOR_EXAMPLES, SECTOR_IDS, SECTOR_NOUNS, type SectorId } from "./sectorExamples";
import {
  AREA_NAMES,
  GAP_LABELS,
  SECTIONS,
  stageOf,
  typeOf,
  type Answers,
  type Gap,
  type Health,
  type Option,
  type Question,
  type Section,
  type SectionId,
} from "./questions";

export type Route = "advisory" | "programme" | "foundation" | "idea";
export type ReadinessLevel = "advanced" | "intermediate" | "nascent";
export type DiscStyle = "D" | "I" | "S" | "C";

const AREAS_1_TO_8: SectionId[] = ["intent", "market", "offer", "model", "sales", "operations", "finance", "risk"];
const STAFF_ORDER = ["0", "1to2", "3to5", "6to10", "11to20", "21to50", "over50"];

export function isLarge(answers: Answers) {
  return answers.p_revenue === "over25m" || answers.p_staff === "over50";
}

export function isVerySmall(answers: Answers) {
  return stageOf(answers) !== "idea" && answers.p_revenue === "under1m" && answers.p_staff === "0";
}

export function routeFor(answers: Answers): Route {
  if (stageOf(answers) === "idea") return "idea";
  if (isLarge(answers)) return "advisory";
  if (isVerySmall(answers)) return "foundation";
  return "programme";
}

/** The problem-area sections that follow founder readiness, in the order they are asked. */
function areaSections(answers: Answers): SectionId[] {
  const stage = stageOf(answers);
  if (stage === "idea") return ["idea"];
  if (stage === "side") {
    const hasStaff = STAFF_ORDER.indexOf(String(answers.p_staff)) >= STAFF_ORDER.indexOf("3to5");
    return hasStaff ? ["intent", "offer", "sales", "operations", "finance"] : ["intent", "offer", "sales", "finance"];
  }
  switch (answers.p_age) {
    case "over10":
      return ["model", "intent", "market", "offer", "sales", "operations", "finance", "risk", "exit", "transition"];
    case "5to10":
      return [...AREAS_1_TO_8, "exit"];
    default:
      return AREAS_1_TO_8;
  }
}

/** Sections in the order the owner meets them. Grows as answers arrive; never shrinks earlier sections. */
export function sectionPath(answers: Answers): SectionId[] {
  if (!stageOf(answers)) return ["profile"];
  if (isLarge(answers)) return ["profile"];
  if (isVerySmall(answers)) return ["profile", "founder"];
  return ["profile", "founder", ...areaSections(answers)];
}

function followUpsOpen(sectionId: SectionId, answers: Answers) {
  if (stageOf(answers) === "operating" && answers.p_age === "under2") {
    return sectionId === "offer" || sectionId === "sales" || sectionId === "finance";
  }
  return true;
}

/** The questions of a section the owner should see, given the answers so far. */
export function visibleQuestions(section: Section, answers: Answers): Question[] {
  return section.questions.filter((question) => {
    if (question.showIf && !question.showIf(answers)) return false;
    if (question.id.endsWith("_detail") && !followUpsOpen(section.id, answers)) return false;
    return true;
  });
}

export type Step = { section: Section; question: Question };

/** Every question on the current path, in order. */
export function questionPath(answers: Answers): Step[] {
  return sectionPath(answers).flatMap((id) =>
    visibleQuestions(SECTIONS[id], answers).map((question) => ({ section: SECTIONS[id], question })),
  );
}

export function isAnswered(question: Question, answers: Answers) {
  const value = answers[question.id];
  // An optional typed answer counts once given, even if skipped (""), so it is asked only once; a required one needs text.
  if (question.kind === "text") return typeof value === "string" && (question.optional === true || value.trim().length > 0);
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

/** The first unanswered question, or null when the check is complete. */
export function nextStep(answers: Answers): Step | null {
  return questionPath(answers).find((step) => !isAnswered(step.question, answers)) ?? null;
}

/** Complete when every required question on the path is answered; optional ones may be left out. */
export function isComplete(answers: Answers) {
  return questionPath(answers).every(({ question }) => question.optional || isAnswered(question, answers));
}

/** Options and prompt for this owner (idea-stage founders see different wording). */
/** The prompt in the right tense and context for the owner's stage. */
export function promptFor(question: Question, answers: Answers) {
  const stage = stageOf(answers);
  if (stage === "idea" && question.ideaPrompt) return question.ideaPrompt;
  if (stage === "side" && question.sidePrompt) return question.sidePrompt;
  return question.prompt;
}

export function placeholderFor(question: Question, answers: Answers) {
  return stageOf(answers) === "idea" && question.ideaPlaceholder ? question.ideaPlaceholder : question.placeholder;
}

/** The business's name and one-line description, as typed in the check (empty when skipped). */
export function businessDetails(answers: Answers) {
  const text = (id: string) => (typeof answers[id] === "string" ? (answers[id] as string).trim() : "");
  return { businessName: text("p_name"), description: text("p_description") };
}

export function optionsFor(question: Question, answers: Answers): readonly Option[] {
  const stage = stageOf(answers);
  const options = stage === "idea" && question.ideaOptions ? question.ideaOptions : question.options;
  return options.filter((option) => !option.stages || (stage !== undefined && option.stages.includes(stage)));
}

/** The example shown under a section's definition, matched to the kind of business described. */
export function sectorOf(answers: Answers): SectorId | undefined {
  return SECTOR_IDS.find((sector) => sector === answers.p_sector);
}

type Example = { text: string; heading: string };

/**
 * The example under a section's definition. The owner's sector comes first, so a fashion designer
 * reads about fashion. Founder readiness for someone who hasn't started yet keeps its example about
 * leaving a job. Sector "other" falls back to the stage, then the kind of business.
 */
function pickExample(section: Section, answers: Answers): Example | undefined {
  const stage = stageOf(answers);
  const sector = sectorOf(answers);
  if (stage === "idea" && section.examples.idea) return { text: section.examples.idea, heading: "For example" };
  if (sector && section.id !== "profile") {
    const noun = SECTOR_NOUNS[sector];
    return { text: SECTOR_EXAMPLES[section.id][sector], heading: stage === "idea" ? `For a ${noun} idea like yours` : `For a ${noun} business like yours` };
  }
  if (stage === "side" && section.examples.side) return { text: section.examples.side, heading: "For a side business" };
  const text = section.examples[typeOf(answers)] ?? section.examples.mixed;
  return text ? { text, heading: stage === "idea" ? "For example" : "For a business like yours" } : undefined;
}

export function exampleFor(section: Section, answers: Answers) {
  return pickExample(section, answers)?.text;
}

export function exampleHeading(section: Section, answers: Answers) {
  return pickExample(section, answers)?.heading;
}

function validValue(question: Question, value: Answers[string], answers: Answers): Answers[string] {
  if (question.kind === "text") {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, question.maxLength ?? 300) : undefined;
  }
  const options = optionsFor(question, answers);
  const allowed = new Set(options.map((option) => option.value));
  if (question.kind === "multi") {
    const values = Array.isArray(value) ? Array.from(new Set(value.filter((item) => allowed.has(item)))) : [];
    const exclusive = options.find((option) => option.exclusive && values.includes(option.value));
    if (exclusive) return [exclusive.value];
    return values.length ? values : undefined;
  }
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

/**
 * Keeps only answers on the path those same answers lead to, walking it in order the way the
 * form does. Answers left over from a branch the owner backed out of are dropped.
 */
export function cleanAnswers(answers: Answers): Answers {
  const clean: Answers = {};
  const visited = new Set<string>();
  for (;;) {
    const step = questionPath(clean).find(({ question }) => !visited.has(question.id));
    if (!step) return clean;
    visited.add(step.question.id);
    const value = validValue(step.question, answers[step.question.id], clean);
    if (value !== undefined) clean[step.question.id] = value;
  }
}

// ---------------------------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------------------------

export type FounderRead = {
  level: ReadinessLevel;
  score: number;
  capacity: number;
  competence: number;
  exposure: number;
  /** Instinct under pressure, and how others see the founder. */
  instinct?: DiscStyle;
  seen?: DiscStyle;
  /** True when nobody reliably plays the driving role (ET: "you need a D"). */
  needsDriver: boolean;
};

export const DISC_STYLES: Record<DiscStyle, { name: string; strength: string; watch: string }> = {
  D: { name: "Driver", strength: "You decide quickly and push for results.", watch: "Detail and the team's buy-in can get left behind." },
  I: { name: "Influencer", strength: "You sell, persuade and rally people.", watch: "Follow-through and the numbers can slip." },
  S: { name: "Steady hand", strength: "You keep things calm and people rely on you.", watch: "Hard conversations and fast change can be put off." },
  C: { name: "Analyst", strength: "You get things right and spot problems early.", watch: "Decisions and selling can wait too long for certainty." },
};

const asDisc = (value: unknown): DiscStyle | undefined =>
  value === "D" || value === "I" || value === "S" || value === "C" ? value : undefined;

export function founderRead(answers: Answers): FounderRead {
  const finance = Array.isArray(answers.f_finance) ? answers.f_finance.filter((value) => value !== "none") : [];
  const competence = finance.length >= 3 ? 2 : finance.length >= 1 ? 1 : 0;

  const educationScore: Record<string, number> = { none: 0, short: 1, degree: 2, corporate: 2 };
  let exposure = educationScore[String(answers.f_education)] ?? 0;
  if (answers.p_age === "5to10" || answers.p_age === "over10") exposure = 2;

  const hoursScore: Record<string, number> = { lt2: 0, "2to4": 1, "5plus": 2 };
  let capacity = hoursScore[String(answers.f_hours)] ?? 0;
  if (answers.f_team === "cofounder" || answers.f_team === "team") capacity += 1;
  if (answers.f_tough === "nobody") capacity -= 1;
  capacity = Math.max(0, Math.min(2, capacity));

  const score = competence + exposure + capacity;
  const level: ReadinessLevel = score >= 5 ? "advanced" : score >= 3 ? "intermediate" : "nascent";
  const instinct = asDisc(answers.f_instinct);
  const seen = asDisc(answers.f_seen);
  const hasDriver = instinct === "D" || seen === "D";
  const needsDriver = !hasDriver && (answers.f_tough === "me_avoid" || answers.f_tough === "nobody");
  return { level, score, capacity, competence, exposure, instinct, seen, needsDriver };
}

export type AreaRead = {
  area: number;
  name: string;
  health: Health;
  gap?: Gap;
  /** The owner's own answer, in their words, for the outline. */
  answer?: string;
};

const HEALTH_RANK: Record<Health, number> = { clear: 0, watch: 1, stuck: 2 };
const worst = (a: Health, b: Health) => (HEALTH_RANK[b] > HEALTH_RANK[a] ? b : a);

function chosenOption(questionId: string, sectionId: SectionId, answers: Answers): Option | undefined {
  const question = SECTIONS[sectionId].questions.find((item) => item.id === questionId);
  const value = answers[questionId];
  return question && typeof value === "string" ? optionsFor(question, answers).find((option) => option.value === value) : undefined;
}

/** The colour-coded business outline: one row per area the owner was asked about. */
export function businessOutline(answers: Answers): AreaRead[] {
  const rows: AreaRead[] = [];
  for (const sectionId of sectionPath(answers)) {
    const section = SECTIONS[sectionId];
    if (section.area === undefined) continue;
    if (sectionId === "founder") {
      if (!answers.f_hours) continue;
      const read = founderRead(answers);
      const health: Health = read.level === "advanced" ? "clear" : read.level === "intermediate" ? "watch" : "stuck";
      rows.push({ area: 0, name: AREA_NAMES[0], health, gap: read.competence === 0 ? "knowhow" : read.capacity === 0 ? "resources" : undefined, answer: READINESS_LABELS[read.level] });
      continue;
    }
    if (sectionId === "idea") {
      let health: Health = "clear";
      let gap: Gap | undefined;
      let answered = false;
      for (const question of section.questions) {
        const option = chosenOption(question.id, "idea", answers);
        if (!option?.health) continue;
        answered = true;
        if (HEALTH_RANK[option.health] > HEALTH_RANK[health] || (!gap && option.gap)) gap = option.gap ?? gap;
        health = worst(health, option.health);
      }
      if (answered) rows.push({ area: 1, name: AREA_NAMES[1], health, gap, answer: chosenOption("i_customer", "idea", answers)?.label });
      continue;
    }
    const status = chosenOption(`${statusPrefix(sectionId)}_status`, sectionId, answers);
    if (!status?.health) continue;
    rows.push({ area: section.area, name: AREA_NAMES[section.area], health: status.health, gap: status.gap, answer: status.label });
  }
  return rows;
}

export type AreaNotAssessed = { area: number; name: string; reason: string };

/** Under the outline when some areas were left out, so the owner sees the whole method. */
export const NOT_ASSESSED_NOTE = "Areas marked not assessed weren't part of this check for your business. Current State looks at all ten.";

/**
 * The problem areas (1 to 10) the check left out for a trading business on the programme route,
 * each with the reason, in the owner's terms. Ideas, very small and very large businesses take a
 * different route, so nothing is listed for them.
 */
export function areasNotAssessed(answers: Answers): AreaNotAssessed[] {
  if (routeFor(answers) !== "programme") return [];
  const asked = new Set(sectionPath(answers).map((id) => SECTIONS[id].area));
  const side = stageOf(answers) === "side";
  const reason = (area: number) => {
    if (side) return area === 6 ? "Not asked while the business has fewer than three people." : "Not asked while you run the business alongside a job.";
    return area === 10 ? "Asked once the business has traded for ten years." : "Asked once the business has traded for five years.";
  };
  return Object.keys(AREA_NAMES)
    .map(Number)
    .filter((area) => area > 0 && !asked.has(area))
    .map((area) => ({ area, name: AREA_NAMES[area], reason: reason(area) }));
}

function statusPrefix(sectionId: SectionId) {
  return `s${SECTIONS[sectionId].area}`;
}

export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  advanced: "Advanced: ready to lead the next stage",
  intermediate: "Intermediate: ready, with gaps to close",
  nascent: "Nascent: build the founder before the business",
};

/** Root-cause order: money and model problems usually sit under sales, offer and people problems. */
const AREA_PRIORITY = [7, 4, 5, 3, 6, 1, 2, 8, 9, 10, 0];
/** Over ten years and flat or declining: the way the business makes money has usually stopped working (ET). */
const MATURE_STRUGGLING_PRIORITY = [4, 7, 5, 3, 6, 1, 2, 8, 9, 10, 0];

export function isMatureAndStruggling(answers: Answers) {
  return answers.p_age === "over10" && (answers.p_trend === "flat" || answers.p_trend === "declining");
}

export function primaryArea(outline: AreaRead[], answers: Answers = {}): AreaRead | undefined {
  const priority = isMatureAndStruggling(answers) ? MATURE_STRUGGLING_PRIORITY : AREA_PRIORITY;
  for (const health of ["stuck", "watch"] as const) {
    for (const area of priority) {
      const row = outline.find((item) => item.area === area && item.health === health);
      if (row) return row;
    }
  }
  return undefined;
}

export function primaryGap(outline: AreaRead[], main?: AreaRead): Gap | undefined {
  if (main?.gap) return main.gap;
  const counts = new Map<Gap, number>();
  for (const row of outline) if (row.gap && row.health !== "clear") counts.set(row.gap, (counts.get(row.gap) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Offerings the answers point to, strongest first. Status answers weigh twice a follow-up. */
export function matchedOfferings(answers: Answers, outline: AreaRead[], limit = 3): Offering[] {
  const weights = new Map<string, number>();
  const add = (ids: readonly string[] | undefined, weight: number) => {
    for (const id of ids ?? []) weights.set(id, (weights.get(id) ?? 0) + weight);
  };
  for (const { section, question } of questionPath(answers)) {
    if (section.id === "profile" || section.id === "founder") continue;
    const option = chosenOption(question.id, section.id, answers);
    if (!option) continue;
    // The main problem area's answers count most.
    add(option.offerings, question.id.endsWith("_status") ? 2 : 1);
  }
  const main = primaryArea(outline, answers);
  if (main) {
    const status = chosenOption(`s${main.area}_status`, sectionByArea(main.area), answers);
    add(status?.offerings, 1);
  }
  // Several stuck areas are usually one connected problem: lead with the offerings built for that.
  const lead: string[] = [];
  if (outline.filter((row) => row.health === "stuck").length >= 4) {
    if (answers.p_trend === "declining") lead.push("business-transformation");
    lead.push("embedded-support");
  }
  const order = new Map(OFFERINGS.map((offering, index) => [offering.id, index]));
  const ranked = Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .map(([id]) => id)
    .filter((id) => !lead.includes(id));
  return [...lead, ...ranked]
    .map((id) => offeringById(id))
    .filter((offering): offering is Offering => Boolean(offering))
    .slice(0, limit);
}

function sectionByArea(area: number): SectionId {
  return (Object.values(SECTIONS).find((section) => section.area === area && section.id !== "idea")?.id ?? "intent") as SectionId;
}

export type CheckResult = {
  route: Route;
  founder: FounderRead;
  outline: AreaRead[];
  primaryArea?: AreaRead;
  primaryGap?: Gap;
  offerings: Offering[];
  /** Plain summary written from the rules; used when the AI write-up is unavailable. */
  summary: { found: string; think: string; next: string };
};

export function evaluate(rawAnswers: Answers): CheckResult {
  const answers = cleanAnswers(rawAnswers);
  const route = routeFor(answers);
  const founder = founderRead(answers);
  const outline = businessOutline(answers);
  const main = primaryArea(outline, answers);
  const gap = primaryGap(outline, main);
  const offerings = route === "advisory" ? [] : matchedOfferings(answers, outline);
  return { route, founder, outline, primaryArea: main, primaryGap: gap, offerings, summary: writeSummary({ answers, route, founder, outline, main, gap, offerings }) };
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function writeSummary(input: {
  answers: Answers;
  route: Route;
  founder: FounderRead;
  outline: AreaRead[];
  main?: AreaRead;
  gap?: Gap;
  offerings: Offering[];
}): CheckResult["summary"] {
  const { route, founder, outline, main, gap, offerings } = input;
  const style = founder.instinct ? DISC_STYLES[founder.instinct] : undefined;
  const stuck = outline.filter((row) => row.health === "stuck" && row.area !== 0).map((row) => row.name);
  const watch = outline.filter((row) => row.health === "watch" && row.area !== 0).map((row) => row.name);

  if (route === "advisory") {
    return {
      found: "Your business is at a scale where a short questionnaire would miss most of what matters.",
      think: "The right first step is a conversation with a senior adviser, who will look at the business as a whole.",
      next: "Book the free call. We will come prepared with questions for a business of your size.",
    };
  }

  const founderLine = `Founder readiness reads as ${READINESS_LABELS[founder.level].split(":")[0].toLowerCase()}.${style ? ` Under pressure you lead as ${/^[aeiou]/i.test(style.name) ? "an" : "a"} ${style.name.toLowerCase()}: ${lower(style.strength)}` : ""}${founder.needsDriver ? " Nobody in the business reliably makes the hard call yet; that role needs an owner." : ""}`;

  if (route === "idea") {
    const ideaRow = outline.find((row) => row.area === 1);
    return {
      found: `${founderLine} On the idea itself, ${ideaRow?.health === "clear" ? "the basics are in place: a first customer, a first offer and some proof." : "some basics are still open: who buys first, what you sell first, or whether anyone has paid yet."}`,
      think: gap
        ? `The main gap is ${GAP_LABELS[gap].name.toLowerCase()}: ${lower(GAP_LABELS[gap].meaning)} Before money is committed, test the idea and the founder together.`
        : "You look ready to test the idea properly with real buyers before committing more money.",
      next: "Book the free call to agree a go or no-go test and a first-90-days plan.",
    };
  }

  if (route === "foundation") {
    return {
      found: `${founderLine} The business is still mostly you, at an early revenue level.`,
      think: "At this stage the biggest lever is the founder: pricing, money basics and a simple weekly routine. A full engagement would be too much, too soon.",
      next: "Book the free call and we will point you to the training and tools that fit this stage.",
    };
  }

  const found = [
    founderLine,
    stuck.length ? `You described ${stuck.length === 1 ? "one area as stuck" : `${stuck.length} areas as stuck`}: ${stuck.join(", ")}.` : "No area came out as stuck.",
    watch.length ? `${watch.join(", ")} ${watch.length === 1 ? "needs" : "need"} watching.` : "",
  ].filter(Boolean).join(" ");

  const think = main
    ? `The place to start is ${main.name.toLowerCase()}${gap ? `, and the gap looks like ${GAP_LABELS[gap].name.toLowerCase()}: ${lower(GAP_LABELS[gap].meaning)}` : "."}${offerings.length ? ` That points to ${offerings.map((offering) => offering.name).join(", ")}.` : ""}`
    : "The business looks in good shape on what we asked. The next gains are likely in sharper priorities and stronger numbers.";
  const matureNote = isMatureAndStruggling(input.answers) && main?.area === 4
    ? ` After more than ten years with revenue ${input.answers.p_trend === "declining" ? "falling" : "flat"}, that usually means the way the business makes money has stopped working, not that the effort has dropped.`
    : "";

  return { found, think: think + matureNote, next: "Book the free 20-minute call. We will tell you honestly whether we can help, and what to fix first." };
}
