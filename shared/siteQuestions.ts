/**
 * The questions owners ask, in one place: the Questions page shows them and the search-engine markup (shared/seo.ts)
 * describes the same answers, so the two never disagree. Each service's own questions come from shared/productStories.ts.
 */
import { storyOf } from "./productStories";
import { DELIVERY_PROMISE, PRODUCTS, servicePath } from "./products";

/** The questions owners ask before they buy. */
export const SITE_QUESTIONS = [
  { q: "Do you do the work for me?", a: "Sometimes. Done for You products are finished work we deliver: accounts, a forecast, a plan or a funding pack. In a Six-Week Fix your team does the work; we prescribe, equip and review it with you every week." },
  { q: "What if you miss the delivery date?", a: DELIVERY_PROMISE },
  { q: "How do I pay?", a: "By transfer or card, through Paystack, before we start. A Six-Week Fix can be paid in three parts. Monthly Services are paid a quarter at a time." },
  { q: "What do you do with my information?", a: "We use it only to do the work you asked for. Records you upload go into private storage that only the people on your order can open. Some analysis uses AI tools, and a consultant checks everything before you get it. Our Privacy Policy lists who helps us run the service and your rights." },
  { q: "What if the Measure of Success doesn't move in six weeks?", a: "We extend your Six-Week Fix, at no charge, for up to two weeks." },
  { q: "What happens after?", a: "Thirty days on, we check in. If it helps, we suggest the next step, or a Monthly Service that keeps it going." },
] as const;

/** The groups on the Questions page, in order: before you buy, then every service that has its own questions. */
export const QUESTION_GROUPS: readonly { id: string; heading: string; items: readonly { q: string; a: string }[]; href?: string }[] = [
  { id: "before-you-buy", heading: "Before you buy", items: SITE_QUESTIONS },
  ...PRODUCTS.flatMap((product) => {
    const faq = storyOf(product.id)?.faq ?? [];
    return faq.length ? [{ id: product.slug, heading: product.name, items: faq, href: product.buy === "check" ? "/check" : servicePath(product) }] : [];
  }),
];
