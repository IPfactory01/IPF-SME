/**
 * The interactive parts of the public pages: the home page's hero and blocks, the journey stepper and problem-area
 * picker (How we work), the questions (Questions) and the closing band. Copy comes from shared/businessSupport.ts
 * (concept note v0.8.1, section 16) and shared/products.ts.
 */
import { Reveal, Stagger } from "@/components/motion";
import { onSectionLinkClick } from "@/lib/scrollToSection";
import { BRAND } from "@shared/brand";
import { buildJourney, PROBLEM_AREAS, PROMISE } from "@shared/businessSupport";
import { GUIDES, guidePath } from "@shared/guides";
import { DELIVERY_PROMISE, MENU_PRODUCTS, NEED_DETAILS, NEED_LEAD, NEEDS, productById, servicePath } from "@shared/products";
import { DeliveryPromise } from "@/components/store/StoreBits";
import { ServiceTile } from "@/components/store/ServiceTile";
import { useServicePricesOrDefault } from "@/lib/servicePrices";
import { ArrowDown, ArrowRight, Plus } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";

/** The free check: the external form when one is configured, otherwise the on-site check. */
export function useStartCheck() {
  const [, setLocation] = useLocation();
  return () => {
    if (BRAND.applyUrl) {
      window.open(BRAND.applyUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setLocation("/check");
  };
}

export function CtaButton({ onClick, tone = "dark", children, className = "" }: { onClick: () => void; tone?: "dark" | "light"; children: React.ReactNode; className?: string }) {
  const colours = tone === "dark" ? "bg-gradient-to-r from-brand-plum to-highlight-ink text-white hover:brightness-110 shadow-[0_18px_40px_-18px_rgba(203,55,86,0.75)]" : "bg-highlight text-brand-deep hover:bg-highlight-hover shadow-[0_18px_40px_-18px_rgba(87,195,189,0.8)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex h-14 items-center justify-center rounded-xl px-8 text-base font-semibold transition-[color,background-color,filter,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] active:duration-75 ${colours} ${className}`}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

export function Hero({ onStart }: { onStart: () => void }) {
  const [lead1, lead2, close] = PROMISE;
  const sentences = PROBLEM_AREAS.filter((area) => area.siteSentence).map((area) => area.siteSentence!);
  const [index, setIndex] = useState(0);
  // With "reduce motion" on, nothing on the page moves by itself: the sentence stays put.
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % sentences.length), 5000);
    return () => window.clearInterval(timer);
  }, [sentences.length]);

  return (
    <section id="top" className="relative overflow-hidden border-b border-line pt-10 pb-16 sm:pt-20 md:pt-28 md:pb-24">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand-plum/15 blur-3xl" />
        <div className="absolute -right-24 top-10 h-[24rem] w-[24rem] rounded-full bg-highlight/20 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[22rem] w-[22rem] rounded-full bg-highlight-ink/10 blur-3xl" />
      </div>

      <div className="relative container mx-auto max-w-5xl px-4 text-center">
        {/* The first screen is all there at once (R70): nothing here waits on an animation. */}
        <p className="mx-auto mb-6 inline-flex items-center gap-2 border border-brand-line sm:mb-8 bg-paper-raised/70 px-4 py-1.5 text-xs font-semibold text-brand backdrop-blur">
          <span aria-hidden className="inline-flex h-2 w-2 rounded-full bg-brand" />
          {BRAND.productEndorsement}
        </p>

        <h1 className="mb-6 font-serif text-[2.75rem] font-normal leading-[1.05] tracking-tight text-ink sm:text-7xl md:text-8xl">
          <span className="inline-block">{lead1}</span>{" "}
          <span className="inline-block">{lead2}</span>{" "}
          <span className="relative inline-block font-normal">
            {close}
            <span aria-hidden className="absolute -bottom-1 left-0 h-[0.08em] w-full bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
          </span>
        </h1>

        <div>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-ink-600 sm:text-xl">
            Today, your business is busy but the money is not showing. We find the real problem, fix it with you on your own numbers, and stay until you see the shift.
          </p>
          <div className="flex flex-col items-center gap-3">
            <CtaButton onClick={onStart} className="w-full max-w-sm">Start your free Business Health Check</CtaButton>
            <p className="text-sm text-ink-muted">Free. Ten minutes on your phone. Your result straight away.</p>
            <p className="text-sm text-ink-muted">Know what you need? <Link href="/services" className="font-semibold text-brand underline underline-offset-4">See our services</Link>.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="group mx-auto mt-12 flex w-full max-w-xl flex-col items-center gap-2"
          aria-label="Start the Business Health Check"
        >
          <span className="text-xs font-semibold text-ink-muted">Sound familiar?</span>
          <span className="relative block h-24 w-full overflow-hidden sm:h-10">
            {/* The first sentence is there from the start; each next one rises in. */}
            <span
              key={index}
              style={{ "--rise-from": "18px" } as React.CSSProperties}
              className={`absolute inset-0 flex items-center justify-center px-2 font-serif text-lg italic leading-snug text-ink-700 transition-colors group-hover:text-brand ${index ? "rise-in" : ""}`}
            >
              &ldquo;{sentences[index]}&rdquo;
            </span>
          </span>
        </button>

        <a href="#problem" onClick={onSectionLinkClick} aria-label="Scroll down" className="mx-auto mt-6 flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-faint hover:border-brand hover:text-brand">
          <ArrowDown className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

/**
 * The home page's middle: owners' problems, each leading to the service that answers it; three services to start with;
 * and how we work, in three steps. Each links on to its own page, so the home page stays short.
 */
export function ProblemsToServices() {
  return (
    <section id="problems" aria-labelledby="problems-heading" className="scroll-mt-16 border-b border-line bg-paper-sunken/50 py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <Reveal className="max-w-3xl">
          <p className="text-sm font-semibold text-highlight-ink">Your problem, and the fix</p>
          <h2 id="problems-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">What problem are you facing right now?</h2>
          <p className="mt-4 text-lg text-ink-600">Pick the one that sounds like you. The fix is right under it.</p>
        </Reveal>
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEEDS.map((need) => {
            const product = productById(NEED_LEAD[need])!;
            return (
              <li key={need}>
                <Link href={servicePath(product)} className="group flex h-full flex-col justify-between gap-6 rounded-xl border border-line-soft bg-paper-raised p-6 transition-[transform,box-shadow,border-color] hover:border-highlight duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-32px_rgba(18,50,79,0.55)]">
                  <span className="font-serif text-xl italic leading-snug text-ink-750">&ldquo;{NEED_DETAILS[need].ownerWords}&rdquo;</span>
                  <span className="border-t border-line-soft pt-4">
                    <span className="block text-xs font-semibold text-ink-muted">The fix</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 font-semibold text-brand">{product.name} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 text-ink-soft">Not sure which one it is? <Link href="/check" className="font-semibold text-brand underline underline-offset-4">Take the free Business Health Check</Link>. In ten minutes it tells you the problem and the fix.</p>
        <nav aria-label="Owners also ask" className="mt-10 border-t border-line pt-6">
          <p className="text-sm font-semibold text-ink-muted">Owners also ask</p>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {GUIDES.map((guide) => <li key={guide.slug}><Link href={guidePath(guide)} className="font-semibold text-brand underline-offset-4 hover:underline">{guide.h1}</Link></li>)}
          </ul>
        </nav>
      </div>
    </section>
  );
}

/** The services most owners start with, and the way to all of them. */
export const FEATURED_SERVICES = ["cash_flow_forecast", "business_review", "six_week_fix"] as const;

export function FeaturedServices() {
  const prices = useServicePricesOrDefault();
  return (
    <section aria-labelledby="featured-heading" className="border-b border-line py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-sm font-semibold text-brand">Services</p>
            <h2 id="featured-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">Where most owners start.</h2>
          </Reveal>
          <Link href="/services" className="group inline-flex items-center gap-1.5 font-semibold text-brand">See all {MENU_PRODUCTS.length} services <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
        </div>
        <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURED_SERVICES.map((id) => <ServiceTile key={id} product={productById(id)!} prices={prices} />)}
        </ul>
      </div>
    </section>
  );
}

export function HowWeWorkTeaser() {
  const steps = [
    { title: "Find it", body: "Where is your business today? The free Business Health Check shows you in ten minutes. A two-week Business Review names the one problem to fix first." },
    { title: "Fix it", body: "We do the work for you in days, or work beside your team on that problem for six weeks. You get finished work, not advice." },
    { title: "See the shift", body: "We agree one number at the start, like cash at month end. We check it with you every week until it moves from where it was to where it should be." },
  ];
  return (
    <section aria-labelledby="how-heading" className="border-b border-line py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-sm font-semibold text-highlight-ink">How we fix it</p>
            <h2 id="how-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">Find it. Fix it. See the shift.</h2>
          </Reveal>
          <Link href="/how-we-work" className="group inline-flex items-center gap-1.5 font-semibold text-brand">How we work <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line-soft bg-paper-raised p-6">
              <span className="inline-block bg-gradient-to-br from-brand-plum via-highlight-ink to-highlight bg-clip-text font-display text-5xl font-semibold leading-none tracking-[-0.04em] text-transparent">{index + 1}</span>
              <h3 className="mt-4 font-sans text-xl font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <DeliveryPromise className="mt-8 text-sm text-ink-muted" />
      </div>
    </section>
  );
}

/** How it works: the journey as a stepper that plays through on its own until the visitor picks a step. */
export function Journey({ heading = "How it works", sub = "From the free check to finished work. Tap a step." }: { heading?: string; sub?: string }) {
  const prices = useServicePricesOrDefault();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const journey = useMemo(() => buildJourney(prices), [prices]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !inView) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % journey.length), 4500);
    return () => window.clearTimeout(timer);
  }, [active, auto, inView]);

  const choose = (index: number) => {
    setAuto(false);
    setActive(index);
  };

  return (
    <section id="how" className="border-b border-line py-24">
      <div ref={ref} className="container mx-auto max-w-4xl">
        <Reveal className="mb-14 text-center">
          <h2 className="font-display text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">{heading}</h2>
          <p className="mt-3 text-ink-muted">{sub}</p>
        </Reveal>
        <ol className="relative">
          {journey.map((step, index) => {
            const open = index === active;
            const done = index < active;
            return (
              <li key={step.id} className="relative pb-3 last:pb-0">
                {index < journey.length - 1 && (
                  <span aria-hidden className="absolute left-[36px] top-[56px] -bottom-4 w-px bg-line sm:left-[40px] sm:top-[60px] sm:-bottom-5">
                    <span className={`absolute inset-0 origin-top bg-brand transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${done ? "scale-y-100" : "scale-y-0"}`} />
                  </span>
                )}
                <button type="button" onClick={() => choose(index)} aria-expanded={open} className={`relative flex w-full items-start gap-5 border p-4 text-left transition-colors duration-300 sm:p-5 ${open ? "border-brand bg-paper-raised shadow-[0_20px_50px_-30px_rgba(18,50,79,0.6)]" : "border-transparent hover:bg-paper-raised/70"}`}>
                  <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center font-mono text-sm font-semibold transition-[color,background-color,transform] duration-300 ${open ? "scale-110" : ""} ${open || done ? "bg-brand text-paper" : "border border-line-strong bg-paper text-ink-muted"}`}>
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-sans text-lg font-semibold tracking-[-0.01em] transition-colors ${open ? "text-ink" : "text-ink-600"}`}>{step.name}</span>
                    {open && (
                      <span key="body" className="rise-in block overflow-hidden">
                        <span className="block pt-2 leading-relaxed text-ink-soft">{step.body}</span>
                        {auto && inView && <span key={`timer-${index}`} aria-hidden className="grow-x mt-4 block h-0.5 bg-highlight" />}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Where businesses get stuck: each problem opens to show what we do about it and the number we watch. */
export function StuckPicker({ onStart }: { onStart: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const areas = PROBLEM_AREAS.filter((area) => area.siteSentence);
  return (
    <section id="stuck" className="border-b border-line bg-paper-sunken/50 py-24">
      <div className="container mx-auto max-w-5xl">
        <Reveal className="mb-12 text-center">
          <span className="mb-3 block text-sm font-semibold text-ink-muted">Where businesses get stuck</span>
          <h2 className="font-display text-[clamp(2.1rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">Pick yours.</h2>
          <p className="mt-3 text-ink-muted">Not sure which one it is? That is what the free Business Health Check finds out.</p>
        </Reveal>
        <Stagger className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {areas.map((area) => {
            const isOpen = open === area.number;
            return (
              <div key={area.number} className={`border bg-paper transition-colors duration-300 ${isOpen ? "border-brand shadow-[0_24px_60px_-35px_rgba(18,50,79,0.7)]" : "border-line hover:border-brand"}`}>
                <button type="button" onClick={() => setOpen(isOpen ? null : area.number)} aria-expanded={isOpen} className="group flex w-full items-center justify-between gap-4 p-5 text-left">
                  <span className="font-serif text-lg italic leading-snug text-ink-750">&ldquo;{area.siteSentence}&rdquo;</span>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-[color,background-color,border-color,transform] duration-300 ${isOpen ? "rotate-45 border-brand bg-brand text-paper" : "border-line text-ink-faint group-hover:border-brand group-hover:text-brand"}`}>
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
                {isOpen && (
                    <div key="detail" className="rise-in overflow-hidden">
                      <div className="grid gap-4 border-t border-line px-5 pb-6 pt-5">
                        <div>
                          <p className="text-xs font-semibold text-brand">{area.name} · what we do together</p>
                          <p className="mt-1.5 leading-relaxed text-ink-700">{area.together}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-brand">Measure of Success</p>
                          <p className="mt-1.5 leading-relaxed text-ink-700">{area.measure}</p>
                        </div>
                        <button type="button" onClick={onStart} className="group inline-flex w-fit items-center gap-2 rounded-lg bg-gradient-to-r from-brand-plum to-highlight-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:brightness-110">
                          Check this <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </div>
                )}
              </div>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}

/** The questions owners ask before they buy, kept in shared/siteQuestions.ts. */
export { SITE_QUESTIONS } from "@shared/siteQuestions";

/** One group of questions, each opening to its answer. */
export function Faq({ id, heading, items }: { id: string; heading: string; items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="font-sans text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">{heading}</h2>
      <div className="mt-4 divide-y divide-line border-y border-line">
          {items.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q}>
                <button type="button" onClick={() => setOpen(isOpen ? null : index)} aria-expanded={isOpen} className="group flex w-full items-center justify-between gap-4 py-5 text-left font-semibold text-ink">
                  <span className="transition-colors group-hover:text-brand">{item.q}</span>
                  <span className={`text-xl leading-none text-brand transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`} aria-hidden>+</span>
                </button>
                {isOpen && (
                  <div key="answer" className="rise-in overflow-hidden">
                    <p className="pb-5 leading-relaxed text-ink-soft">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}

/** The closing band of every public page: the free check. */
export function CheckCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-deep via-brand to-brand-plum py-20 text-paper">
      <Reveal className="relative container mx-auto max-w-3xl text-center">
        <img src={BRAND.logoOnDarkUrl} alt={BRAND.organisationName} className="mx-auto mb-8 h-28 w-auto" />
        <h2 className="font-display mb-4 text-[clamp(2.1rem,5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Start with the free Business Health Check.</h2>
        <p className="mx-auto mb-8 max-w-xl text-on-dark-muted">Ten minutes. No card. You&apos;ll know where you stand before you decide anything.</p>
        <CtaButton onClick={onStart} tone="light">Start with a free Business Health Check</CtaButton>
      </Reveal>
    </section>
  );
}
