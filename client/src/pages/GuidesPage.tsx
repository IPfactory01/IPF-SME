/**
 * Guides (/guides and /guides/:slug): plain answers to the questions Nigerian owners type into Google, each ending with
 * the free Business Health Check and the services on this site that fix the problem. Content in shared/guides.ts.
 */
import { CheckCta, useStartCheck } from "@/components/home/HomeSections";
import { PageHero } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { GUIDES, guideBySlug, guidePath } from "@shared/guides";
import { priceLabel, productById, servicePath } from "@shared/products";
import { PAGE_META } from "@shared/seo";
import { ArrowRight, Check } from "lucide-react";
import React from "react";
import { Link, useParams } from "wouter";

export function GuidesIndex() {
  useScrollToTop();
  usePageMeta(PAGE_META.guides.title, PAGE_META.guides.description);
  const startCheck = useStartCheck();
  return (
    <SiteShell>
      <PageHero eyebrow="Guides" title="Answers to what owners ask." sub="The questions Nigerian business owners search for most, answered plainly, with what to do next." />
      <section className="container mx-auto max-w-5xl py-16 sm:py-20">
        <ul className="grid gap-4 md:grid-cols-2">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link href={guidePath(guide)} className="group flex h-full flex-col justify-between gap-4 rounded-xl border border-line-soft bg-paper-raised p-6 transition-colors hover:border-highlight">
                <span>
                  <span className="block font-sans text-xl font-semibold leading-snug text-ink">{guide.h1}</span>
                  <span className="mt-2 block text-ink-soft">{guide.lede}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-brand">Read the answer <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const guide = guideBySlug(slug ?? "");
  useScrollToTop();
  usePageMeta(guide?.title ?? "Guide not found", guide?.description ?? "This guide is not on the site.");
  const startCheck = useStartCheck();
  if (!guide) {
    return (
      <SiteShell>
        <PageHero eyebrow="Guides" title="Guide not found." sub="This guide is not on the site.">
          <Link href="/guides" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-brand">See all guides <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </PageHero>
      </SiteShell>
    );
  }
  return (
    <SiteShell>
      <article aria-labelledby="guide-title">
        <header className="border-b border-line">
          <div className="container mx-auto max-w-3xl pt-14 pb-12 sm:pt-20">
            <Link href="/guides" className="text-sm font-semibold text-brand">Guides</Link>
            <h1 id="guide-title" className="font-display mt-3 text-[clamp(2.2rem,6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">{guide.h1}</h1>
            <p className="mt-5 text-[clamp(1.1rem,2.2vw,1.3rem)] leading-relaxed text-ink-soft">{guide.lede}</p>
            <button type="button" onClick={startCheck} className="group mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-plum to-highlight-ink px-6 py-3.5 font-semibold text-white transition-colors hover:brightness-110">
              Start your free Business Health Check <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </button>
          </div>
        </header>
        <div className="container mx-auto max-w-3xl space-y-12 py-14">
          {guide.sections.map((section) => (
            <section key={section.heading} aria-labelledby={`h-${section.heading}`}>
              <h2 id={`h-${section.heading}`} className="font-sans text-2xl font-semibold tracking-tight text-ink">{section.heading}</h2>
              {section.paragraphs?.map((text) => <p key={text} className="mt-4 text-lg leading-relaxed text-ink-600">{text}</p>)}
              {section.points && (
                <ul className="mt-4 space-y-3">
                  {section.points.map((text) => <li key={text} className="flex gap-3 text-lg leading-relaxed text-ink-600"><Check className="mt-1.5 h-4 w-4 shrink-0 text-highlight-ink" aria-hidden />{text}</li>)}
                </ul>
              )}
            </section>
          ))}

          <section aria-labelledby="fix-title" className="rounded-xl border border-brand-line bg-brand-tint p-6">
            <h2 id="fix-title" className="font-sans text-2xl font-semibold tracking-tight text-ink">The fix, here</h2>
            <ul className="mt-4 divide-y divide-brand-line">
              {guide.services.map((id) => {
                const product = productById(id)!;
                return (
                  <li key={id}>
                    <Link href={id === "business_health_check" ? "/check" : servicePath(product)} className="group flex items-start justify-between gap-4 py-4">
                      <span>
                        <span className="block font-semibold text-ink group-hover:text-brand">{product.name}</span>
                        <span className="mt-1 block text-ink-soft">{product.short}</span>
                      </span>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{priceLabel(product.price)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="faq-title">
            <h2 id="faq-title" className="font-sans text-2xl font-semibold tracking-tight text-ink">Questions owners ask</h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {guide.faq.map((item) => (
                <div key={item.q} className="py-5">
                  <dt className="font-semibold text-ink">{item.q}</dt>
                  <dd className="mt-2 leading-relaxed text-ink-soft">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </article>
      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
