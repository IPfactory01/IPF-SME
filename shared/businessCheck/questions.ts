/**
 * The business check question bank. Sources: the 5 October working session (ET's logic: founder
 * readiness first; capacity, competence and exposure; DISC; business education; finance literacy;
 * idea inside strategic intent; each answer decides what comes next) and concept note v0.8.1,
 * sections 6 and 15 (the ten problem areas, the branch table and the four gaps).
 *
 * Register: between consulting language and plain English. Terms such as "strategic intent" or
 * "unit cost" are kept, and each section says what it means with an example for the kind of
 * business the owner described.
 */

export type Stage = "idea" | "side" | "operating";
export type BusinessType = "maker" | "trader" | "expert" | "mixed";
/** The four gaps the check names (ET, 5 Oct). */
export type Gap = "clarity" | "knowhow" | "resources" | "strategy";
/** Colour on the business outline: green, amber, red. */
export type Health = "clear" | "watch" | "stuck";

export type Answers = Record<string, string | string[] | undefined>;

export type Option = {
  value: string;
  label: string;
  health?: Health;
  gap?: Gap;
  /** Offerings this answer points to (ids in catalogue.ts). */
  offerings?: readonly string[];
  /** In a multi-select, choosing this clears the others. */
  exclusive?: boolean;
  /** A line under the label, where the label alone needs context. */
  description?: string;
  /** Offered only to owners at these stages. Missing means every stage. */
  stages?: readonly Stage[];
};

export type Question = {
  id: string;
  /** "text": a short typed answer. */
  kind: "single" | "multi" | "select" | "text";
  prompt: string;
  /** Prompt used for idea-stage founders, where the wording differs. */
  ideaPrompt?: string;
  /** Prompt used for side businesses run alongside a job. */
  sidePrompt?: string;
  /** "cards": large choices with a description each, for the questions that set the path. */
  display?: "cards";
  /** May be skipped. A skipped answer is stored as "" so the question is not asked again. */
  optional?: boolean;
  /** Example shown in an empty text box. */
  placeholder?: string;
  ideaPlaceholder?: string;
  maxLength?: number;
  help?: string;
  options: readonly Option[];
  ideaOptions?: readonly Option[];
  /** Shown only when this returns true. Missing means always shown within its section. */
  showIf?: (answers: Answers) => boolean;
};

export type SectionId =
  | "profile"
  | "founder"
  | "idea"
  | "intent"
  | "market"
  | "offer"
  | "model"
  | "sales"
  | "operations"
  | "finance"
  | "risk"
  | "exit"
  | "transition";

export type Section = {
  id: SectionId;
  /** Problem-area number (0 to 10) on the business outline, where the section is one. */
  area?: number;
  title: string;
  /** What the section is about, in a sentence or two. */
  means: string;
  /** An example for the kind of business the owner described. */
  examples: Partial<Record<BusinessType | "idea" | "side", string>>;
  questions: readonly Question[];
};

export const stageOf = (answers: Answers): Stage | undefined => answers.p_stage as Stage | undefined;
export const typeOf = (answers: Answers): BusinessType => (answers.p_type as BusinessType | undefined) ?? "mixed";
const notIdea = (answers: Answers) => stageOf(answers) !== "idea";

/** Follow-up questions open only when the area is not clear. */
const unclear = (statusId: string) => (answers: Answers) => Boolean(answers[statusId]) && answers[statusId] !== "clear";

export const SECTIONS: Record<SectionId, Section> = {
  profile: {
    id: "profile",
    title: "Your business",
    means: "First, where you are: running a business full-time, running one alongside a job, or still at the idea stage. That, and how long the business has been trading, determines which questions follow and how they are worded. Ranges are fine.",
    examples: {},
    questions: [
      {
        id: "p_stage",
        kind: "single",
        display: "cards",
        prompt: "Which best describes you today?",
        options: [
          { value: "operating", label: "I run my business full-time", description: "It is my main work, and it is trading. Next we ask how long it has been running." },
          { value: "side", label: "I run a business alongside a job", description: "A 9-to-5 or other work takes most of my time. The business is on the side, but it exists and earns." },
          { value: "idea", label: "I have an idea and haven't started", description: "Nothing is trading yet. The check focuses on you as the founder and on the idea itself." },
        ],
      },
      {
        id: "p_name",
        kind: "text",
        prompt: "What is the business called?",
        ideaPrompt: "What will the business be called?",
        help: "We use it to put your outline together. For an idea, a working name is fine.",
        placeholder: "e.g. Ada Foods",
        ideaPlaceholder: "e.g. Zobo Express",
        maxLength: 120,
        options: [],
      },
      {
        id: "p_age",
        kind: "single",
        prompt: "How long has the business been trading?",
        sidePrompt: "How long has the side business been trading?",
        showIf: notIdea,
        options: [
          { value: "under2", label: "Under 2 years", description: "Still finding its feet" },
          { value: "2to5", label: "2 to 5 years", description: "Past the start, building the base" },
          { value: "5to10", label: "5 to 10 years", description: "Established; growing, or stuck at a level" },
          { value: "over10", label: "Over 10 years", description: "Mature; the model that got you here may need renewing" },
        ],
      },
      {
        id: "p_type",
        kind: "single",
        prompt: "How does the business make money?",
        ideaPrompt: "How will the business make money?",
        options: [
          { value: "maker", label: "We make things: food, fashion, products, manufacturing" },
          { value: "trader", label: "We buy and sell things: retail, distribution, imports" },
          { value: "expert", label: "We sell expertise or a service: consulting, beauty, logistics, training" },
          { value: "mixed", label: "A mix, and I'm not sure which matters most" },
        ],
      },
      {
        id: "p_sector",
        kind: "select",
        prompt: "Which sector is it in?",
        // Values are stored identifiers ("services" predates the split into personal and professional services).
        options: [
          { value: "fashion", label: "Fashion" },
          { value: "food and drink", label: "Food and drink" },
          { value: "retail", label: "Retail" },
          { value: "professional services", label: "Professional services: consulting, legal, accounting, finance, brokerage" },
          { value: "services", label: "Personal services: beauty, events, cleaning, repairs" },
          { value: "oil, gas and mining", label: "Oil, gas and mining" },
          { value: "technology", label: "Technology" },
          { value: "real estate", label: "Real estate" },
          { value: "health", label: "Health" },
          { value: "education", label: "Education" },
          { value: "manufacturing", label: "Manufacturing" },
          { value: "agriculture", label: "Agriculture" },
          { value: "logistics", label: "Logistics" },
          { value: "other", label: "Other" },
        ],
      },
      {
        id: "p_description",
        kind: "text",
        prompt: "In one line, what does the business do?",
        ideaPrompt: "In one line, what is the idea?",
        help: "It helps us read your answers in the context of your business.",
        placeholder: "e.g. We make and supply school uniforms in Abuja",
        ideaPlaceholder: "e.g. Healthy lunch deliveries for offices in Lekki",
        maxLength: 300,
        options: [],
      },
      {
        id: "p_staff",
        kind: "single",
        prompt: "How many people work in it, including contract staff?",
        sidePrompt: "How many people work in the business, including contract staff?",
        showIf: notIdea,
        options: [
          { value: "0", label: "Just me" },
          { value: "1to2", label: "1 to 2" },
          { value: "3to5", label: "3 to 5" },
          { value: "6to10", label: "6 to 10" },
          { value: "11to20", label: "11 to 20" },
          { value: "21to50", label: "21 to 50" },
          { value: "over50", label: "More than 50" },
        ],
      },
      {
        id: "p_revenue",
        kind: "single",
        prompt: "In a typical month, how much comes in? (Revenue, not profit.)",
        sidePrompt: "In a typical month, how much does the side business bring in? (Revenue, not profit.)",
        showIf: notIdea,
        options: [
          { value: "under1m", label: "Under ₦1 million" },
          { value: "1to3m", label: "₦1 million to ₦3 million" },
          { value: "3to5m", label: "₦3 million to ₦5 million" },
          { value: "5to10m", label: "₦5 million to ₦10 million" },
          { value: "10to25m", label: "₦10 million to ₦25 million" },
          { value: "over25m", label: "More than ₦25 million" },
          { value: "unsure", label: "I'm not sure" },
        ],
      },
      {
        id: "p_trend",
        kind: "single",
        prompt: "Over the last 12 months, revenue has been…",
        showIf: notIdea,
        options: [
          { value: "growing", label: "Growing" },
          { value: "flat", label: "Flat, stuck at the same level" },
          { value: "declining", label: "Declining" },
          { value: "early", label: "Too early to tell" },
        ],
      },
    ],
  },

  founder: {
    id: "founder",
    area: 0,
    title: "Founder readiness",
    means: "Every business is limited by the person leading it. This section looks at how you work, what you know and how much time you have: your capacity, competence and exposure.",
    examples: {
      maker: "A caterer who is brilliant in the kitchen may still find it hard to chase a corporate client for payment.",
      trader: "A trader who can spot a deal anywhere may still lose track of what each sale really earns.",
      expert: "A gifted stylist may still struggle to manage and keep a team.",
      mixed: "Someone excellent at the work itself may still find selling, deciding alone or managing people the hard part.",
      idea: "Many people who do well in a job find that a business asks for different strengths: selling, deciding alone and living with uncertainty.",
      side: "Someone with a good job and a growing side business often finds the limit is time: the business only gets evenings and weekends, and decisions wait.",
    },
    questions: [
      {
        id: "f_instinct",
        kind: "single",
        prompt: "When something goes wrong in the business, what do you do first?",
        ideaPrompt: "When something goes wrong at work, what do you do first?",
        options: [
          { value: "D", label: "Take charge and push for a fix the same day" },
          { value: "I", label: "Get people talking and rally them around a solution" },
          { value: "S", label: "Calm things down and keep the work going" },
          { value: "C", label: "Find out exactly what went wrong before acting" },
        ],
      },
      {
        id: "f_seen",
        kind: "single",
        prompt: "Which would the people who work with you most likely say about you?",
        options: [
          { value: "D", label: "Direct and results-driven" },
          { value: "I", label: "Persuasive and full of energy" },
          { value: "S", label: "Patient and dependable" },
          { value: "C", label: "Careful and precise" },
        ],
      },
      {
        id: "f_team",
        kind: "single",
        prompt: "Who carries the business with you?",
        sidePrompt: "Who keeps the business going while you are at work?",
        ideaPrompt: "Who are you starting with?",
        options: [
          { value: "solo", label: "Mostly me" },
          { value: "cofounder", label: "A co-founder or business partner" },
          { value: "team", label: "A small management team" },
          { value: "family", label: "Family members help me run it" },
        ],
        ideaOptions: [
          { value: "solo", label: "On my own" },
          { value: "cofounder", label: "With a co-founder or partner" },
          { value: "team", label: "With a small team already lined up" },
        ],
      },
      {
        id: "f_tough",
        kind: "single",
        prompt: "When someone has to push hard (chase a debt, close a deal, let someone go), who does it?",
        help: "Every business needs someone who will make the hard call. It doesn't have to be you, but it has to be someone.",
        showIf: (answers) => answers.f_team === "solo" || answers.f_team === "family",
        options: [
          { value: "me_easy", label: "I do, and it comes naturally" },
          { value: "me_avoid", label: "I do, but I put it off" },
          { value: "nobody", label: "Honestly, it often doesn't happen" },
        ],
      },
      {
        id: "f_education",
        kind: "single",
        prompt: "What business training have you had?",
        options: [
          { value: "none", label: "None: I've learned by doing" },
          { value: "short", label: "Short courses or workshops" },
          { value: "degree", label: "A business degree, MBA or professional qualification" },
          { value: "corporate", label: "Years managing in a company before starting" },
        ],
      },
      {
        id: "f_finance",
        kind: "multi",
        prompt: "Which of these can you do confidently today?",
        help: "Choose all that apply. There is no wrong answer; this tells us where support would help most.",
        options: [
          { value: "pl", label: "Read a profit and loss statement" },
          { value: "cash", label: "Tell the difference between profit and cash" },
          { value: "unit", label: "Work out what one product or service costs you to deliver" },
          { value: "margin", label: "Know your margin on what you sell" },
          { value: "none", label: "None of these yet", exclusive: true },
        ],
      },
      {
        id: "f_hours",
        kind: "single",
        prompt: "How many hours a week can you give to working on the business, not just in it?",
        sidePrompt: "Alongside your job, how many hours a week can you give to working on the business, not just in it?",
        ideaPrompt: "Alongside everything else, how many hours a week can you give to building the business?",
        help: "Working on the business means planning, fixing and improving, rather than serving today's customers.",
        options: [
          { value: "lt2", label: "Less than 2" },
          { value: "2to4", label: "2 to 4" },
          { value: "5plus", label: "5 or more" },
        ],
      },
    ],
  },

  idea: {
    id: "idea",
    area: 1,
    title: "Strategic intent: your idea",
    means: "Before you start, strategic intent means being clear on who it is for, what you will sell first, and what it would take to begin.",
    examples: {
      maker: "A planned juice brand deciding whether to start with office deliveries or supermarket shelves.",
      trader: "A planned phone-accessories shop deciding whether to sell online first or rent a stall.",
      expert: "A planned bookkeeping service deciding whether to serve churches, schools or shops first.",
      mixed: "Most new businesses start by serving one group of customers well before widening out.",
    },
    questions: [
      {
        id: "i_customer",
        kind: "single",
        prompt: "How clear are you on who will buy first?",
        options: [
          { value: "named", label: "I can name my first customers", health: "clear" },
          { value: "rough", label: "I have a rough idea", health: "watch", gap: "clarity" },
          { value: "unclear", label: "Not yet", health: "stuck", gap: "clarity" },
        ],
      },
      {
        id: "i_offer",
        kind: "single",
        prompt: "What will you sell first?",
        options: [
          { value: "defined", label: "A specific product or service, with a price", health: "clear" },
          { value: "several", label: "A few options; I haven't chosen", health: "watch", gap: "strategy" },
          { value: "unsure", label: "I'm still working it out", health: "stuck", gap: "clarity" },
        ],
      },
      {
        id: "i_tested",
        kind: "single",
        prompt: "Have you tested it with real buyers?",
        options: [
          { value: "paid", label: "Yes: some have already paid", health: "clear" },
          { value: "talked", label: "I've talked to people who might buy", health: "watch", gap: "knowhow" },
          { value: "no", label: "Not yet", health: "stuck", gap: "knowhow" },
        ],
      },
      {
        id: "i_need",
        kind: "single",
        prompt: "What would it take to start in the next six months?",
        options: [
          { value: "have", label: "I have what I need to start", health: "clear" },
          { value: "money", label: "Mainly money", health: "watch", gap: "resources", offerings: ["funding"] },
          { value: "skills", label: "Mainly skills or know-how", health: "watch", gap: "knowhow" },
          { value: "people", label: "Mainly the right partner or people", health: "watch", gap: "resources" },
        ],
      },
    ],
  },

  intent: {
    id: "intent",
    area: 1,
    title: "Strategic intent",
    means: "Strategic intent is what the business is for, what it must become in the next three years, and the few priorities that will get it there.",
    examples: {
      maker: "A juice maker deciding whether to stay a local favourite or supply supermarkets in Lagos and Abuja.",
      trader: "A building-materials trader choosing between opening more branches and becoming a distributor.",
      expert: "A training firm deciding whether to grow by adding trainers or by selling courses online.",
      mixed: "A business that sells and also offers services, deciding which side to build first.",
    },
    questions: [
      {
        id: "s1_status",
        kind: "single",
        prompt: "Which is closest to the truth about where the business is going?",
        options: [
          { value: "clear", label: "I know where we're going in three years, and my week reflects it", health: "clear" },
          { value: "busy", label: "I'm busy every day, but I'm not sure where this is going", health: "stuck", gap: "clarity", offerings: ["growth-strategy"] },
          { value: "choices", label: "I have several ideas and can't choose between them", health: "stuck", gap: "strategy", offerings: ["growth-strategy"] },
          { value: "how", label: "I know where I want to go, but not how to get there", health: "watch", gap: "knowhow", offerings: ["growth-strategy", "implementation"] },
          { value: "means", label: "I know the way, but I don't have the money or people to get there", health: "watch", gap: "resources", offerings: ["funding"] },
          { value: "go_fulltime", label: "I'm deciding whether to leave my job and run the business full-time", health: "watch", gap: "strategy", offerings: ["feasibility", "growth-strategy"], stages: ["side"] },
        ],
      },
      {
        id: "s1_detail",
        kind: "single",
        prompt: "What does that look like day to day?",
        showIf: unclear("s1_status"),
        options: [
          { value: "yes_everything", label: "We say yes to every opportunity that comes", offerings: ["growth-strategy"] },
          { value: "partners_differ", label: "Partners or family members want different things", offerings: ["growth-strategy", "org-design"] },
          { value: "no_goals", label: "We have no written goals or numbers for the year", offerings: ["growth-strategy"] },
          { value: "firefighting", label: "There is a plan, but daily firefighting always wins", offerings: ["implementation", "embedded-support"] },
        ],
      },
    ],
  },

  market: {
    id: "market",
    area: 2,
    title: "Market and industry",
    means: "Knowing your market means knowing who buys, why they buy, and who else is competing for the same naira.",
    examples: {
      maker: "A cosmetics maker discovering that most repeat buyers are salons, not individual customers.",
      trader: "An electronics retailer finding that a rival two streets away undercuts them on their five best-sellers.",
      expert: "An accounting practice realising its best-paying clients are schools, not shops.",
      mixed: "A business finding that one customer group brings most of the profit while another brings most of the work.",
    },
    questions: [
      {
        id: "s2_status",
        kind: "single",
        prompt: "How well do you know your market?",
        options: [
          { value: "clear", label: "I know exactly who buys, why, and who I'm up against", health: "clear" },
          { value: "customers_only", label: "I know my customers, but little about competitors or the wider market", health: "watch", gap: "knowhow", offerings: ["research"] },
          { value: "anyone", label: "I sell to whoever comes; I couldn't describe my best customer", health: "stuck", gap: "clarity", offerings: ["research", "business-model"] },
          { value: "shifting", label: "The market is changing and I'm not sure where to focus", health: "stuck", gap: "strategy", offerings: ["research", "growth-strategy"] },
        ],
      },
      {
        id: "s2_detail",
        kind: "single",
        prompt: "Which would help you most?",
        showIf: unclear("s2_status"),
        options: [
          { value: "profitable", label: "Knowing which customers are actually profitable", offerings: ["research", "financial-performance"] },
          { value: "competitors", label: "Understanding competitors' prices and offers", offerings: ["research"] },
          { value: "new_segment", label: "Finding a new customer group or location to grow into", offerings: ["market-entry"] },
          { value: "demand", label: "Knowing whether demand is shrinking or moving", offerings: ["research"] },
        ],
      },
    ],
  },

  offer: {
    id: "offer",
    area: 3,
    title: "Service and offering",
    means: "Your offering is what you sell, to whom, and the promise behind it. People can like a product and still not buy enough of it.",
    examples: {
      maker: "A bakery whose bread is loved but whose cakes sit on the shelf.",
      trader: "A fabric shop stocking 200 designs when 20 bring in most of the sales.",
      expert: "A consultancy that does a bit of everything and struggles to say what it is best at.",
      mixed: "A business whose customers buy one thing and never notice the rest.",
    },
    questions: [
      {
        id: "s3_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "Customers understand what we sell and buy it readily", health: "clear" },
          { value: "like_not_buy", label: "People like what we do, but they don't buy enough of it", health: "stuck", gap: "clarity", offerings: ["business-model"] },
          { value: "too_many", label: "We sell too many things, and I'm not sure which to focus on", health: "stuck", gap: "strategy", offerings: ["business-model"] },
          { value: "package", label: "I know what should change, but not how to package or price it", health: "watch", gap: "knowhow", offerings: ["business-model"] },
          { value: "develop", label: "We need new products but can't afford to develop them", health: "watch", gap: "resources", offerings: ["feasibility", "funding"] },
        ],
      },
      {
        id: "s3_detail",
        kind: "single",
        prompt: "Where does the offer fall short?",
        showIf: unclear("s3_status"),
        options: [
          { value: "range", label: "Too many products or services", offerings: ["business-model"] },
          { value: "why_us", label: "Customers don't see why we're better", offerings: ["business-model", "research"] },
          { value: "price_value", label: "The price doesn't match the value", offerings: ["business-model", "financial-performance"] },
          { value: "new", label: "We need a new product or service", offerings: ["feasibility", "market-entry"] },
        ],
      },
    ],
  },

  model: {
    id: "model",
    area: 4,
    title: "Business model",
    means: "Your business model is how value is made, delivered and paid for, and whether each line actually leaves you a margin.",
    examples: {
      maker: "A bakery can sell 300 loaves a day and still lose money if flour, diesel and wages cost more than the price per loaf.",
      trader: "A phone-accessories shop can sell out every week and still earn little if the margin on each item is thin.",
      expert: "A design studio can be fully booked and still struggle if every job is priced as a one-off.",
      mixed: "A business can grow its sales every year while the profitable part quietly shrinks.",
    },
    questions: [
      {
        id: "s4_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "I know which products or services make money, and our margins are healthy", health: "clear" },
          { value: "no_money", label: "Money comes in, but the business still doesn't make money", health: "stuck", gap: "clarity", offerings: ["business-model", "financial-performance"] },
          { value: "suspect", label: "I suspect some lines lose money, but I can't prove which", health: "watch", gap: "knowhow", offerings: ["financial-performance"] },
          { value: "stopped", label: "We're stuck at the same level; the old way of making money has stopped working", health: "stuck", gap: "strategy", offerings: ["business-model", "business-transformation"] },
        ],
      },
      {
        id: "s4_detail",
        kind: "single",
        prompt: "Which sounds most like you?",
        showIf: unclear("s4_status"),
        options: [
          { value: "price_feel", label: "Prices are set by feel, or by copying competitors", offerings: ["business-model", "financial-performance"] },
          { value: "concentration", label: "One or two customers make up most of our revenue", offerings: ["business-model"] },
          { value: "costs_up", label: "Costs have risen faster than our prices", offerings: ["commercial-performance", "financial-performance"] },
          { value: "what_business", label: "I'm no longer sure what business we're really in", offerings: ["business-model", "growth-strategy"] },
        ],
      },
    ],
  },

  sales: {
    id: "sales",
    area: 5,
    title: "Market entry and sales",
    means: "This is your route to market: how customers find you, how interest becomes a sale, and how you launch something new.",
    examples: {
      maker: "A shoe maker relying on Instagram messages, with no way to follow up everyone who asked for a price.",
      trader: "A wholesaler whose sales depend on the owner phoning the same ten buyers.",
      expert: "A clinic that gets patients by word of mouth only, and has quiet months with no warning.",
      mixed: "A business that gets plenty of enquiries but converts few of them into paying customers.",
    },
    questions: [
      {
        id: "s5_status",
        kind: "single",
        prompt: "How do new customers come in?",
        options: [
          { value: "clear", label: "Steadily, and I know where each new customer came from", health: "clear" },
          { value: "inconsistent", label: "I don't know how to get customers consistently", health: "stuck", gap: "clarity", offerings: ["market-entry", "commercial-performance"] },
          { value: "word_of_mouth", label: "Word of mouth works, but I don't know how to build anything more reliable", health: "watch", gap: "knowhow", offerings: ["market-entry"] },
          { value: "no_capacity", label: "I know what would work, but we lack the people or budget to do it", health: "watch", gap: "resources", offerings: ["workforce", "implementation"] },
          { value: "launch", label: "We're launching something new and I'm not sure how to take it to market", health: "stuck", gap: "strategy", offerings: ["market-entry"] },
        ],
      },
      {
        id: "s5_detail",
        kind: "single",
        prompt: "Where do sales break down?",
        showIf: unclear("s5_status"),
        options: [
          { value: "awareness", label: "Not enough people hear about us", offerings: ["market-entry"] },
          { value: "conversion", label: "People enquire but don't buy", offerings: ["commercial-performance", "business-model"] },
          { value: "repeat", label: "Customers buy once and don't come back", offerings: ["business-model", "commercial-performance"] },
          { value: "founder_sells", label: "Sales depend on me personally", offerings: ["workforce", "operating-model"] },
        ],
      },
    ],
  },

  operations: {
    id: "operations",
    area: 6,
    title: "Operations and people",
    means: "Operations and people covers how the work gets done day to day: processes, roles, hiring, and who can decide what without you.",
    examples: {
      maker: "A garment factory where only the owner knows how to price a new order.",
      trader: "A supermarket where the stock count never matches the books.",
      expert: "A salon that runs smoothly only on the days the owner is in.",
      mixed: "A business where every question from staff ends up on the owner's phone.",
    },
    questions: [
      {
        id: "s6_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "The business runs well even when I'm not there", health: "clear" },
          { value: "only_me", label: "Nothing moves unless I'm there", health: "stuck", gap: "knowhow", offerings: ["operating-model", "org-design"] },
          { value: "staff", label: "I can't find or keep good staff", health: "stuck", gap: "resources", offerings: ["workforce"] },
          { value: "no_process", label: "We have staff, but no clear processes or job roles", health: "watch", gap: "knowhow", offerings: ["operating-model", "workflow"] },
          { value: "outgrown", label: "We're growing faster than our systems can handle", health: "watch", gap: "strategy", offerings: ["operating-model", "automation"] },
        ],
      },
      {
        id: "s6_detail",
        kind: "single",
        prompt: "What hurts most?",
        showIf: unclear("s6_status"),
        options: [
          { value: "hiring", label: "Hiring and keeping the right people", offerings: ["workforce"] },
          { value: "decisions", label: "Staff wait for me to decide everything", offerings: ["org-design", "performance-culture"] },
          { value: "repeat_errors", label: "The same mistakes and delays keep repeating", offerings: ["workflow", "performance-culture"] },
          { value: "manual", label: "Too much is done by hand or on paper", offerings: ["workflow", "automation"] },
        ],
      },
    ],
  },

  finance: {
    id: "finance",
    area: 7,
    title: "Financials",
    means: "Financials covers your prices, your cost per unit, your cash, and the numbers that tell you whether you're winning. Profit and cash are not the same thing.",
    examples: {
      maker: "A food processor that is profitable on paper but can't pay suppliers because customers pay in 60 days.",
      trader: "A trader who prices by adding ₦500 to cost without counting transport, damage and losses.",
      expert: "A consultant paid late on every invoice who borrows each month to cover salaries.",
      mixed: "A business that can't say which of its activities actually pays the bills.",
    },
    questions: [
      {
        id: "s7_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "I know my numbers: margins, cash, and what's coming in next month", health: "clear" },
          { value: "tight_guess", label: "Cash is always tight and my prices are guesses", health: "stuck", gap: "clarity", offerings: ["financial-performance"] },
          { value: "records_unused", label: "We keep records, but I don't use them to make decisions", health: "watch", gap: "knowhow", offerings: ["financial-performance"] },
          { value: "funding", label: "We need funding to grow, and I don't know how to get ready for it", health: "stuck", gap: "resources", offerings: ["funding"] },
        ],
      },
      {
        id: "s7_detail",
        kind: "single",
        prompt: "What is the biggest money worry?",
        showIf: unclear("s7_status"),
        options: [
          { value: "late_payers", label: "Customers pay late", offerings: ["financial-performance"] },
          { value: "unit_cost", label: "I don't know my true cost per product or service", offerings: ["financial-performance", "business-model"] },
          { value: "mixed_money", label: "Personal and business money are mixed", offerings: ["financial-performance"] },
          { value: "loan", label: "We need a loan or investment", offerings: ["funding"] },
        ],
      },
    ],
  },

  risk: {
    id: "risk",
    area: 8,
    title: "Risk and compliance",
    means: "Risk and compliance is about what could seriously hurt the business, such as tax, regulation, losing a key person or a bad month, and the controls and cover you have against it.",
    examples: {
      maker: "A food business selling well without NAFDAC registration for its best product.",
      trader: "A distributor whose entire stock sits uninsured in one warehouse.",
      expert: "A firm where one senior person holds every key client relationship.",
      mixed: "A business that has never checked which taxes and levies it actually owes.",
    },
    questions: [
      {
        id: "s8_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "Our taxes, registrations and key risks are under control", health: "clear" },
          { value: "fragile", label: "One tax visit, one resignation or one bad month could end this", health: "stuck", gap: "clarity", offerings: ["org-design", "financial-performance"] },
          { value: "where_start", label: "I know we're exposed in places, but not where to start", health: "watch", gap: "knowhow", offerings: ["org-design"] },
          { value: "cant_afford", label: "We know what's needed but can't afford it yet", health: "watch", gap: "resources", offerings: ["financial-performance"] },
        ],
      },
      {
        id: "s8_detail",
        kind: "single",
        prompt: "What worries you most?",
        showIf: unclear("s8_status"),
        options: [
          { value: "tax", label: "Tax and regulatory paperwork", offerings: ["org-design"] },
          { value: "key_person", label: "Losing a key person", offerings: ["workforce", "org-design"] },
          { value: "insurance", label: "No insurance or backup for stock and equipment", offerings: ["financial-performance"] },
          { value: "contracts", label: "Contracts with customers or suppliers", offerings: ["org-design"] },
        ],
      },
    ],
  },

  exit: {
    id: "exit",
    area: 9,
    title: "Exit and value",
    means: "Exit and value asks what the business is worth, and whether it could run, raise money or be sold without you.",
    examples: {
      maker: "A bakery chain whose recipes and supplier deals exist only in the owner's head.",
      trader: "A trading company with strong sales but no accounts an investor could trust.",
      expert: "A practice worth little to a buyer because clients come for the founder personally.",
      mixed: "A profitable business that would be hard to value because nothing is written down.",
    },
    questions: [
      {
        id: "s9_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "I know roughly what the business is worth and what drives that value", health: "clear" },
          { value: "never", label: "I've never thought about what it's worth", health: "watch", gap: "clarity", offerings: ["transactions"] },
          { value: "prepare", label: "I'd like to raise money or sell one day, but don't know how to prepare", health: "watch", gap: "knowhow", offerings: ["funding", "transactions"] },
          { value: "decide_soon", label: "An investor, buyer or successor is interested and I need to decide soon", health: "stuck", gap: "strategy", offerings: ["transactions"] },
        ],
      },
    ],
  },

  transition: {
    id: "transition",
    area: 10,
    title: "Owner transition",
    means: "Owner transition is about you after the business: stepping back, handing over, and leading what you've built in a different way.",
    examples: {
      maker: "A founder of 15 years who wants to step back from the factory floor but is called for every decision.",
      trader: "A trader whose children may take over, with no plan for how or when.",
      expert: "A senior professional whose clients still ask for them by name after 20 years.",
      mixed: "A founder who has built something lasting and now wants a different role in it.",
    },
    questions: [
      {
        id: "s10_status",
        kind: "single",
        prompt: "Which is closest?",
        options: [
          { value: "clear", label: "I have a succession or handover plan in place", health: "clear" },
          { value: "who_am_i", label: "Who am I after this business? I haven't worked it out", health: "watch", gap: "clarity", offerings: ["org-design"] },
          { value: "how_handover", label: "I want to step back but don't know how to hand over", health: "watch", gap: "knowhow", offerings: ["org-design", "performance-culture"] },
          { value: "no_successor", label: "There is no one ready to take over", health: "stuck", gap: "resources", offerings: ["workforce", "org-design"] },
        ],
      },
    ],
  },
};

/** Labels for the problem areas on the business outline (concept note, section 6). */
export const AREA_NAMES: Record<number, string> = {
  0: "Founder readiness",
  1: "Strategic intent",
  2: "Market and industry",
  3: "Service and offering",
  4: "Business model",
  5: "Market entry and sales",
  6: "Operations and people",
  7: "Financials",
  8: "Risk and compliance",
  9: "Exit and value",
  10: "Owner transition",
};

export const GAP_LABELS: Record<Gap, { name: string; meaning: string }> = {
  clarity: { name: "Clarity", meaning: "It isn't yet clear what is really wrong, or what good would look like." },
  strategy: { name: "Strategy", meaning: "The options are visible, but the choices haven't been made, so effort is spread too thin." },
  knowhow: { name: "Know-how", meaning: "You know what needs to happen, but not yet how to do it well." },
  resources: { name: "Resources", meaning: "You know what to do and how, but lack the people, time or money to get it done." },
};
