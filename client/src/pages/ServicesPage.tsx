/**
 * The menu (/services), laid out as a store (ET approved the design on 22 October 2026): one tile per product with a
 * drawing of what it hands over, its promise, its price, and Learn more and Buy. A filter by way to buy; the free check
 * for owners who are not sure; the three promises behind every product. Products come from shared/products.ts and
 * their stories from shared/productStories.ts.
 */
import { ServiceTile } from "@/components/store/ServiceTile";
import { PROMISES } from "@/components/store/StoreBits";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { useServicePricesOrDefault } from "@/lib/servicePrices";
import { BRAND } from "@shared/brand";
import { MENU_PRODUCTS, NEED_DETAILS, startingAmount, WAY_DETAILS, WAYS_TO_BUY, type WayToBuy } from "@shared/products";
import { displayPrice } from "@/lib/productPrice";
import { ArrowRight } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { PAGE_META } from "@shared/seo";

/** The eyebrow over a page or section heading: small crimson capitals. */
export const EYEBROW = "text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink";

export default function ServicesPage() {
  useScrollToTop();
  usePageMeta(PAGE_META.services.title, PAGE_META.services.description);
  const prices = useServicePricesOrDefault();
  const [way, setWay] = useState<WayToBuy | "all">("all");
  // "All" runs cheapest first, by what the owner pays to start (a Monthly Service's first quarter), equal prices in menu
  // order. A single way to buy keeps the menu's own order.
  const shown = way === "all"
    ? MENU_PRODUCTS.map((product, index) => ({ product, index, start: startingAmount(displayPrice(product, prices)) }))
      .sort((a, b) => a.start - b.start || a.index - b.index)
      .map(({ product }) => product)
    : MENU_PRODUCTS.filter((product) => product.way === way);

  return (
    <SiteShell>
      <section className="container mx-auto max-w-6xl pt-16 pb-8 text-center sm:pt-20">
        <h1 className="font-display mx-auto max-w-3xl text-[clamp(2.6rem,7vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink">Help that does the work.</h1>
        <p className="mx-auto mt-5 max-w-xl text-[clamp(1.15rem,2.4vw,1.45rem)] leading-snug text-ink-soft">Finished work in days. A fix in six weeks. Every price on the page.</p>
        <div role="group" aria-label="Filter by way to buy" className="mt-8 flex flex-wrap justify-center gap-2">
          {(["all", ...WAYS_TO_BUY] as const).map((option) => (
            <button key={option} type="button" aria-pressed={way === option} onClick={() => setWay(option)} className={`border px-4 py-2 text-sm font-semibold transition-colors ${way === option ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised text-ink-soft hover:border-ink-muted"}`}>
              {option === "all" ? "All" : WAY_DETAILS[option].name}
            </button>
          ))}
        </div>
        {way !== "all" && <p className="mx-auto mt-4 max-w-xl text-sm text-ink-muted">{WAY_DETAILS[way].charge}</p>}
      </section>

      <section aria-label="Products" className="container mx-auto max-w-6xl pb-16">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((product) => <ServiceTile key={product.id} product={product} prices={prices} />)}
        </ul>
      </section>

      <section className="bg-ink text-paper">
        <div className="container mx-auto grid max-w-6xl items-center gap-10 py-16 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-[clamp(2rem,4.6vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">Not sure which one you need?</h2>
            <p className="mt-4 max-w-lg text-lg text-on-dark-muted">The free Business Health Check takes ten minutes on your phone. It names your first step, and the one after it.</p>
            <Link href="/check" className="group mt-7 inline-flex h-12 items-center gap-2 bg-highlight px-7 font-bold text-brand-deep transition-[transform,background-color] hover:bg-highlight-hover active:scale-[0.97]">
              Take the free check <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <ul aria-label="What owners tell us" className="grid gap-2.5">
            {(["finance", "people", "funding"] as const).map((need) => <li key={need} className="border border-paper/20 px-4 py-3.5 font-serif text-lg italic">&ldquo;{NEED_DETAILS[need].ownerWords}&rdquo;</li>)}
          </ul>
        </div>
      </section>

      <section aria-label="Why buy from The Shift" className="container mx-auto grid max-w-6xl gap-9 py-16 md:grid-cols-3">
        {PROMISES.map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon className="h-9 w-9 text-highlight-ink" strokeWidth={1.6} aria-hidden />
            <h2 className="font-display mt-3.5 text-xl font-extrabold tracking-[-0.015em] text-ink">{title}</h2>
            <p className="mt-2 text-ink-soft">{body}</p>
          </div>
        ))}
      </section>

      <p className="container mx-auto max-w-6xl pb-16 text-sm text-ink-muted">
        Work that needs a project team, across several parts of a larger business, goes to {BRAND.trackRecord.groupUrl ? <a href={BRAND.trackRecord.groupUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-4">{BRAND.trackRecord.groupName}</a> : BRAND.trackRecord.groupName}, our parent firm, and is quoted per project.
      </p>
    </SiteShell>
  );
}
