/**
 * About (/about): who runs The Shift and the firm behind it, the track record and clients, what we are and are not,
 * who it is for and who you work with, and the research behind the method. Figures from BRAND.trackRecord.
 */
import { ExperienceBehind, TrackRecord, WhyStuck } from "@/components/home/Experience";
import { CheckCta, useStartCheck } from "@/components/home/HomeSections";
import { Reveal, Stagger, staggerChild } from "@/components/motion";
import { PageHero, SectionHeading } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { BRAND } from "@shared/brand";
import { formatNaira } from "@shared/businessSupport";
import { startingPriceOf } from "@shared/products";
import { motion } from "framer-motion";
import { CheckCircle2, X } from "lucide-react";
import React from "react";

const WHO_YOU_WORK_WITH = [
  `A named ${BRAND.organisationName} consultant checks every piece of work before you get it.`,
  "Analysts prepare the work and every Session.",
  "A partner reviews plans and funding packs.",
  "We use AI for analysis and say so.",
] as const;

export default function AboutPage() {
  useScrollToTop();
  usePageMeta("About", `${BRAND.productName} is run by ${BRAND.organisationName}, the delivery and method arm of ${BRAND.trackRecord.groupName}. Our track record, who we work with, and the research behind the method.`);
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <PageHero eyebrow="About" title="Consulting experience, at the size of your business." sub={`${BRAND.productName} is run by ${BRAND.organisationName}, the delivery and method arm of ${BRAND.trackRecord.groupName}.`} />
      <TrackRecord />
      <ExperienceBehind />

      <section id="what" aria-labelledby="what-heading" className="border-b border-line bg-paper-sunken/50 py-20 sm:py-24">
        <div className="container mx-auto grid max-w-5xl grid-cols-1 items-start gap-12 md:grid-cols-2">
          <Reveal>
            <SectionHeading id="what-heading" eyebrow="What we are, and are not" title="We don't run your business; you do." />
            <ul className="mt-6 space-y-2 text-ink-600">
              <li className="flex items-center gap-3"><X className="h-4 w-4 text-highlight-ink" aria-hidden />We are not a course.</li>
              <li className="flex items-start gap-3"><X className="mt-1 h-4 w-4 shrink-0 text-highlight-ink" aria-hidden />We do not hand you a report and disappear. Every piece of work ends with a handover call, and we check in thirty days later.</li>
            </ul>
          </Reveal>
          <Reveal delay={0.12} className="space-y-5 text-lg leading-relaxed text-ink-600 md:pt-8">
            <p>We work out what is really wrong. Then we either do the work for you, or tell you what to do, hand you the tools and review it with you every week until it is done.</p>
            <p className="border border-brand-line bg-brand-tint p-5 text-base text-brand-deep">Our analysts and AI do the heavy lifting, under a named {BRAND.organisationName} consultant. We say so up front.</p>
          </Reveal>
        </div>
      </section>

      <section id="for" aria-label="Who it is for" className="border-b border-line py-20 sm:py-24">
        <div className="container mx-auto grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-2">
          <Reveal>
            <SectionHeading id="for-heading" eyebrow="Who it is for" title="Owners who already trade." />
            <p className="mt-6 text-lg leading-relaxed text-ink-600">
              Business owners in Nigeria who want a straight answer about their numbers, prices, cash, funding, people or sales. We start with businesses in Lagos and Abuja; most of the work happens online.
            </p>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Smaller business? Start with the free Business Health Check and a Done for You product, from {formatNaira(startingPriceOf("done_for_you"))}. Several problems across a larger business? Start with a Business Review; work that needs a project team goes to {BRAND.trackRecord.groupName}.
            </p>
          </Reveal>
          <div>
            <Reveal><SectionHeading id="team-heading" eyebrow="Who you work with" title="People, with AI behind them." /></Reveal>
            <Stagger as="ul" className="mt-6 space-y-3 text-lg text-ink-600">
              {WHO_YOU_WORK_WITH.map((line) => (
                <motion.li key={line} variants={staggerChild} className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-highlight-ink" aria-hidden />{line}</motion.li>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section id="research" aria-labelledby="research-heading" className="border-b border-line py-20 sm:py-24">
        <div className="container mx-auto max-w-5xl">
          <SectionHeading id="research-heading" eyebrow="The research" title="Why help on your own numbers works." />
          <WhyStuck />
        </div>
      </section>

      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
