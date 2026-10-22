/**
 * The menu (/services): the four ways to buy, then every product grouped by the need it answers, each with its price
 * and delivery time. Everything comes from shared/products.ts. Operational Business Plan, pages 10, 11 and 19.
 */
import { Reveal } from "@/components/motion";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { displayPrice } from "@/lib/productPrice";
import { useServicePricesOrDefault } from "@/lib/servicePrices";
import { BRAND } from "@shared/brand";
import { menuEntry, NEED_DETAILS, NEEDS, priceLabel, productsForNeed, servicePath, WAY_DETAILS, WAYS_TO_BUY } from "@shared/products";
import { ArrowRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.2em] text-highlight-ink";

export default function ServicesPage() {
  useScrollToTop();
  usePageMeta("Services", "Every product of The Shift, by IP Factory, with its price and delivery time: assessments, Done for You work, the Six-Week Fix and Monthly Services.");
  const prices = useServicePricesOrDefault();
  return (
    <SiteShell>
      <section className="border-b border-line py-14 sm:py-20">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <p className={EYEBROW}>Services</p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold tracking-tight sm:text-5xl">Pick the help your business needs.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">Every product, its price and its delivery time, up front. Not sure where to start? The free Business Health Check names your first step.</p>
            <Link href="/check" className="group mt-8 inline-flex h-12 items-center bg-ink px-6 text-sm font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-charcoal">
              Take the free Business Health Check <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>

      <section aria-labelledby="ways" className="border-b border-line bg-paper-sunken/50 py-14 sm:py-20">
        <div className="container mx-auto max-w-5xl">
          <h2 id="ways" className="font-serif text-3xl font-bold tracking-tight">Four ways to buy</h2>
          <ul aria-label="Ways to buy" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {WAYS_TO_BUY.map((way) => (
              <li key={way} className="border border-line bg-paper-raised p-6">
                <h3 className="font-serif text-xl font-bold">{WAY_DETAILS[way].name}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{WAY_DETAILS[way].summary}</p>
                <p className="mt-3 text-sm font-semibold text-brand">{WAY_DETAILS[way].charge}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="by-need" className="py-14 sm:py-20">
        <div className="container mx-auto max-w-5xl">
          <h2 id="by-need" className="font-serif text-3xl font-bold tracking-tight">By what you need</h2>
          <div className="mt-10 space-y-12">
            {NEEDS.map((need) => {
              const products = productsForNeed(need);
              if (!products.length) return null;
              return (
                <section key={need} aria-labelledby={`need-${need}`}>
                  <h3 id={`need-${need}`} className="font-serif text-2xl font-bold">{NEED_DETAILS[need].name}</h3>
                  <p className="mt-1 font-serif italic text-ink-soft">&ldquo;{NEED_DETAILS[need].ownerWords}&rdquo;</p>
                  <ul className="mt-5 divide-y divide-line border-y border-line">
                    {products.map((product) => {
                      const entry = menuEntry(product, need);
                      return (
                      <li key={product.id}>
                        <Link href={servicePath(product)} className="group flex flex-col gap-2 py-5 transition-colors hover:bg-paper-raised sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-3">
                          <span className="min-w-0">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">{WAY_DETAILS[product.way].name}</span>
                            <span className="mt-1 block font-serif text-xl font-bold text-ink group-hover:text-brand">{entry.name}</span>
                            <span className="mt-1 block leading-relaxed text-ink-soft">{entry.short}</span>
                          </span>
                          <span className="shrink-0 sm:w-56 sm:text-right">
                            <span className="block font-sans text-lg font-bold text-ink">{priceLabel(displayPrice(product, prices))}</span>
                            <span className="block text-sm text-ink-muted">{product.delivery}</span>
                            <span className="mt-2 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-brand">See details <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                          </span>
                        </Link>
                      </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <p className="mt-14 border border-brand-line bg-brand-tint p-5 text-brand-deep">
            Work that needs a project team, across several parts of a larger business, goes to {BRAND.trackRecord.groupUrl ? <a href={BRAND.trackRecord.groupUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{BRAND.trackRecord.groupName}</a> : BRAND.trackRecord.groupName}, our parent firm, and is quoted per project.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
