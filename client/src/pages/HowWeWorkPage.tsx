/**
 * How we work (/how-we-work): the steps from the free check to finished work, the four ways to work with us and how
 * each is paid, what every piece of work comes with, and the ten places businesses get stuck. Steps from
 * shared/businessSupport.ts; ways, products and payment terms from shared/products.ts.
 */
import { CheckCta, Journey, StuckPicker, useStartCheck } from "@/components/home/HomeSections";
import { PageHero, SectionHeading } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { PROMISES, tilePrice } from "@/components/store/StoreBits";
import { displayPrice } from "@/lib/productPrice";
import { useServicePricesOrDefault } from "@/lib/servicePrices";
import { PRODUCTS, servicePath, WAY_DETAILS, WAYS_TO_BUY } from "@shared/products";
import { ArrowRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export default function HowWeWorkPage() {
  useScrollToTop();
  usePageMeta("How we work", "How The Shift works: the free Business Health Check, the four ways to work with us and how each is paid, and what every piece of work comes with.");
  const startCheck = useStartCheck();
  const prices = useServicePricesOrDefault();

  return (
    <SiteShell>
      <PageHero eyebrow="How we work" title="Find it. Fix it. See the results." sub="Every piece of work starts with the real problem and ends with a number that moved. A consultant checks it before you see it." />

      <Journey heading="The steps" sub="From the free check to finished work. Tap a step." />

      <section aria-labelledby="ways-heading" className="border-b border-line bg-paper-sunken/60 py-20 sm:py-24">
        <div className="container mx-auto max-w-6xl">
          <SectionHeading id="ways-heading" eyebrow="Four ways to work with us" title="Pick the help that fits." sub="Find out what is wrong, have us do a piece of work, fix one problem over six weeks, or keep it going every month." />
          <ul aria-label="Ways to buy" className="mt-10 grid gap-4 md:grid-cols-2">
            {WAYS_TO_BUY.map((way) => (
              <li key={way} className="flex flex-col bg-paper-raised p-7">
                <h3 className="font-display text-2xl font-extrabold tracking-[-0.02em] text-ink">{WAY_DETAILS[way].name}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{WAY_DETAILS[way].summary}</p>
                <ul className="mt-5 flex-1 divide-y divide-line-soft border-y border-line-soft">
                  {PRODUCTS.filter((product) => product.way === way).map((product) => (
                    <li key={product.id}>
                      <Link href={product.buy === "check" ? "/check" : servicePath(product)} className="group flex items-baseline justify-between gap-4 py-3">
                        <span className="font-semibold text-ink transition-colors group-hover:text-brand">{product.name}</span>
                        <span className="shrink-0 text-sm tabular-nums text-ink-soft">{tilePrice(displayPrice(product, prices)).main}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-ink-muted"><b className="font-semibold text-ink">How you pay.</b> {WAY_DETAILS[way].charge}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">Every payment is by transfer or card through Paystack. <Link href="/services" className="font-semibold text-brand underline underline-offset-4">See every service</Link>.</p>
        </div>
      </section>

      <section aria-labelledby="promises-heading" className="border-b border-line py-20 sm:py-24">
        <div className="container mx-auto max-w-6xl">
          <SectionHeading id="promises-heading" eyebrow="What every piece of work comes with" title="A date, a check and your privacy." />
          <div className="mt-10 grid gap-9 md:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="h-9 w-9 text-highlight-ink" strokeWidth={1.6} aria-hidden />
                <h3 className="font-display mt-3.5 text-xl font-extrabold tracking-[-0.015em] text-ink">{title}</h3>
                <p className="mt-2 text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
          <Link href="/questions" className="group mt-10 inline-flex items-center gap-1.5 font-semibold text-brand">Questions about paying, dates and refunds <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
        </div>
      </section>

      <StuckPicker onStart={startCheck} />
      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
