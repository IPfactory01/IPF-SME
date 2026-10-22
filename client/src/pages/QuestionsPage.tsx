/**
 * Questions (/questions): every question in one place. First the questions owners ask before they buy, then each
 * service's own, in menu order, each group linking to its service. Answers come from the same sources as the pages
 * they belong to (SITE_QUESTIONS, shared/productStories.ts), so the two never disagree.
 */
import { CheckCta, Faq, SITE_QUESTIONS, useStartCheck } from "@/components/home/HomeSections";
import { PageHero } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { BRAND } from "@shared/brand";
import { storyOf } from "@shared/productStories";
import { PRODUCTS, servicePath } from "@shared/products";
import { ArrowRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";

/** The groups on the page, in order: before you buy, then every service that has its own questions. */
export const QUESTION_GROUPS = [
  { id: "before-you-buy", heading: "Before you buy", items: SITE_QUESTIONS, href: undefined as string | undefined },
  ...PRODUCTS.flatMap((product) => {
    const faq = storyOf(product.id)?.faq ?? [];
    return faq.length ? [{ id: product.slug, heading: product.name, items: faq, href: product.buy === "check" ? "/check" : servicePath(product) }] : [];
  }),
];

export default function QuestionsPage() {
  useScrollToTop();
  usePageMeta("Questions", "Answers to the questions owners ask about The Shift: paying, delivery dates, refunds, your information, and each service.");
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <PageHero eyebrow="Questions" title="Questions owners ask." sub="About paying, dates, refunds and your information, then each service on its own." />

      <div className="container mx-auto grid max-w-6xl gap-12 py-16 lg:grid-cols-[15rem_1fr] lg:py-20">
        <nav aria-label="Question topics" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-2 lg:block lg:space-y-1">
            {QUESTION_GROUPS.map((group) => (
              <li key={group.id}><a href={`#${group.id}`} className="block border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft transition-colors hover:border-brand hover:text-brand lg:border-0 lg:border-l-2 lg:border-transparent lg:px-3 lg:py-1 lg:hover:border-brand">{group.heading}</a></li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-14">
          {QUESTION_GROUPS.map((group) => (
            <div key={group.id}>
              <Faq id={group.id} heading={group.heading} items={group.items} />
              {group.href && <Link href={group.href} className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">More about {group.heading} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>}
            </div>
          ))}
          <p className="text-ink-soft">Still have a question? <Link href="/contact" className="font-semibold text-brand underline underline-offset-4">Talk to us</Link>, or write to <a href={`mailto:${BRAND.businessSupportMailbox}`} className="font-semibold text-brand underline underline-offset-4">{BRAND.businessSupportMailbox}</a>.</p>
        </div>
      </div>

      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
