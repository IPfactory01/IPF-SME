/**
 * Each public page's title and description, and the site's address: the light part of shared/seo.ts, which the pages
 * import while they are open. The structured data and the ready-made pages stay in seo.ts, which the build reads and
 * the browser loads only after the page is up (R70).
 */
import { BRAND } from "./brand";
import { storyOf } from "./productStories";
import { priceLabel, type Product } from "./products";

/**
 * The Services page in the owner's own words (ET, 10 November 2026: "Help that does the work. Finished work in days. A
 * fix in six weeks." read out of touch with the owners we serve). Its heading names their three commonest worries, each
 * a question kept on one line; the line under it says how we help and what it costs. The page, search engines and the
 * share card all read these.
 */
export const SERVICES_HEADING = "Sales slow? Cash tight? Need a loan?";
export const SERVICES_SUB = "Pick the help your business needs. We do the work for you, or with you. Every price is on the page, in naira.";

/** The site's public address. Every canonical link, sitemap entry and share card points here. */
export const SITE_ORIGIN = "https://www.ipfactory.co";

export const pageTitle = (title: string) => `${title} | ${BRAND.productEndorsement}`;

export type Meta = { title: string; description: string };

/**
 * The home page's title and description, in the words Nigerian owners search with (Google's suggestions for Nigeria,
 * 6 November 2026: "business consultant in lagos", "small business consultant", "my business is struggling what can i
 * do"). client/index.html carries the same title and description, so the app shell matches the ready-made page.
 */
export const HOME_META: Meta = {
  title: `Small Business Consultant in Lagos, Nigeria | ${BRAND.productEndorsement}`,
  description: "Is your business struggling? Find the real problem in ten minutes with a free Business Health Check, then fix it with consultants in Lagos who work on your own numbers. The Shift, by IP Factory.",
};

/**
 * What Google shows as each service's title: the service in the owner's words, not only its name. The page's own
 * heading does not change. Keyed by product id; a service without one shows its name.
 */
export const SERVICE_SEARCH_TITLES: Partial<Record<Product["id"], string>> = {
  business_health_check: "Free Business Health Check: what is wrong with my business?",
  funding_readiness_assessment: "Funding Readiness Assessment: am I ready for a business loan in Nigeria?",
  business_review: "Business Review: find what is holding your business back",
  strategy_90_day_plan: "Strategy and 90-Day Plan: where is my business going?",
  business_model: "Business Model: how your business makes money",
  financial_model: "Financial Model for a business in Nigeria",
  business_plan: "Business Plan Writer in Nigeria: fixed price, on your own numbers",
  pitch_deck: "Pitch Deck for investors in Nigeria",
  pricing_unit_cost_review: "Pricing and Unit Cost Review: price your products for profit",
  bookkeeping_catch_up: "Bookkeeping Catch-Up for small businesses in Nigeria",
  cash_flow_forecast: "13-Week Cash Flow Forecast: fix cash flow problems before they land",
  funding_application_pack: "Funding Application Pack: business loan and grant applications in Nigeria",
  hiring_toolkit: "Hiring Toolkit: hire the right staff for your small business",
  six_week_fix: "Six-Week Fix: one business problem fixed in six weeks",
  monthly_accounts: "Monthly Accounts and Cash Report for small businesses",
  monthly_adviser_review: "Monthly Adviser Review: a business adviser every month",
  digital_marketing: "Digital Marketing: Instagram, TikTok, Facebook and Google",
};

export const PAGE_META = {
  services: { title: "Services", description: "Help with your sales, cash, records, prices and loans, for small businesses across Nigeria. Every service with its price in naira and its delivery time." },
  howWeWork: { title: "How we work", description: `How ${BRAND.productName} works: the free Business Health Check, the four ways to work with us and how each is paid, and what every piece of work comes with.` },
  experience: { title: "Experience", description: `The record behind ${BRAND.productName}: ${BRAND.trackRecord.clients} clients advised since ${BRAND.trackRecord.since}, the businesses we have worked with, and the research behind the method.` },
  guides: { title: "Guides for small business owners in Nigeria", description: "Plain answers to what owners search for: my business is struggling, how to get a business loan in Nigeria, what a business plan costs, cash flow problems and pricing for profit." },
  about: { title: "About IP Factory: SME management consultants in Lekki, Lagos", description: `${BRAND.organisationName}, in Lekki, Lagos, brings management consulting to small and medium businesses across Nigeria. Part of ${BRAND.trackRecord.groupName}, whose partners have advised ${BRAND.trackRecord.clients} clients since ${BRAND.trackRecord.since}.` },
  questions: { title: "Questions", description: `Answers to the questions owners ask about ${BRAND.productName}: paying, delivery dates, refunds, your information, and each service.` },
  contact: { title: "Contact", description: `Book a free 20-minute call with ${BRAND.productName}, or write to ${BRAND.businessSupportMailbox}. Our office is at ${BRAND.officeAddress.oneLine}.` },
  check: { title: "Free Business Health Check", description: "Ten minutes on your phone. See where your business is stuck, area by area, and the first step that fits. Free, no card needed." },
  login: { title: "Client sign in", description: `Sign in to your ${BRAND.productName} client room.` },
  terms: { title: "Terms & Conditions", description: "The terms that apply when you use the IP Factory SME platform, pay for a service or create an account." },
  privacy: { title: "Privacy Policy", description: "How IP Factory collects, uses, shares, stores and protects personal and business information on its SME platform." },
} as const satisfies Record<string, Meta>;

export function productMeta(product: Product): Meta {
  const story = storyOf(product.id);
  return { title: SERVICE_SEARCH_TITLES[product.id] ?? product.name, description: story ? `${story.sub} ${priceLabel(product.price)}. ${product.delivery}` : product.short };
}
