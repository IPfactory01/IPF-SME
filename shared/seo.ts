/**
 * What search engines and link previews read about each public page: its title, description, address on the web, and
 * the structured data that lets Google show the business, its services and its answers. The pages use the same titles
 * and descriptions (usePageMeta), and the build writes a ready-made page for each (scripts/prerender.ts), so WhatsApp,
 * LinkedIn and any search engine that does not run JavaScript see the right page, not the home page.
 */
import { BRAND } from "./brand";
import { storyOf } from "./productStories";
import { MENU_PRODUCTS, priceLabel, servicePath, startingAmount, type Product } from "./products";
import { QUESTION_GROUPS } from "./siteQuestions";

/** The site's public address. Every canonical link, sitemap entry and share card points here. */
export const SITE_ORIGIN = "https://www.ipfactory.co";

export const pageTitle = (title: string) => `${title} | ${BRAND.productEndorsement}`;

type Meta = { title: string; description: string };

/** The home page keeps the title in client/index.html; every other public page has its own. */
export const HOME_META: Meta = {
  title: `${BRAND.productEndorsement} · ${BRAND.productTagline}`,
  description: `Help for owner-run businesses in Nigeria. Finished work in days, or a fix in six weeks, with every price on the page. ${BRAND.productName}, by ${BRAND.organisationName}. Start with a free Business Health Check.`,
};

export const PAGE_META = {
  services: { title: "Services", description: `Every service of ${BRAND.productEndorsement}, with its price and delivery time: assessments, Done for You work, the Six-Week Fix and Monthly Services, for businesses across Nigeria.` },
  howWeWork: { title: "How we work", description: `How ${BRAND.productName} works: the free Business Health Check, the four ways to work with us and how each is paid, and what every piece of work comes with.` },
  about: { title: "About", description: `${BRAND.productName} is run by ${BRAND.organisationName}, the delivery and method arm of ${BRAND.trackRecord.groupName}. Our track record, who we work with, and the research behind the method.` },
  questions: { title: "Questions", description: `Answers to the questions owners ask about ${BRAND.productName}: paying, delivery dates, refunds, your information, and each service.` },
  contact: { title: "Contact", description: `Book a free 20-minute call with ${BRAND.productName}, or write to ${BRAND.businessSupportMailbox}. Our office is at ${BRAND.officeAddress.oneLine}.` },
  check: { title: "Free Business Health Check", description: "Ten minutes on your phone. See where your business is stuck, area by area, and the first step that fits. Free, no card needed." },
  login: { title: "Client sign in", description: `Sign in to your ${BRAND.productName} client room.` },
  terms: { title: "Terms & Conditions", description: "The terms that apply when you use the IP Factory SME platform, pay for a service or create an account." },
  privacy: { title: "Privacy Policy", description: "How IP Factory collects, uses, shares, stores and protects personal and business information on its SME platform." },
} as const satisfies Record<string, Meta>;

export function productMeta(product: Product): Meta {
  const story = storyOf(product.id);
  return { title: product.name, description: story ? `${story.sub} ${priceLabel(product.price)}. ${product.delivery}` : product.short };
}

const ORGANISATION_ID = `${SITE_ORIGIN}/#organisation`;

/** IP Factory as a business: who, where, how to reach it, and the firm behind it. On every public page. */
export function organisationJsonLd() {
  const address = BRAND.officeAddress;
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": ORGANISATION_ID,
    name: BRAND.organisationName,
    legalName: BRAND.organisationLegalName,
    alternateName: BRAND.productEndorsement,
    description: HOME_META.description,
    url: `${SITE_ORIGIN}/`,
    logo: `${SITE_ORIGIN}/brand/ipf-mark-512.png`,
    image: `${SITE_ORIGIN}/brand/share-card.png`,
    email: BRAND.businessSupportMailbox,
    address: { "@type": "PostalAddress", streetAddress: address.street, addressLocality: address.locality, addressRegion: address.region, addressCountry: address.countryCode },
    areaServed: { "@type": "Country", name: "Nigeria" },
    parentOrganization: { "@type": "Organization", name: BRAND.trackRecord.groupName, ...(BRAND.trackRecord.groupUrl ? { url: BRAND.trackRecord.groupUrl } : {}) },
  };
}

/** One service with its starting price in naira, offered by IP Factory across Nigeria. */
export function serviceJsonLd(product: Product) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: product.name,
    description: productMeta(product).description,
    url: `${SITE_ORIGIN}${servicePath(product)}`,
    serviceType: product.name,
    provider: { "@id": ORGANISATION_ID },
    areaServed: { "@type": "Country", name: "Nigeria" },
    offers: { "@type": "Offer", priceCurrency: "NGN", price: startingAmount(product.price), description: priceLabel(product.price), url: `${SITE_ORIGIN}${servicePath(product)}` },
  };
}

/** Questions and answers, as Google reads them. Each question once. */
export function faqJsonLd(items: readonly { q: string; a: string }[]) {
  const seen = new Set<string>();
  const unique = items.filter((item) => (seen.has(item.q) ? false : (seen.add(item.q), true)));
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: unique.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };
}

export type PublicPage = {
  path: string;
  title: string;
  description: string;
  /** The page's own words, written into the ready-made page for readers that do not run JavaScript. */
  heading: string;
  body: string[];
  jsonLd: object[];
};

/** Every public page, in the order the sitemap lists them. */
export function publicPages(): PublicPage[] {
  const org = organisationJsonLd();
  const page = (path: string, meta: Meta, heading: string, body: string[], extra: object[] = []): PublicPage => ({ path, title: meta.title, description: meta.description, heading, body, jsonLd: [org, ...extra] });
  return [
    page("/", HOME_META, "Find it. Fix it. See the results.", [HOME_META.description]),
    page("/services", PAGE_META.services, "Help that does the work.", [PAGE_META.services.description, ...MENU_PRODUCTS.map((product) => `${product.name}: ${priceLabel(product.price)}. ${product.short}`)]),
    ...MENU_PRODUCTS.map((product) => {
      const story = storyOf(product.id);
      return page(servicePath(product), productMeta(product), story ? story.headline.join(" ") : product.name, [productMeta(product).description, ...product.youGet], [serviceJsonLd(product), ...(story?.faq.length ? [faqJsonLd(story.faq)] : [])]);
    }),
    page("/how-we-work", PAGE_META.howWeWork, "Find it. Fix it. See the results.", [PAGE_META.howWeWork.description]),
    page("/about", PAGE_META.about, "Consulting experience, at the size of your business.", [PAGE_META.about.description]),
    page("/questions", PAGE_META.questions, "Questions owners ask.", QUESTION_GROUPS.flatMap((group) => group.items.map((item) => `${item.q} ${item.a}`)), [faqJsonLd(QUESTION_GROUPS.flatMap((group) => group.items))]),
    page("/contact", PAGE_META.contact, "Talk to a person.", [PAGE_META.contact.description]),
    page("/check", PAGE_META.check, "Free Business Health Check", [PAGE_META.check.description]),
    page("/terms", PAGE_META.terms, "Terms & Conditions", [PAGE_META.terms.description]),
    page("/privacy", PAGE_META.privacy, "Privacy Policy", [PAGE_META.privacy.description]),
  ];
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside a script tag: "</script>" or "<!--" in the data must not end it. */
const scriptJson = (value: object) => JSON.stringify(value).replace(/</g, "\\u003c");

const NAV = [["/", "Home"], ["/services", "Services"], ["/how-we-work", "How we work"], ["/about", "About"], ["/questions", "Questions"], ["/contact", "Contact"], ["/check", "Free Business Health Check"]] as const;

/**
 * The built index.html, made into one page's own: its title, description, canonical address, share card and structured
 * data in the head, and its words inside #root for readers without JavaScript. React replaces #root as it starts, so
 * visitors see the normal page; the words are visually hidden meanwhile, so nothing flashes.
 */
export function pageHtml(template: string, page: PublicPage): string {
  const url = `${SITE_ORIGIN}${page.path === "/" ? "/" : page.path}`;
  const title = page.path === "/" ? page.title : pageTitle(page.title);
  const replace = (html: string, pattern: RegExp, value: string) => {
    if (!pattern.test(html)) throw new Error(`index.html is missing ${pattern}`);
    return html.replace(pattern, value);
  };
  let html = template;
  html = replace(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = replace(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = replace(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = replace(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`);
  html = replace(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  const head = [`<link rel="canonical" href="${url}" />`, ...page.jsonLd.map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`)].join("\n    ");
  html = replace(html, /<\/head>/, `    ${head}\n  </head>`);
  const words = [
    `<h1>${escapeHtml(page.heading)}</h1>`,
    ...page.body.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<nav aria-label="Site">${NAV.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join(" ")}</nav>`,
    `<p>${escapeHtml(`${BRAND.organisationName}, ${BRAND.officeAddress.oneLine}. ${BRAND.businessSupportMailbox}`)}</p>`,
  ].join("");
  html = replace(html, /<div id="root"><\/div>/, `<div id="root"><div class="sr-only">${words}</div></div>`);
  return html;
}
