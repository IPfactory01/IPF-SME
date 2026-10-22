/**
 * The interactive parts of the public pages: the home page's hero and blocks, the journey stepper and problem-area
 * picker (How we work), the questions (Questions) and the closing band. Copy comes from shared/businessSupport.ts
 * (concept note v0.8.1, section 16) and shared/products.ts.
 */
import { EASE, Reveal } from "@/components/motion";
import { onSectionLinkClick } from "@/lib/scrollToSection";
import { BRAND } from "@shared/brand";
import { buildJourney, PROBLEM_AREAS, PROMISE } from "@shared/businessSupport";
import { DELIVERY_PROMISE, MENU_PRODUCTS, NEED_DETAILS, NEED_LEAD, NEEDS, productById, servicePath } from "@shared/products";
import { ServiceTile } from "@/components/store/ServiceTile";
import { useServicePricesOrDefault } from "@/lib/servicePrices";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  const colours = tone === "dark" ? "bg-ink text-paper hover:bg-charcoal shadow-[0_18px_40px_-18px_rgba(18,50,79,0.7)]" : "bg-highlight text-brand-deep hover:bg-highlight-hover shadow-[0_18px_40px_-18px_rgba(54,183,224,0.8)]";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`group inline-flex h-14 items-center justify-center px-8 text-sm font-semibold uppercase tracking-wider sm:tracking-widest transition-colors ${colours} ${className}`}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </motion.button>
  );
}

const word = {
  hidden: { opacity: 0, y: "0.4em", filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
};

export function Hero({ onStart }: { onStart: () => void }) {
  const [lead1, lead2, close] = PROMISE;
  const sentences = PROBLEM_AREAS.filter((area) => area.siteSentence).map((area) => area.siteSentence!);
  const [index, setIndex] = useState(0);
  // With "reduce motion" on, nothing on the page moves by itself: the sentence stays put and the colour stays still.
  const calm = useReducedMotion();
  useEffect(() => {
    if (calm) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % sentences.length), 3200);
    return () => window.clearInterval(timer);
  }, [sentences.length, calm]);

  return (
    <section id="top" className="relative overflow-hidden border-b border-line pt-20 pb-20 md:pt-28 md:pb-24">
      {/* Slow-moving colour from the logo, behind the headline. */}
      <motion.div aria-hidden className="pointer-events-none absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-brand-plum/15 blur-3xl" animate={calm ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }} transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div aria-hidden className="pointer-events-none absolute -right-24 top-10 h-[26rem] w-[26rem] rounded-full bg-highlight/20 blur-3xl" animate={calm ? undefined : { x: [0, -50, 0], y: [0, 50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />

      <div className="relative container mx-auto max-w-5xl px-4 text-center">
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="mx-auto mb-8 inline-flex items-center gap-2 border border-brand-line bg-paper-raised/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand backdrop-blur">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-highlight opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-highlight" /></span>
          {BRAND.productEndorsement}
        </motion.p>

        <motion.h1 initial="hidden" animate="show" transition={{ staggerChildren: 0.18 }} className="mb-8 font-serif text-5xl font-black leading-[1.05] tracking-tight text-ink sm:text-7xl md:text-8xl">
          <motion.span variants={word} className="inline-block">{lead1}</motion.span>{" "}
          <motion.span variants={word} className="inline-block">{lead2}</motion.span>{" "}
          <motion.span variants={word} className="relative inline-block font-normal italic">
            {close}
            <motion.span aria-hidden className="absolute -bottom-1 left-0 h-[0.08em] w-full origin-left bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 1.1, duration: 0.9, ease: EASE }} />
          </motion.span>
        </motion.h1>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8, ease: EASE }}>
          <p className="mx-auto mb-6 max-w-3xl font-serif text-xl italic leading-relaxed text-ink-soft sm:text-2xl">
            &ldquo;Some owners know exactly what their business needs. Most can only feel the problem. Either way, we start there.&rdquo;
          </p>
          <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-ink-600">
            On {BRAND.productName}, we get in with you, name the real problem, show you exactly what to do, give you the tools, and check your work every week until the number moves.
          </p>
          <div className="flex flex-col items-center gap-4">
            <CtaButton onClick={onStart} className="w-full max-w-sm">Start with a free Business Health Check</CtaButton>
            <p className="text-sm text-ink-muted">Ten minutes, on your phone. Or <Link href="/services" className="font-semibold text-brand underline underline-offset-4">see our services</Link>.</p>
          </div>
        </motion.div>

        <motion.button
          type="button"
          onClick={onStart}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.8 }}
          className="group mx-auto mt-14 flex w-full max-w-xl flex-col items-center gap-2"
          aria-label="Start the Business Health Check"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Sound familiar?</span>
          <span className="relative block h-24 w-full overflow-hidden sm:h-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={index}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="absolute inset-0 flex items-center justify-center px-2 font-serif text-lg italic leading-snug text-ink-700 transition-colors group-hover:text-brand"
              >
                &ldquo;{sentences[index]}&rdquo;
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>

        <motion.a href="#problems" onClick={onSectionLinkClick} aria-label="Scroll down" className="mx-auto mt-6 flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-faint hover:border-brand hover:text-brand" animate={calm ? undefined : { y: [0, 6, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <ArrowDown className="h-4 w-4" />
        </motion.a>
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
    <section id="problems" aria-labelledby="problems-heading" className="scroll-mt-16 border-b border-line py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <Reveal className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">Start with what's wrong</p>
          <h2 id="problems-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">Tell us what it feels like. We'll show you where to start.</h2>
        </Reveal>
        <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEEDS.map((need) => {
            const product = productById(NEED_LEAD[need])!;
            return (
              <li key={need}>
                <Link href={servicePath(product)} className="group flex h-full flex-col justify-between gap-6 bg-paper-raised p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-32px_rgba(18,50,79,0.55)]">
                  <span className="font-serif text-xl italic leading-snug text-ink-750">&ldquo;{NEED_DETAILS[need].ownerWords}&rdquo;</span>
                  <span>
                    <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">{NEED_DETAILS[need].name}</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 font-semibold text-brand">{product.name} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-8 text-ink-soft">Not sure which it is? <Link href="/check" className="font-semibold text-brand underline underline-offset-4">Take the free Business Health Check</Link>. It names your first step in ten minutes.</p>
      </div>
    </section>
  );
}

/** The services most owners start with, and the way to all of them. */
export const FEATURED_SERVICES = ["cash_flow_forecast", "business_review", "six_week_fix"] as const;

export function FeaturedServices() {
  const prices = useServicePricesOrDefault();
  return (
    <section aria-labelledby="featured-heading" className="border-b border-line bg-paper-sunken/60 py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">Services</p>
            <h2 id="featured-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">Where most owners start.</h2>
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
    { title: "Find it", body: "The free Business Health Check, or a two-week Business Review, names the one problem to fix first." },
    { title: "Fix it", body: "We deliver finished work in days, or work with your team on one problem for six weeks." },
    { title: "See the results", body: "Every piece of work is checked before you see it, and we track the number that tells you it worked." },
  ];
  return (
    <section aria-labelledby="how-heading" className="border-b border-line py-20 sm:py-24">
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">How we work</p>
            <h2 id="how-heading" className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">Find it. Fix it. See the results.</h2>
          </Reveal>
          <Link href="/how-we-work" className="group inline-flex items-center gap-1.5 font-semibold text-brand">How we work <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-paper-raised p-6">
              <span className="font-display text-5xl font-extrabold leading-none tracking-[-0.04em] text-brand">{index + 1}</span>
              <h3 className="mt-4 font-sans text-xl font-extrabold text-ink">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-ink-muted">{DELIVERY_PROMISE}</p>
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
          <h2 className="font-display text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">{heading}</h2>
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
                    <motion.span className="absolute inset-0 origin-top bg-brand" initial={false} animate={{ scaleY: done ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE }} />
                  </span>
                )}
                <button type="button" onClick={() => choose(index)} aria-expanded={open} className={`relative flex w-full items-start gap-5 border p-4 text-left transition-colors duration-300 sm:p-5 ${open ? "border-brand bg-paper-raised shadow-[0_20px_50px_-30px_rgba(18,50,79,0.6)]" : "border-transparent hover:bg-paper-raised/70"}`}>
                  <motion.span
                    animate={{ scale: open ? 1.1 : 1 }}
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center font-mono text-sm font-semibold transition-colors duration-300 ${open || done ? "bg-brand text-paper" : "border border-line-strong bg-paper text-ink-muted"}`}
                  >
                    {index + 1}
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-sans text-lg font-extrabold tracking-[-0.01em] transition-colors ${open ? "text-ink" : "text-ink-600"}`}>{step.name}</span>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.span key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="block overflow-hidden">
                          <span className="block pt-2 leading-relaxed text-ink-soft">{step.body}</span>
                          {auto && inView && (
                            <motion.span key={`timer-${index}`} aria-hidden className="mt-4 block h-0.5 origin-left bg-highlight" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 4.5, ease: "linear" }} />
                          )}
                        </motion.span>
                      )}
                    </AnimatePresence>
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
          <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-ink-muted">Where businesses get stuck</span>
          <h2 className="font-display text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">Pick yours.</h2>
          <p className="mt-3 text-ink-muted">Not sure which one it is? That is what the free Business Health Check finds out.</p>
        </Reveal>
        <motion.div layout className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          {areas.map((area, index) => {
            const isOpen = open === area.number;
            return (
              <motion.div
                key={area.number}
                layout
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: EASE, delay: (index % 2) * 0.06, layout: { duration: 0.45, ease: EASE } }}
                className={`border bg-paper transition-colors duration-300 ${isOpen ? "border-brand shadow-[0_24px_60px_-35px_rgba(18,50,79,0.7)]" : "border-line hover:border-brand"}`}
              >
                <motion.button layout="position" type="button" onClick={() => setOpen(isOpen ? null : area.number)} aria-expanded={isOpen} className="group flex w-full items-center justify-between gap-4 p-5 text-left">
                  <span className="font-serif text-lg italic leading-snug text-ink-750">&ldquo;{area.siteSentence}&rdquo;</span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3 }} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${isOpen ? "border-brand bg-brand text-paper" : "border-line text-ink-faint group-hover:border-brand group-hover:text-brand"}`}>
                    <Plus className="h-4 w-4" />
                  </motion.span>
                </motion.button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
                      <div className="grid gap-4 border-t border-line px-5 pb-6 pt-5">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-highlight-ink">{area.name} · what we do together</p>
                          <p className="mt-1.5 leading-relaxed text-ink-700">{area.together}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-highlight-ink">Measure of Success</p>
                          <p className="mt-1.5 leading-relaxed text-ink-700">{area.measure}</p>
                        </div>
                        <button type="button" onClick={onStart} className="group inline-flex w-fit items-center gap-2 bg-ink px-5 py-3 text-xs font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-charcoal">
                          Check this <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/** The questions owners ask before they buy. The Questions page adds each service's own. */
export const SITE_QUESTIONS = [
  { q: "Do you do the work for me?", a: "Sometimes. Done for You products are finished work we deliver: accounts, a forecast, a plan or a funding pack. In a Six-Week Fix your team does the work; we prescribe, equip and review it with you every week." },
  { q: "What if you miss the delivery date?", a: DELIVERY_PROMISE },
  { q: "How do I pay?", a: "By transfer or card, through Paystack, before we start. A Six-Week Fix can be paid in three parts. Monthly Services are paid a quarter at a time." },
  { q: "What do you do with my information?", a: "We use it only to do the work you asked for. Records you upload go into private storage that only the people on your order can open. Some analysis uses AI tools, and a consultant checks everything before you get it. Our Privacy Policy lists who helps us run the service and your rights." },
  { q: "What if the Measure of Success doesn't move in six weeks?", a: "We extend your Six-Week Fix, at no charge, for up to two weeks." },
  { q: "What happens after?", a: "Thirty days on, we check in. If it helps, we suggest the next step, or a Monthly Service that keeps it going." },
];

/** One group of questions, each opening to its answer. */
export function Faq({ id, heading, items }: { id: string; heading: string; items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <h2 id={`${id}-heading`} className="font-sans text-xl font-extrabold tracking-[-0.01em] text-ink sm:text-2xl">{heading}</h2>
      <div className="mt-4 divide-y divide-line border-y border-line">
          {items.map((item, index) => {
            const isOpen = open === index;
            return (
              <div key={item.q}>
                <button type="button" onClick={() => setOpen(isOpen ? null : index)} aria-expanded={isOpen} className="group flex w-full items-center justify-between gap-4 py-5 text-left font-semibold text-ink">
                  <span className="transition-colors group-hover:text-brand">{item.q}</span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3 }} className="text-xl leading-none text-brand" aria-hidden>+</motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="answer" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                      <p className="pb-5 leading-relaxed text-ink-soft">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
      </div>
    </section>
  );
}

/** The closing band of every public page: the free check. */
export function CheckCta({ onStart }: { onStart: () => void }) {
  const calm = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-linear-to-t from-brand to-brand-plum py-20 text-paper">
      <motion.div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-highlight/20 blur-3xl" animate={calm ? undefined : { x: ["-55%", "-45%", "-55%"], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <Reveal className="relative container mx-auto max-w-3xl text-center">
        <img src={BRAND.logoOnDarkUrl} alt={BRAND.organisationName} className="mx-auto mb-8 h-28 w-auto" />
        <h2 className="font-display mb-4 text-[clamp(2.1rem,5vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">Start with the free Business Health Check.</h2>
        <p className="mx-auto mb-8 max-w-xl text-on-dark-muted">Ten minutes. No card. You&apos;ll know where you stand before you decide anything.</p>
        <CtaButton onClick={onStart} tone="light">Start with a free Business Health Check</CtaButton>
      </Reveal>
    </section>
  );
}
