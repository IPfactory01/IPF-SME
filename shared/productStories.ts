/**
 * How each product is told on its page (/services/:slug): the promise, a sample of what the owner gets, the features,
 * who it is and is not for, and the questions owners ask. The layout follows the store design ET approved on
 * 22 October 2026: one product per page, the deliverable shown as the hero, price and Buy always in reach.
 *
 * Every figure in a visual is a SAMPLE for a fictional business and is labelled as one on the page. Product facts
 * (price, delivery, intake, next product) stay in shared/products.ts; this file only tells the story.
 */

/** A picture of the work, drawn from data. One renderer per kind (client/src/components/store/StoryVisual.tsx). */
export type StoryVisual =
  | { kind: "line"; title: string; unit: string; labels: readonly string[]; values: readonly number[]; callout: string }
  | { kind: "bars"; title: string; legend: readonly [string, string]; groups: readonly { label: string; values: readonly [number, number] }[]; highlight?: number; note?: string }
  | { kind: "table"; title: string; columns: readonly string[]; rows: readonly (readonly string[])[]; highlight?: readonly number[] }
  | { kind: "checklist"; title: string; items: readonly { label: string; state: "ready" | "nearly" | "missing"; note?: string }[]; score?: number }
  | { kind: "moves"; title: string; rows: readonly { tag: string; text: string; value: string }[] }
  | { kind: "timeline"; title: string; items: readonly { when: string; title: string; detail?: string }[] }
  | { kind: "measure"; title: string; unit: string; baseline: number; target: number; readings: readonly number[] };

/** The small drawing on the product's tile and order summary (client/src/components/store/ProductArt.tsx). */
export type ArtKind = "check" | "report" | "forecast" | "ledger" | "pricing" | "plan" | "funding" | "hiring" | "readiness" | "review" | "fix" | "monthly" | "adviser";

export type ProductStory = {
  art: ArtKind;
  /** The tile's one line. */
  promise: string;
  /** The page headline: a plain line, then the line set in the brand gradient. */
  headline: readonly [string, string];
  sub: string;
  stage: StoryVisual;
  /** One big sentence: the strong half, then the quieter half. */
  statement: readonly [string, string];
  features: readonly { eyebrow: string; title: string; body: string; visual: StoryVisual }[];
  forYou: readonly string[];
  /** Who should start elsewhere, and where. */
  notForYou: readonly { text: string; productId?: string }[];
  faq: readonly { q: string; a: string }[];
  closer: string;
};

const NOT_ADVICE = "It is management work built from your own records. It is not an audit, tax advice or legal advice.";

export const PRODUCT_STORIES: Record<string, ProductStory> = {
  business_health_check: {
    art: "check",
    promise: "Ten minutes. Where your business is stuck, and where to start.",
    headline: ["Where is your business stuck?", "Find out in ten minutes."],
    sub: "Answer on your phone. Get a read of your business, area by area, and the first step that fits.",
    stage: { kind: "table", title: "Your business outline", columns: ["Area", "Reading"], rows: [["Strategic intent", "Clear"], ["Sales", "Watch"], ["Operations and people", "Stuck"], ["Financials", "Stuck"], ["Risk and compliance", "Watch"]], highlight: [2, 3] },
    statement: ["Most owners can feel the problem.", "Few can name it."],
    features: [
      { eyebrow: "In your words", title: "A summary of what your answers show.", body: "What we found, what we think it is, and why, written for your business and your sector.", visual: { kind: "checklist", title: "What the check reads", items: [{ label: "You as a founder", state: "ready" }, { label: "Your offer and your customers", state: "nearly" }, { label: "Your numbers", state: "missing" }, { label: "How the business runs", state: "nearly" }] } },
      { eyebrow: "Your first step", title: "The product that fits first, and the one after it.", body: "No pitch for everything at once. One place to start, with its price and its delivery time.", visual: { kind: "moves", title: "Sample result", rows: [{ tag: "First", text: "13-Week Cash Flow Forecast", value: "₦300,000" }, { tag: "Then", text: "Six-Week Fix: Cash and Pricing", value: "₦1,500,000" }] } },
    ],
    forYou: ["You can feel something is wrong but cannot name it", "You want to know where to start before you spend", "You have ten minutes and a phone"],
    notForYou: [],
    faq: [
      { q: "Is it really free?", a: "Yes. No card, no account. You get your result on screen and by email." },
      { q: "What happens to my answers?", a: "They are saved as you go so you can pick up where you left off, and so our team can follow up. We never sell them." },
    ],
    closer: "Ten minutes to know where to start.",
  },

  full_report: {
    art: "report",
    promise: "Your Business Health Check in depth, with what to fix first.",
    headline: ["Your check told you where.", "This tells you what to do."],
    sub: "Every area of your outline in depth, the root cause behind each red and amber, and what to fix first, in order.",
    stage: { kind: "table", title: "Sample: what to fix first", columns: ["Order", "Fix", "Measure of Success"], rows: [["1", "Price the three main lines from true cost", "Gross margin above 35%"], ["2", "Collect debts over 45 days", "Cash cover of four weeks"], ["3", "Hand the daily close to a supervisor", "Owner hours freed each week"]] },
    statement: ["A list of problems is not a plan.", "An order to fix them in is."],
    features: [
      { eyebrow: "Root causes", title: "Why each area is red or amber.", body: "Your answers, read together, so you see how one problem feeds the next.", visual: { kind: "checklist", title: "Sample root causes", items: [{ label: "Prices set by copying competitors", state: "missing" }, { label: "No weekly view of cash", state: "missing" }, { label: "Sales depend on the owner", state: "nearly" }] } },
      { eyebrow: "In order", title: "What to fix first, with the number to watch.", body: "Each fix with its Measure of Success, so you know when it has worked.", visual: { kind: "measure", title: "Sample: gross margin, the number to watch", unit: "%", baseline: 22, target: 35, readings: [22, 24, 27, 29, 31, 34] } },
    ],
    forYou: ["You have taken the free Business Health Check", "You want the detail behind your result before you decide anything", "You want a plan you can work from yourself"],
    notForYou: [{ text: "You want us to do the work. Start with the product your check named.", productId: undefined }],
    faq: [
      { q: "How do I get it?", a: "Take the free Business Health Check. The Full Report is offered at the end; after paying you answer a short Report Intake and the report is emailed the moment you finish." },
      { q: "Is a person involved?", a: "The report is built by fixed rules from your answers, so the same answers always give the same report. It is not reviewed by hand before it reaches you." },
    ],
    closer: "Know what to fix first.",
  },

  funding_readiness_assessment: {
    art: "readiness",
    promise: "Will the lender say yes? Find out first.",
    headline: ["Will the lender say yes?", "Find out first."],
    sub: "A readiness score against what lenders such as LSETF and the Bank of Industry ask for, and the gaps to close before you apply.",
    stage: { kind: "checklist", title: "Sample readiness check", score: 64, items: [{ label: "Six months of business bank statements", state: "ready" }, { label: "CAC certificate and status report", state: "ready" }, { label: "Tax identification number", state: "nearly", note: "Personal TIN only" }, { label: "Cash flow forecast for the loan period", state: "missing" }, { label: "Business and personal money separated", state: "missing" }] },
    statement: ["A refusal costs you months.", "Knowing first costs three days."],
    features: [
      { eyebrow: "Scored", title: "Where you stand, item by item.", body: "Every document and number the lender asks for, marked ready, nearly there, or missing.", visual: { kind: "checklist", title: "Sample: documents", items: [{ label: "Business plan in the lender's format", state: "missing" }, { label: "Two guarantors", state: "nearly" }, { label: "Utility bill for the premises", state: "ready" }] } },
      { eyebrow: "In order", title: "What to fix, and how long it takes.", body: "The gaps in the order that matters, so you apply once, properly.", visual: { kind: "moves", title: "Sample: before you apply", rows: [{ tag: "First", text: "Build a 12-month cash forecast", value: "1 week" }, { tag: "Then", text: "Open a separate business account", value: "2 weeks" }, { tag: "Then", text: "Register the business TIN", value: "1 week" }] } },
    ],
    forYou: ["A lender window is open, or about to be", "You are not sure your records would pass", "You want to apply once, properly"],
    notForYou: [{ text: "You know you are ready and need the application itself. See the Funding Application Pack.", productId: "funding_application_pack" }],
    faq: [
      { q: "Which lenders do you check against?", a: "The lender or programme you name, such as LSETF or the Bank of Industry, against its published checklist." },
      { q: "Does a good score mean I get the loan?", a: "No. The lender decides. A good score means your application will not fail on missing documents or numbers." },
      { q: "What if I then want the pack?", a: "The Funding Application Pack prepares the application itself." },
    ],
    closer: "Apply once. Apply ready.",
  },

  business_review: {
    art: "review",
    promise: "Two weeks to find the one problem to fix first.",
    headline: ["Several things are wrong.", "Find the one to fix first."],
    sub: "Two weeks and two Sessions that test your whole business: your numbers, how it runs, and your market.",
    stage: { kind: "timeline", title: "Your two weeks", items: [{ when: "Days 1 to 3", title: "Getting set up", detail: "Your team named, your Data Requests sent, both Sessions booked" }, { when: "Week 1", title: "Session 1", detail: "Your numbers and how the business runs" }, { when: "Week 2", title: "Session 2", detail: "Your market, then the one problem to fix first" }, { when: "End of week 2", title: "Findings and the Prescription", detail: "What to do, who owns it, by when" }] },
    statement: ["Fixing everything at once fixes nothing.", "One problem, named in your words, is where it starts."],
    features: [
      { eyebrow: "Tested together", title: "Numbers, operations and market, in one view.", body: "Not ten separate opinions. One reading of the whole business, so you see how the problems connect.", visual: { kind: "table", title: "Sample Findings", columns: ["Area", "Reading"], rows: [["Financials", "Stuck"], ["Operations and people", "Stuck"], ["Sales", "Watch"], ["Market", "Clear"]], highlight: [0, 1] } },
      { eyebrow: "The Prescription", title: "What to do, who owns it, by when.", body: "The first steps and the tools, so the work starts the week after.", visual: { kind: "moves", title: "Sample Prescription", rows: [{ tag: "Week 1", text: "Price the top three lines from true cost", value: "Owner" }, { tag: "Week 2", text: "Weekly cash view every Monday", value: "Accountant" }, { tag: "Week 3", text: "Supervisor runs the daily close", value: "Supervisor" }] } },
    ],
    forYou: ["Several things are wrong at once", "You are not sure which to fix first", "You can give two Sessions of 90 minutes"],
    notForYou: [{ text: "You already know the one problem. Go straight to a Six-Week Fix.", productId: "six_week_fix" }],
    faq: [
      { q: "How does it start?", a: "With a free 20-minute Discovery Call. If the Business Review fits, we send your payment link after it." },
      { q: "What do I send you?", a: "A short list of Data Requests: usually bank statements, sales records and your main costs. Each has a date." },
      { q: "What happens after?", a: "Most owners go on to a Six-Week Fix on the problem the review names. You decide." },
    ],
    closer: "Two weeks to know where to start.",
  },

  strategy_90_day_plan: {
    art: "plan",
    promise: "Three priorities. Ninety days. One plan.",
    headline: ["Three priorities.", "Ninety days. One plan."],
    sub: "Where the business is going, what to stop, and a 90-day plan of who does what, by when.",
    stage: { kind: "timeline", title: "Sample 90-day plan", items: [{ when: "Priority 1", title: "Win back repeat customers", detail: "Number to watch: repeat sales each month" }, { when: "Priority 2", title: "Stop the two lines that lose money", detail: "Number to watch: gross margin" }, { when: "Priority 3", title: "Hire a supervisor for the second outlet", detail: "Number to watch: owner hours on the floor" }, { when: "Day 90", title: "Review and reset", detail: "What moved, what did not, what is next" }] },
    statement: ["Busy every day is not a strategy.", "Three priorities is."],
    features: [
      { eyebrow: "Direction", title: "What to start, stop and keep.", body: "The choices behind the plan, so you can say no to what does not fit.", visual: { kind: "moves", title: "Sample choices", rows: [{ tag: "Start", text: "A loyalty offer for weekly customers", value: "Month 1" }, { tag: "Stop", text: "Weekend catering under ₦200,000", value: "Now" }, { tag: "Keep", text: "Corporate lunch contracts", value: "Grow" }] } },
      { eyebrow: "Ninety days", title: "Who does what, by when.", body: "Week by week, with an owner for every action and a number for every priority.", visual: { kind: "table", title: "Sample weeks", columns: ["Week", "Action", "Owner"], rows: [["1", "Call the top 20 past customers", "Owner"], ["2", "Drop the two loss-making lines", "Owner"], ["4", "Advertise the supervisor role", "Manager"], ["6", "First repeat-sales reading", "Manager"]] } },
    ],
    forYou: ["You are busy every day and not sure where it is going", "You have more ideas than time", "You want a plan your team can follow"],
    notForYou: [{ text: "You want someone to check your thinking every month. See the Monthly Adviser Review.", productId: "monthly_adviser_review" }],
    faq: [
      { q: "Do you write the plan, or do I?", a: "We do, from your records and your answers. You check it with us on a 30-minute handover call." },
      { q: "What if things change in the 90 days?", a: "The plan says what to watch and when to review. Thirty days on, we check in." },
    ],
    closer: "Know what the next 90 days are for.",
  },

  pricing_unit_cost_review: {
    art: "pricing",
    promise: "Know what every product really earns.",
    headline: ["Know what every product", "really earns."],
    sub: "The true cost of each product or service, the margin on each, and new prices to test, with what each change is worth.",
    stage: { kind: "bars", title: "Sample: price and true cost per unit (₦)", legend: ["True cost", "Price"], groups: [{ label: "Tray of jollof", values: [14500, 18000] }, { label: "Small chops pack", values: [6200, 5800] }, { label: "Meat pie (dozen)", values: [4100, 6000] }, { label: "Event buffet (head)", values: [7300, 9500] }], highlight: 1, note: "Small chops lose ₦400 on every pack." },
    statement: ["Revenue went up last year.", "Did profit?"],
    features: [
      { eyebrow: "True cost", title: "What each product costs you, all in.", body: "Ingredients, packaging, transport, wastage and the share of rent and salaries, per unit.", visual: { kind: "table", title: "Sample margins", columns: ["Product", "Price", "True cost", "Margin"], rows: [["Tray of jollof", "₦18,000", "₦14,500", "19%"], ["Small chops pack", "₦5,800", "₦6,200", "−7%"], ["Meat pie (dozen)", "₦6,000", "₦4,100", "32%"]], highlight: [1] } },
      { eyebrow: "New prices", title: "What to charge, and what it is worth.", body: "Prices to test, line by line, with the extra profit each would bring at today's volumes.", visual: { kind: "moves", title: "Sample changes", rows: [{ tag: "Raise", text: "Small chops pack to ₦6,900", value: "+₦176,000/month" }, { tag: "Raise", text: "Tray of jollof to ₦19,500", value: "+₦240,000/month" }, { tag: "Drop", text: "Single meat pies", value: "+₦60,000/month" }] } },
    ],
    forYou: ["Your prices are set by feel or by copying competitors", "Costs have risen faster than your prices", "You suspect some lines lose money but cannot prove which"],
    notForYou: [{ text: "Your records are months behind. Start with the Bookkeeping Catch-Up.", productId: "bookkeeping_catch_up" }],
    faq: [
      { q: "Why does it start with a call?", a: "Above ₦500,000 we talk first for 20 minutes, so you only buy what fits. We send your payment link after the call." },
      { q: "Will you change my prices for me?", a: "We recommend prices to test and what each is worth. You decide what to charge." },
      { q: "Is this financial advice?", a: NOT_ADVICE },
    ],
    closer: "Price from the numbers, not from the competition.",
  },

  bookkeeping_catch_up: {
    art: "ledger",
    promise: "Books up to date. Numbers you can trust.",
    headline: ["Books up to date.", "Numbers you can trust."],
    sub: "Every transaction sorted and matched to your bank, and management accounts for every month.",
    stage: { kind: "table", title: "Sample management accounts", columns: ["Month", "Income", "Costs", "Profit"], rows: [["July", "₦6.8m", "₦6.1m", "₦0.7m"], ["August", "₦7.4m", "₦7.9m", "−₦0.5m"], ["September", "₦8.1m", "₦7.0m", "₦1.1m"]], highlight: [1] },
    statement: ["You cannot fix what you cannot see.", "It starts with the books."],
    features: [
      { eyebrow: "Every transaction", title: "Sorted and matched to your bank.", body: "Each payment in and out categorised, and reconciled to your statements, so nothing is missing or counted twice.", visual: { kind: "checklist", title: "Sample reconciliation", items: [{ label: "Access Bank current account, July to September", state: "ready" }, { label: "POS settlements matched to sales", state: "ready" }, { label: "Three supplier payments without invoices", state: "nearly", note: "Queried with you" }] } },
      { eyebrow: "Business and personal", title: "Separated, so the profit is real.", body: "Personal spending taken out of the business figures, so the profit you see is the profit you made.", visual: { kind: "moves", title: "Sample adjustments", rows: [{ tag: "Moved out", text: "School fees paid from the business account", value: "₦850,000" }, { tag: "Moved out", text: "Family car fuel", value: "₦120,000" }, { tag: "Moved in", text: "Sales paid into a personal account", value: "₦410,000" }] } },
    ],
    forYou: ["Your records are months behind", "Business and personal money are mixed", "You need numbers you can show a lender or a partner"],
    notForYou: [{ text: "You want this every month from now on. See Monthly Accounts and Cash Report.", productId: "monthly_accounts" }],
    faq: [
      { q: "Are these my statutory accounts?", a: "No. They are management accounts: the numbers you run the business on. We do not prepare statutory accounts or file tax returns." },
      { q: "How far back can you go?", a: "Up to twelve months in one order. You choose how many months when you buy." },
      { q: "What if I have no receipts?", a: "Bank statements are enough to start. We ask about anything we cannot place." },
    ],
    closer: "Know your numbers again.",
  },

  cash_flow_forecast: {
    art: "forecast",
    promise: "See the cash crunch before it comes.",
    headline: ["See the cash crunch", "before it comes."],
    sub: "Your next 13 weeks of cash, week by week, built from your own bank statements.",
    stage: { kind: "line", title: "Sample: closing cash, week by week", unit: "₦m", labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11", "W12", "W13"], values: [4.2, 3.8, 3.1, 2.6, 2.0, 0.9, -1.2, -0.4, 0.8, 1.6, 2.3, 2.9, 3.5], callout: "Week 7: ₦1.2m short" },
    statement: ["Profit says you are fine.", "The bank balance says week 7."],
    features: [
      { eyebrow: "Week by week", title: "Every naira in. Every naira out.", body: "Sales, supplier payments, salaries, rent and loan repayments, laid out for 13 weeks. From your statements, not guesses.", visual: { kind: "table", title: "Sample weeks", columns: ["Week", "In", "Out", "Closing"], rows: [["W5", "₦3.1m", "₦3.7m", "₦2.0m"], ["W6", "₦2.4m", "₦3.5m", "₦0.9m"], ["W7", "₦1.9m", "₦4.0m", "−₦1.2m"], ["W8", "₦3.6m", "₦2.8m", "−₦0.4m"], ["W9", "₦3.9m", "₦2.7m", "₦0.8m"]], highlight: [2, 3] } },
      { eyebrow: "What to do about it", title: "Four ways to close the gap.", body: "For every week you run short: who to collect from, what to delay, what to cut and what to fund, with the naira each one is worth.", visual: { kind: "moves", title: "Sample actions", rows: [{ tag: "Collect", text: "Chase the two invoices over 45 days", value: "+₦1.4m" }, { tag: "Delay", text: "Move the supplier payment to week 9", value: "+₦0.8m" }, { tag: "Cut", text: "Pause the second delivery van for six weeks", value: "+₦0.3m" }, { tag: "Fund", text: "A short overdraft for weeks 7 and 8 only", value: "the rest" }] } },
    ],
    forYou: ["Cash is always tight, even in good months", "Customers pay late and suppliers will not wait", "You want to see a bad month coming, not live through it"],
    notForYou: [{ text: "Your records are months behind. Start with the Bookkeeping Catch-Up.", productId: "bookkeeping_catch_up" }, { text: "You need a loan application. See the Funding Application Pack.", productId: "funding_application_pack" }],
    faq: [
      { q: "Do I need proper books first?", a: "No. Bank statements are enough to build the forecast. If they show your books are far behind, we will tell you." },
      { q: "Who sees my bank statements?", a: "Only the analyst preparing your forecast and the consultant who checks it. Uploads go into private storage, not email." },
      { q: "Is this financial advice?", a: NOT_ADVICE },
    ],
    closer: "Know your next 13 weeks.",
  },

  funding_application_pack: {
    art: "funding",
    promise: "Apply with the plan the lender asks for.",
    headline: ["Apply with the plan", "the lender asks for."],
    sub: "The business plan, forecasts and documents your lender asks for, built from your records and checked against their list.",
    stage: { kind: "checklist", title: "Sample: the lender's checklist", items: [{ label: "Simplified business plan in the lender's format", state: "ready" }, { label: "12-month cash flow and profit forecast", state: "ready" }, { label: "Six months of bank statements", state: "ready" }, { label: "CAC documents and TIN", state: "ready" }, { label: "Guarantor forms", state: "nearly", note: "For you to sign" }] },
    statement: ["Lenders do not read stories.", "They read checklists."],
    features: [
      { eyebrow: "In their format", title: "The plan, the way the lender asks for it.", body: "Section by section in the lender's own template, so nothing is missing and nothing is in the wrong place.", visual: { kind: "table", title: "Sample plan sections", columns: ["Section", "Status"], rows: [["The business and its owners", "Done"], ["Market and customers", "Done"], ["Use of the loan", "Done"], ["Repayment from cash flow", "Done"]] } },
      { eyebrow: "From your records", title: "Forecasts a lender will believe.", body: "Built from your bank statements, so every figure can be traced, and showing the loan repaid from the business's own cash.", visual: { kind: "measure", title: "Sample: monthly cash after repayment (₦m)", unit: "m", baseline: 0.6, target: 1.5, readings: [0.6, 0.8, 0.9, 1.1, 1.3, 1.6] } },
    ],
    forYou: ["You are applying for a loan or grant with a deadline", "You have, or are ready to gather, your records", "You want the application right the first time"],
    notForYou: [{ text: "You are not sure you are ready. Start with the Funding Readiness Assessment.", productId: "funding_readiness_assessment" }],
    faq: [
      { q: "Do you guarantee the loan?", a: "No. The lender decides. We make sure the application is complete, consistent and built from your real numbers." },
      { q: "Why does it start with a call?", a: "Above ₦500,000 we talk first for 20 minutes, to check the lender, the deadline and your records. We send your payment link after the call." },
      { q: "When does the ten days start?", a: "When your records are complete. We confirm the date within one working day." },
    ],
    closer: "Apply ready, on time.",
  },

  hiring_toolkit: {
    art: "hiring",
    promise: "Hire right the first time.",
    headline: ["Hire right", "the first time."],
    sub: "The role, the interview, the offer and the first 90 days, ready for the hire you are about to make.",
    stage: { kind: "table", title: "Sample interview scorecard: outlet supervisor", columns: ["What we look for", "Weight", "Score"], rows: [["Runs a shift without the owner", "30%", "4 / 5"], ["Handles cash and the daily close", "25%", "5 / 5"], ["Leads and corrects staff", "25%", "3 / 5"], ["Customer complaints", "20%", "4 / 5"]] },
    statement: ["A wrong hire costs months.", "A scorecard costs an afternoon."],
    features: [
      { eyebrow: "The role", title: "What good looks like, before you advertise.", body: "A job description and the three things the person must do well, so you know who you are looking for.", visual: { kind: "checklist", title: "Sample: in the toolkit", items: [{ label: "Job description and advert", state: "ready" }, { label: "Interview guide and scorecard", state: "ready" }, { label: "Offer letter terms", state: "ready" }, { label: "First 90 days plan", state: "ready" }] } },
      { eyebrow: "The first 90 days", title: "So the new hire stays.", body: "What they learn, what they own and when you check in, from the first day to the third month.", visual: { kind: "timeline", title: "Sample first 90 days", items: [{ when: "Day 1", title: "Shadow the owner" }, { when: "Day 30", title: "Runs the morning shift" }, { when: "Day 60", title: "Owns the daily close" }, { when: "Day 90", title: "Review and confirm" }] } },
    ],
    forYou: ["You are about to hire", "Your last hire did not work out", "Nothing moves unless you are there, and you want that to change"],
    notForYou: [{ text: "You need to restructure the team, not fill one role. See the Six-Week Fix: Delegation and Structure.", productId: "six_week_fix" }],
    faq: [
      { q: "Do you find the candidates?", a: "No. We give you everything to find, choose and keep the right person. You run the hiring." },
      { q: "Does it cover employment law?", a: "The offer terms are a practical starting point. For contracts with legal weight, take legal advice." },
    ],
    closer: "Make the next hire the right one.",
  },

  six_week_fix: {
    art: "fix",
    promise: "One problem. One number. Six weeks.",
    headline: ["One problem. One number.", "Six weeks."],
    sub: "We prescribe and equip; your team does the work; we review it with you every week until the number moves.",
    stage: { kind: "measure", title: "Sample Measure of Success: gross margin (%)", unit: "%", baseline: 18, target: 28, readings: [18, 19, 22, 24, 26, 29] },
    statement: ["Advice does not move numbers.", "Weekly follow-through does."],
    features: [
      { eyebrow: "The Prescription", title: "What to do, with the tools to do it.", body: "The steps, the templates and who owns each one, agreed with you in week 1.", visual: { kind: "moves", title: "Sample Prescription: margin", rows: [{ tag: "Week 1", text: "Reprice the five worst lines", value: "Owner" }, { tag: "Week 2", text: "Cut wastage in the kitchen", value: "Head cook" }, { tag: "Week 3", text: "Renegotiate the two biggest suppliers", value: "Owner" }] } },
      { eyebrow: "Every week", title: "A Weekly Check-in, for six weeks.", body: "Twenty minutes: the reading, what moved, what you do next. Then a Day-30 Review to check it held.", visual: { kind: "timeline", title: "Your six weeks", items: [{ when: "Week 1", title: "Prescription and Measure of Success set" }, { when: "Weeks 2 to 5", title: "Weekly Check-ins" }, { when: "Week 6", title: "The result read" }, { when: "Day 30 after", title: "Day-30 Review" }] } },
    ],
    forYou: ["You know the problem and want it fixed", "Your team can give two to four hours a week", "You want someone checking every week"],
    notForYou: [{ text: "You are not sure what the problem is. Start with a Business Review.", productId: "business_review" }],
    faq: [
      { q: "How do I pay?", a: "Half at the start, a quarter at the mid-point and a quarter at the result. Or pay in full at the start and save 5%." },
      { q: "What if the number does not move in six weeks?", a: "We extend your Six-Week Fix, at no charge, for up to two weeks." },
      { q: "Do you do the work?", a: "No. Your team does; that is how it lasts. We prescribe, equip and review it with you every week." },
    ],
    closer: "Pick the problem. Move the number.",
  },

  monthly_accounts: {
    art: "monthly",
    promise: "Your profit and cash by the 10th, every month.",
    headline: ["Your profit and cash,", "by the 10th."],
    sub: "Monthly management accounts, your cash position and the month ahead, without keeping the books yourself.",
    stage: { kind: "table", title: "Sample report for October", columns: ["", "October", "September"], rows: [["Income", "₦8.4m", "₦8.1m"], ["Costs", "₦7.2m", "₦7.0m"], ["Profit", "₦1.2m", "₦1.1m"], ["Cash at month end", "₦2.6m", "₦3.1m"], ["Owed to you", "₦1.9m", "₦1.4m"]], highlight: [3] },
    statement: ["Most owners find out in March.", "You will know by the 10th."],
    features: [
      { eyebrow: "Every month", title: "One page. The numbers that matter.", body: "Income, costs, profit, cash and who owes you, compared with last month, with a short note on what changed.", visual: { kind: "moves", title: "Sample notes", rows: [{ tag: "Watch", text: "Cash down ₦0.5m while profit held", value: "Debtors up" }, { tag: "Good", text: "Food cost back under 40% of sales", value: "38%" }] } },
      { eyebrow: "Ready for tax", title: "A note on whether your records are ready.", body: "Each month we tell you whether your records are in order for tax time. It is not tax advice.", visual: { kind: "checklist", title: "Sample readiness note", items: [{ label: "Every transaction categorised", state: "ready" }, { label: "Receipts for large costs", state: "nearly", note: "Two missing" }, { label: "Business and personal separated", state: "ready" }] } },
    ],
    forYou: ["You want your numbers every month", "You do not want to keep the books yourself", "You have just finished a Bookkeeping Catch-Up"],
    notForYou: [{ text: "Your books are months behind. Start with the Bookkeeping Catch-Up.", productId: "bookkeeping_catch_up" }],
    faq: [
      { q: "How do I pay?", a: "A quarter at a time, before the quarter starts. The price holds for twelve months, and you can stop at the end of any quarter." },
      { q: "Is this tax advice?", a: "No. Management accounts only, and the note says whether your records are ready for tax. For tax advice and filing, use a tax adviser." },
    ],
    closer: "Know your numbers every month.",
  },

  monthly_adviser_review: {
    art: "adviser",
    promise: "An experienced adviser in your corner, every month.",
    headline: ["An experienced adviser,", "in your corner every month."],
    sub: "One Session a month: your numbers, your priorities and the decisions in front of you, with actions in writing after.",
    stage: { kind: "timeline", title: "Sample quarter", items: [{ when: "January", title: "Session: the 2027 priorities", detail: "Agreed: three priorities and their numbers" }, { when: "February", title: "Session: pricing for the new outlet", detail: "Agreed: launch price and a 60-day test" }, { when: "March", title: "Session: the quarter's results", detail: "Agreed: hire the supervisor in April" }] },
    statement: ["Owners decide alone too often.", "Not every month, any more."],
    features: [
      { eyebrow: "Before each Session", title: "Your numbers, already read.", body: "We review your figures and priorities beforehand, so the hour goes on decisions.", visual: { kind: "checklist", title: "Sample agenda", items: [{ label: "Last month's numbers", state: "ready" }, { label: "Progress on the three priorities", state: "ready" }, { label: "The decision you are stuck on", state: "nearly" }] } },
      { eyebrow: "After each Session", title: "Actions in writing.", body: "Who does what by when, so the month starts with a plan.", visual: { kind: "moves", title: "Sample actions", rows: [{ tag: "Owner", text: "Test the new price for 60 days", value: "By 15 Feb" }, { tag: "Manager", text: "Weekly sales report each Monday", value: "Ongoing" }] } },
    ],
    forYou: ["You want someone experienced to check your thinking", "You have a plan and want to keep to it", "You have finished a Six-Week Fix and want to keep the momentum"],
    notForYou: [{ text: "You need finished work, not advice. Choose a Done for You product." }],
    faq: [
      { q: "How do I pay?", a: "A quarter at a time, before the quarter starts. The price holds for twelve months, and you can stop at the end of any quarter." },
      { q: "Who is the adviser?", a: "An IP Factory consultant, with a partner joining for larger decisions." },
    ],
    closer: "Decide with someone in your corner.",
  },
};

export const storyOf = (productId: string): ProductStory | undefined => PRODUCT_STORIES[productId];
