/**
 * Guides (/guides/:slug): answers to the questions Nigerian owners type into Google, in their own words (Google's
 * suggestions for Nigeria, 6 November 2026: "my business is struggling what can i do", "how to get business loan in
 * nigeria", "how much does it cost to write a business plan in nigeria", "how to deal with cash flow problems in small
 * business", "how to price my products for profit"). Each guide answers the question honestly, then names the free
 * Business Health Check and the services that fix it, here on the site. Prices come from shared/products.ts.
 */
import { PRODUCTS, priceLabel, type Product } from "./products";

type ProductId = Product["id"];

export type GuideSection = { heading: string; paragraphs?: readonly string[]; points?: readonly string[] };

export type Guide = {
  slug: string;
  /** What Google shows as the result's title: the owner's question, then the brand. */
  title: string;
  /** What Google shows under the title. */
  description: string;
  /** The search the guide answers, word for word as owners type it. */
  searches: readonly string[];
  h1: string;
  lede: string;
  sections: readonly GuideSection[];
  faq: readonly { q: string; a: string }[];
  /** The services that fix it, here on the site, most likely first. */
  services: readonly ProductId[];
};

const product = (id: ProductId) => PRODUCTS.find((item) => item.id === id)!;
const price = (id: ProductId) => priceLabel(product(id).price);

export const GUIDES: readonly Guide[] = [
  {
    slug: "my-business-is-struggling",
    title: "My business is struggling. What can I do?",
    description: "Sales are coming in but money is always short? Five signs of what is really wrong in a Nigerian small business, what to do this week, and a free check.",
    searches: ["my business is struggling what can i do", "my business is failing what do i do", "my business is not doing well", "my business is not making money", "why is my business not growing"],
    h1: "My business is struggling. What can I do?",
    lede: "Most struggling businesses are not short of effort. They are working on the wrong problem. Find the real one first, then fix that one thing.",
    sections: [
      {
        heading: "Five signs, and what each usually means",
        points: [
          "Sales are coming in but cash is always short. Usually: money is tied up in stock or in customers who owe you, or the business pays for things the owner takes out.",
          "You are busy every day but there is nothing left at month end. Usually: your prices have not kept up with your costs, so you sell more and keep less.",
          "Customers buy once and do not come back. Usually: what they get is not what they expected, or nobody follows up.",
          "Your records are weeks or months behind. Usually: you cannot see the problem because you cannot see the numbers.",
          "Nothing moves unless you are there. Usually: the business runs on you, not on a process, so it cannot grow past your hours.",
        ],
      },
      {
        heading: "What to do this week",
        points: [
          "Open a separate account for the business if you have not, and stop paying personal costs from it.",
          "Write down what came in and what went out last month, from your bank statement. Not from memory.",
          "List your three best-selling products and what each costs you to make or buy today, not last year.",
          "Pick the one sign above that hurts most. Fix that before anything else.",
        ],
      },
      {
        heading: "When to get help",
        paragraphs: [
          "If you have tried for three months and the number has not moved, the problem is probably not the one you are working on. That is when an outside view pays for itself.",
          "Start with the free Business Health Check. It takes ten minutes on your phone and shows you, area by area, where your business is stuck and what to fix first.",
        ],
      },
    ],
    faq: [
      { q: "My business is failing. Is it too late?", a: "Not usually. Most businesses we see are not failing for lack of customers but for one fixable reason: cash tied up, prices too low, or records too far behind to see the problem. Find that reason first." },
      { q: "How do I know what is wrong with my business?", a: "Look at your own numbers from your bank statement, not from memory, and compare what you sell, what it costs you and what is left. The free Business Health Check does this with you in ten minutes and names the area to fix first." },
      { q: "Should I take a loan to save my business?", a: "Only once you know why money is short. A loan on top of a pricing or cash problem makes the problem bigger. Fix the cause, then borrow for growth." },
    ],
    services: ["business_health_check", "business_review", "six_week_fix"],
  },
  {
    slug: "how-to-get-a-business-loan-in-nigeria",
    title: "How to get a business loan in Nigeria: what lenders ask for",
    description: "Bank of Industry, SMEDAN, banks and grants: what Nigerian lenders check before they say yes, the documents to prepare, and how to know you are ready.",
    searches: ["how to get business loan in nigeria", "small business loan in nigeria", "bank of industry loan requirements", "smedan loan", "grant for small business in nigeria"],
    h1: "How to get a business loan in Nigeria",
    lede: "Most loan applications fail on the same few things: no clean bank statements, no clear use for the money, and no proof the business can pay it back. Get those right before you apply.",
    sections: [
      {
        heading: "What lenders check",
        points: [
          "Your bank statements: six to twelve months, in the business's name, showing money coming in regularly.",
          "Registration: your CAC certificate and status report, and your TIN.",
          "What the money is for: a specific use, such as a machine, stock or a second outlet, with what it costs.",
          "How you will pay it back: your numbers showing the business can carry the repayment every month.",
          "Who you are: your BVN, ID, and often a guarantor or collateral, depending on the lender and the amount.",
        ],
      },
      {
        heading: "Where small businesses in Nigeria borrow",
        paragraphs: [
          "Development lenders such as the Bank of Industry, programmes run with SMEDAN, commercial banks, microfinance banks, and grant schemes from government and development partners. Each has its own checklist and changes it often, so always work from the lender's current list.",
          "Grants are competitive and usually tied to a sector, a location or a group of owners. Read who qualifies before you spend time on the form.",
        ],
      },
      {
        heading: "Are you ready to apply?",
        paragraphs: [
          "If your statements are not in the business's name, your records are behind, or you cannot show how the repayment fits your cash, fix that first. A rejection stays on your record with that lender.",
          `The Funding Readiness Assessment (${price("funding_readiness_assessment")}) checks you against what your lender asks for and tells you what is missing. The Funding Application Pack (${price("funding_application_pack")}) prepares the documents with you.`,
        ],
      },
    ],
    faq: [
      { q: "What are the Bank of Industry loan requirements?", a: "They change by programme, so check the current list on the Bank of Industry's own site. Expect registration documents, bank statements, a business plan or proposal with the use of funds, and evidence the business can repay." },
      { q: "How do I get a SMEDAN loan or grant?", a: "SMEDAN runs and supports several schemes, often with partners. Register your business, keep your records and statements in order, and apply through the official SMEDAN portal for the scheme you qualify for. Be wary of anyone who asks for a fee to guarantee approval." },
      { q: "Do I need a business plan to get a loan in Nigeria?", a: "For most development lenders and larger bank loans, yes, or at least a proposal showing what the money is for and how it will be repaid. Smaller loans may only need statements and registration." },
    ],
    services: ["funding_readiness_assessment", "funding_application_pack", "business_plan"],
  },
  {
    slug: "how-much-does-a-business-plan-cost-in-nigeria",
    title: "How much does it cost to write a business plan in Nigeria?",
    description: `What a business plan should cost in Nigeria, what you get at each level, and our fixed price: ${price("business_plan")}. Who reads it decides what it needs.`,
    searches: ["how much does it cost to write a business plan in nigeria", "business plan writers in nigeria", "how to write a business plan in nigeria", "how to write a business proposal for funding in nigeria"],
    h1: "How much does a business plan cost in Nigeria?",
    lede: `Prices range from a few thousand naira for a template to millions for a full investor pack. Ours is ${price("business_plan")}, fixed, written on your own numbers. What you need depends on who will read it.`,
    sections: [
      {
        heading: "What decides the price",
        points: [
          "Who reads it. A lender, an investor and your own managers need different things.",
          "Whether the numbers are real. A plan built on your bank statements and sales records costs more to write than one built on guesses, and is worth far more.",
          "Whether it includes a financial model: three years of sales, costs, cash and the loan or investment, month by month.",
          "Whether someone with experience checks it before it goes out.",
        ],
      },
      {
        heading: "Cheap plans, and why they get rejected",
        paragraphs: [
          "A template filled in with someone else's numbers reads like one. Lenders and investors see many of them and stop at the numbers. If the plan cannot answer \"how will you pay this back?\" from your own records, it will not get the money.",
        ],
      },
      {
        heading: "What our Business Plan includes",
        paragraphs: [
          `${product("business_plan").short} Fixed price: ${price("business_plan")}. ${product("business_plan").delivery}`,
          `Need only the numbers? The Financial Model is ${price("financial_model")}. Presenting to investors? The Pitch Deck is ${price("pitch_deck")}.`,
        ],
      },
    ],
    faq: [
      { q: "Can I write my own business plan?", a: "Yes, and for your own use you should. Use your bank statements, not estimates. When a lender or investor will read it, an experienced writer helps you answer the questions they will ask." },
      { q: "How long does a business plan take?", a: `${product("business_plan").delivery} The work starts once your records are in.` },
      { q: "What is the difference between a business plan and a business proposal?", a: "A proposal asks for one thing, such as a loan or a contract, and says why. A business plan covers the whole business: the market, how you make money, the team, and the numbers for the next few years." },
    ],
    services: ["business_plan", "financial_model", "pitch_deck"],
  },
  {
    slug: "cash-flow-problems-in-small-business",
    title: "How to fix cash flow problems in a small business in Nigeria",
    description: "Making sales but always short of cash? Why it happens in Nigerian small businesses, how to see the shortfall weeks before it lands, and what to do about it.",
    searches: ["how to deal with cash flow problems in small business", "how to manage my business money", "how to manage cash flow in small business", "how to separate personal and business money"],
    h1: "How to fix cash flow problems in a small business",
    lede: "Profit is what the business earns on paper. Cash is what is in the account on the day rent is due. Most small businesses that close were making sales. They ran out of cash.",
    sections: [
      {
        heading: "Why cash runs short when sales are fine",
        points: [
          "Customers pay late, or you sell on credit and do not chase it.",
          "Too much money sits in stock that is not moving.",
          "Big costs come at once: rent for the year, school fees, a generator repair, diesel.",
          "Business money and personal money share one account, so nobody can see what the business really has.",
          "Prices have not moved since costs went up.",
        ],
      },
      {
        heading: "What to do",
        points: [
          "Separate the accounts. Pay yourself a fixed amount from the business, not whatever you need that week.",
          "List who owes you, how much and since when. Chase the oldest first.",
          "Write down every payment due in the next thirteen weeks, week by week, against what you expect to come in. The week the line goes below zero is the week to act on now.",
          "Check your prices against today's costs.",
        ],
      },
      {
        heading: "See it before it happens",
        paragraphs: [
          `A 13-Week Cash Flow Forecast shows, week by week, when cash will run short and by how much, so you can act weeks ahead. Ours is ${price("cash_flow_forecast")}, built on your own bank statements. If your records are behind, the Bookkeeping Catch-Up (${price("bookkeeping_catch_up")}) brings them up to date first.`,
        ],
      },
    ],
    faq: [
      { q: "How do I separate personal and business money?", a: "Open an account in the business's name, put every sale into it, and pay every business cost from it. Pay yourself a fixed amount each month from that account into your personal one, like a salary." },
      { q: "What is a cash flow forecast?", a: "A table of the money you expect to come in and go out, week by week, for the next few weeks or months. It shows when you will run short before it happens." },
      { q: "Is a cash flow problem the same as a profit problem?", a: "No. You can be profitable on paper and still run out of cash, if customers pay late or money is tied up in stock. If you are short every month, check both." },
    ],
    services: ["cash_flow_forecast", "bookkeeping_catch_up", "monthly_accounts"],
  },
  {
    slug: "how-to-price-your-products-for-profit",
    title: "How to price your products for profit in Nigeria",
    description: "Selling more but keeping less? Work out the true cost of each product, set prices that leave a profit, and raise them without losing customers.",
    searches: ["how to price my products for profit", "how to price my products for wholesale", "how to calculate profit in business", "my business is not making profit"],
    h1: "How to price your products for profit",
    lede: "If costs have gone up and your prices have not, every sale makes less than it used to. Some products may now lose money each time you sell them.",
    sections: [
      {
        heading: "Work out the true cost of one item",
        points: [
          "What you pay for it, or for the materials, today. Not what you paid last year.",
          "Transport, packaging and anything else each sale uses.",
          "A share of the running costs: rent, staff, diesel, data. Add up a month and divide by how many items you sell in a month.",
          "Price minus all of that is what you really keep on each one.",
        ],
      },
      {
        heading: "Set the price",
        points: [
          "Start from the true cost, add the profit you need, then check it against what customers pay elsewhere.",
          "Wholesale and retail need different prices. Wholesale sells more at a smaller margin; make sure it still leaves a margin.",
          "Find the products that lose money. Raise their price, change them, or stop selling them.",
        ],
      },
      {
        heading: "Raising prices without losing customers",
        paragraphs: [
          "Raise them in steps, tell regular customers before it happens, and add something small where you can. Most customers leave over poor service, not a fair increase.",
          `The Pricing and Unit Cost Review (${price("pricing_unit_cost_review")}) works out the real cost and margin of each product from your own records and sets prices that leave a profit.`,
        ],
      },
    ],
    faq: [
      { q: "How do I calculate profit in my business?", a: "Take what you sold in a month, subtract what those items cost you, then subtract that month's running costs: rent, staff, transport, power. What is left is profit. Use your bank statement, not memory." },
      { q: "Why is my business not making profit when sales are good?", a: "Usually because prices have not kept up with costs, a few products lose money, or running costs have grown faster than sales. Work out the true cost of your best-sellers first." },
      { q: "How much profit should I add to my price?", a: "It depends on your trade and what customers pay elsewhere. Start from your true cost and the profit you need each month, then test it against the market." },
    ],
    services: ["pricing_unit_cost_review", "business_review", "six_week_fix"],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((guide) => guide.slug === slug);
export const guidePath = (guide: Guide) => `/guides/${guide.slug}`;
