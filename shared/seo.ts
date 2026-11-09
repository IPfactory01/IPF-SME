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
import { GUIDES, guidePath } from "./guides";

export { HOME_META, PAGE_META, pageTitle, productMeta, SERVICE_SEARCH_TITLES, SITE_ORIGIN } from "./pageMeta";
import { HOME_META, PAGE_META, pageTitle, productMeta, SITE_ORIGIN, type Meta } from "./pageMeta";

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

/** Where a page sits in the site, as Google shows it under a result: Home › Services › Six-Week Fix. */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({ "@type": "ListItem", position: index + 1, name: step.name, item: `${SITE_ORIGIN}${step.path}` })),
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
  /** How a shared link to the page looks on WhatsApp, LinkedIn and X (R73): its own 1200×630 card. */
  card: ShareCard;
};

/** A page's share card: the file (made by scripts/shareCards.ts, kept in client/public) and what it says. */
export type ShareCard = { image: string; eyebrow: string; lines: readonly string[]; line: string; badge: string };

/** The card's file for an address: the brand card for the home page, its own for every other page. */
export const shareCardImage = (path: string) => (path === "/" ? "/brand/share-card.png" : `/share/${path.slice(1).replace(/\//g, "-")}.jpg`);
/** A card's line: the first sentence, or its first clause when that runs past two lines on the card (120 characters). */
const firstSentence = (text: string) => {
  const sentence = text.match(/^.*?[.?!](\s|$)/)?.[0].trim() ?? text;
  return sentence.length > 120 && sentence.includes(":") ? `${sentence.split(":")[0]}.` : sentence;
};

let pagesCache: PublicPage[] | undefined;

/** Every public page, in the order the sitemap lists them. */
export function publicPages(): PublicPage[] {
  if (pagesCache) return pagesCache;
  const org = organisationJsonLd();
  const home = { name: "Home", path: "/" };
  const services = { name: "Services", path: "/services" };
  // Inner pages carry a breadcrumb back to the home page; service pages go through Services.
  const page = (path: string, meta: Meta, heading: string, body: string[], extra: object[] = [], crumb = meta.title, card: Partial<Omit<ShareCard, "image">> = {}): PublicPage => {
    const trail = path === "/" ? [] : path.startsWith("/services/") ? [home, services, { name: crumb, path }] : path.startsWith("/guides/") ? [home, { name: "Guides", path: "/guides" }, { name: crumb, path }] : [home, { name: crumb, path }];
    const shareCard: ShareCard = { image: shareCardImage(path), eyebrow: card.eyebrow ?? meta.title, lines: card.lines ?? [heading], line: card.line ?? firstSentence(meta.description), badge: card.badge ?? "Free Business Health Check" };
    return { path, title: meta.title, description: meta.description, heading, body, jsonLd: [org, ...(trail.length ? [breadcrumbJsonLd(trail)] : []), ...extra], card: shareCard };
  };
  pagesCache = [
    page("/", HOME_META, "Find it. Fix it. See the shift.", [HOME_META.description], [], HOME_META.title, { eyebrow: BRAND.productEndorsement, lines: ["Find it. Fix it.", "See the shift."], line: "Help for owner-run businesses in Nigeria. Finished work in days, or a fix in six weeks." }),
    page("/services", PAGE_META.services, "Help that does the work.", [PAGE_META.services.description, ...MENU_PRODUCTS.map((product) => `${product.name}: ${priceLabel(product.price)}. ${product.short}`)], [], PAGE_META.services.title, { line: "Every service with its price and delivery time, for businesses across Nigeria." }),
    ...MENU_PRODUCTS.map((product) => {
      const story = storyOf(product.id);
      return page(servicePath(product), productMeta(product), story ? story.headline.join(" ") : product.name, [productMeta(product).description, ...product.youGet], [serviceJsonLd(product), ...(story?.faq.length ? [faqJsonLd(story.faq)] : [])], product.name, { eyebrow: product.name, lines: story ? story.headline : [product.name], line: product.short, badge: priceLabel(product.price) });
    }),
    page("/how-we-work", PAGE_META.howWeWork, "How we work with your business.", [PAGE_META.howWeWork.description], [], PAGE_META.howWeWork.title, { line: "The free check, four ways to work with us, and what every piece of work comes with." }),
    page("/experience", PAGE_META.experience, "We have done this before, many times.", [PAGE_META.experience.description], [], PAGE_META.experience.title, { line: `${BRAND.trackRecord.clients} clients advised since ${BRAND.trackRecord.since}, and the research behind the method.` }),
    page("/about", PAGE_META.about, "Consulting experience, at the size of your business.", [PAGE_META.about.description]),
    page("/guides", PAGE_META.guides, "Answers to what owners ask.", [PAGE_META.guides.description, ...GUIDES.map((guide) => `${guide.h1} ${guide.description}`)], [], PAGE_META.guides.title, { eyebrow: "Guides", line: "Plain answers to what owners in Nigeria search for." }),
    ...GUIDES.map((guide) => page(guidePath(guide), { title: guide.title, description: guide.description }, guide.h1, [guide.lede, ...guide.sections.flatMap((section) => [section.heading, ...(section.paragraphs ?? []), ...(section.points ?? [])])], [faqJsonLd(guide.faq)], guide.h1, { eyebrow: "A guide for owners in Nigeria", line: firstSentence(guide.lede) })),
    page("/questions", PAGE_META.questions, "Questions owners ask.", QUESTION_GROUPS.flatMap((group) => group.items.map((item) => `${item.q} ${item.a}`)), [faqJsonLd(QUESTION_GROUPS.flatMap((group) => group.items))], PAGE_META.questions.title, { line: "Paying, delivery dates, refunds, your information, and each service." }),
    page("/contact", PAGE_META.contact, "Talk to an expert.", [PAGE_META.contact.description]),
    page("/check", PAGE_META.check, "Free Business Health Check", [PAGE_META.check.description], [], PAGE_META.check.title, { eyebrow: "Ten minutes on your phone", line: "See where your business is stuck, area by area, and the first step that fits.", badge: "Free, no card needed" }),
    page("/terms", PAGE_META.terms, "IP Factory Terms & Conditions", [PAGE_META.terms.description]),
    page("/privacy", PAGE_META.privacy, "IP Factory Privacy Policy", [PAGE_META.privacy.description]),
  ];
  return pagesCache;
}

/** The structured data for an address ("/services/x" or "/services/x/"), or none for a page that is not public. */
export function structuredDataFor(path: string): object[] {
  const clean = path.replace(/(.)\/+$/, "$1");
  return publicPages().find((page) => page.path === clean)?.jsonLd ?? [];
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** JSON inside a script tag: "</script>" or "<!--" in the data must not end it. */
const scriptJson = (value: object) => JSON.stringify(value).replace(/</g, "\\u003c");

const NAV = [["/", "Home"], ["/services", "Services"], ["/how-we-work", "How we work"], ["/experience", "Experience"], ["/about", "About"], ["/questions", "Questions"], ["/contact", "Contact"], ["/check", "Free Business Health Check"]] as const;

/**
 * The built index.html, made into one page's own: its title, description, canonical address, share card and structured
 * data in the head, and its words inside #root for readers without JavaScript. React replaces #root as it starts, so
 * visitors see the normal page; the words are visually hidden meanwhile, so nothing flashes.
 */
/**
 * `rendered`: the page itself, rendered at build time (client/src/entry-server.tsx, R70), and the code files it loads
 * first, to fetch at once. Without it the page carries its words for search engines only, hidden.
 */
export function pageHtml(template: string, page: PublicPage, rendered?: { html: string; preload: readonly string[] }): string {
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
  // Each page's own share card (R73).
  const image = `${SITE_ORIGIN}${page.card.image}`;
  html = replace(html, /<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${image}" />`);
  html = replace(html, /<meta property="og:image:alt" content="[^"]*" \/>/, `<meta property="og:image:alt" content="${escapeHtml(`${page.card.lines.join(" ")} ${BRAND.productEndorsement}.`)}" />`);
  html = replace(html, /<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${image}" />`);
  const preload = (rendered?.preload ?? []).filter((file) => !template.includes(`/${file}"`)).map((file) => `<link rel="modulepreload" crossorigin href="/${file}" />`);
  const head = [`<link rel="canonical" href="${url}" />`, ...preload, ...page.jsonLd.map((data) => `<script type="application/ld+json">${scriptJson(data)}</script>`)].join("\n    ");
  html = replace(html, /<\/head>/, `    ${head}\n  </head>`);
  const words = [
    `<h1>${escapeHtml(page.heading)}</h1>`,
    ...page.body.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<nav aria-label="Site">${NAV.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join(" ")}</nav>`,
    `<p>${escapeHtml(`${BRAND.organisationName}, ${BRAND.officeAddress.oneLine}. ${BRAND.businessSupportMailbox}`)}</p>`,
  ].join("");
  // The rendered page goes in as it is; the browser takes it over without drawing it again (main.tsx).
  html = replace(html, /<div id="root"><\/div>/, rendered ? `<div id="root" data-prerendered>${rendered.html}</div>` : `<div id="root"><div class="sr-only">${words}</div></div>`);
  return html;
}
