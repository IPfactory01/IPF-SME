/**
 * The About page's words that search engines read as well as people (shared/seo.ts renders them into the page's HTML
 * and its FAQ structured data). Written for the searches an About page answers (ET, 10 November 2026): who IP Factory
 * is, where it is, who is behind it and who it is for. The home page keeps "small business consultant in Lagos".
 */
import { BRAND } from "./brand";

const { groupName, clients, since, partnerYears } = BRAND.trackRecord;
const clientCount = clients.replace(/\+$/, "");

export const ABOUT_HEADING = "Management consultants for small and medium businesses in Nigeria.";

export const ABOUT_SUB = `${BRAND.organisationName} runs ${BRAND.productName} from Lekki, Lagos, for owners across Nigeria. We are part of ${groupName}, a Nigerian management consulting firm whose partners have advised more than ${clientCount} clients since ${since}.`;

/** The figures on the page, each one the site already states and ET confirmed (shared/brand.ts). */
export const ABOUT_FIGURES = [
  { value: clients, label: `clients advised since ${since}` },
  { value: partnerYears, label: "years of partner experience" },
  { value: "Lekki", label: "our office, in Lagos" },
] as const;

export const ABOUT_FAQ = [
  { q: `Who is behind ${BRAND.organisationName}?`, a: `${groupName}, a Nigerian management consulting firm. ${BRAND.organisationName} is its delivery and method arm: the firm's method, sized and priced for small and medium businesses.` },
  { q: "Where are you based?", a: `Our office is at ${BRAND.officeAddress.oneLine}, the same office as ${groupName}.` },
  { q: "What size of business do you work with?", a: "Owner-run businesses in Nigeria that already trade. A smaller business usually starts with the free Business Health Check and a Done for You product; a larger one with a Business Review." },
  { q: "How do I start?", a: "Take the free Business Health Check, ten minutes on your phone, or book a free 20-minute Discovery Call. Either way you know what to fix first, and what it costs, before you pay anything." },
] as const;
