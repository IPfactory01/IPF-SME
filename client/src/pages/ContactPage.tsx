/**
 * Contact (/contact): book a free 20-minute call, write to us, and where we work. Clients already working with us
 * sign in. Addresses come from shared/brand.ts.
 */
import { CheckCta, useStartCheck } from "@/components/home/HomeSections";
import { PageHero } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { BRAND } from "@shared/brand";
import { ArrowRight, CalendarCheck, Mail, MapPin } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export default function ContactPage() {
  useScrollToTop();
  usePageMeta("Contact", `Book a free 20-minute call with ${BRAND.productName}, or write to ${BRAND.businessSupportMailbox}. We work with businesses in Lagos and Abuja, and online.`);
  const startCheck = useStartCheck();
  const card = "flex flex-col bg-paper-raised p-7";

  return (
    <SiteShell>
      <PageHero eyebrow="Contact" title="Talk to a person." sub="A free 20-minute call, by phone or video, to agree what is wrong and where to start. Or write to us." />

      <section aria-label="Ways to reach us" className="bg-paper-sunken/60 py-16 sm:py-20">
        <ul className="container mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          <li className={card}>
            <CalendarCheck className="h-9 w-9 text-highlight-ink" strokeWidth={1.6} aria-hidden />
            <h2 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.02em] text-ink">Book a free call</h2>
            <p className="mt-2 flex-1 leading-relaxed text-ink-soft">Twenty minutes. Pick a time that suits you. If a paid service fits, we send the payment link after the call.</p>
            <a href={BRAND.discoveryCallUrl} target="_blank" rel="noopener noreferrer" className="group mt-6 inline-flex h-12 w-fit items-center gap-2 bg-brand px-6 font-bold text-paper transition-[transform,background-color] hover:bg-brand-deep active:scale-[0.97]">Book a free call <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></a>
          </li>
          <li className={card}>
            <Mail className="h-9 w-9 text-highlight-ink" strokeWidth={1.6} aria-hidden />
            <h2 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.02em] text-ink">Write to us</h2>
            <p className="mt-2 flex-1 leading-relaxed text-ink-soft">We answer within one working day.</p>
            <a href={`mailto:${BRAND.businessSupportMailbox}`} className="mt-6 w-fit select-all text-xl font-bold text-brand underline underline-offset-4">{BRAND.businessSupportMailbox}</a>
          </li>
          <li className={card}>
            <MapPin className="h-9 w-9 text-highlight-ink" strokeWidth={1.6} aria-hidden />
            <h2 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.02em] text-ink">Where we work</h2>
            <p className="mt-2 flex-1 leading-relaxed text-ink-soft">We start with businesses in Lagos and Abuja. Most of the work happens online, so where you are matters less than you think.</p>
          </li>
        </ul>
      </section>

      <section className="border-b border-line py-12">
        <p className="container mx-auto max-w-6xl text-ink-soft">Already working with us? <Link href="/login" className="font-semibold text-brand underline underline-offset-4">Client sign in</Link>. Not sure what you need yet? <Link href="/check" className="font-semibold text-brand underline underline-offset-4">Take the free Business Health Check</Link>.</p>
      </section>

      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
