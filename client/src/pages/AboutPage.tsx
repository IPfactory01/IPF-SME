/**
 * About (/about): who IP Factory is, where it is, who is behind it, what it does and how, and who it is for, written for
 * the searches an About page answers (ET, 10 November 2026; the words search engines read are in shared/about.ts). The
 * track record, clients and research are on Experience (/experience) since 6 November 2026.
 */
import { CheckCta, Faq, useStartCheck } from "@/components/home/HomeSections";
import { Reveal, Stagger } from "@/components/motion";
import { PageHero, SectionHeading } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { ABOUT_FAQ, ABOUT_FIGURES, ABOUT_HEADING, ABOUT_SUB } from "@shared/about";
import { BRAND } from "@shared/brand";
import { formatNaira } from "@shared/businessSupport";
import { productById, servicePath, startingPriceOf } from "@shared/products";
import { CheckCircle2 } from "lucide-react";
import React from "react";
import { Link } from "wouter";
import { PAGE_META } from "@shared/pageMeta";

/** How we work: what an owner can hold us to. */
const HOW_WE_WORK = [
  `A named ${BRAND.organisationName} consultant checks every piece of work before you get it.`,
  `Our analysts and AI do the heavy lifting, under that ${BRAND.organisationName} consultant.`,
  "A partner reviews every plan and funding pack.",
  "Every price is on the page, and we confirm your delivery date once your records are complete.",
  "Every piece of work ends with a handover call, then a Day-30 Review.",
] as const;

/** A service named in the copy, linked to its page. */
function ServiceLink({ id }: { id: string }) {
  const product = productById(id)!;
  return <Link href={servicePath(product)} className="font-semibold text-brand underline underline-offset-4">{product.name}</Link>;
}

export default function AboutPage() {
  useScrollToTop();
  usePageMeta(PAGE_META.about.title, PAGE_META.about.description);
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <PageHero eyebrow={`About ${BRAND.organisationName}`} title={ABOUT_HEADING} sub={ABOUT_SUB} />

      <section aria-label="Our experience" className="border-b border-line bg-brand-tint py-8">
        <div className="container mx-auto max-w-5xl">
          <dl className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
            {ABOUT_FIGURES.map((figure) => (
              <div key={figure.label}>
                <dt className="sr-only">{figure.label}</dt>
                <dd className="font-display text-4xl font-semibold tracking-[-0.03em] text-brand-deep">{figure.value}</dd>
                <dd className="mt-1 text-sm text-ink-600">{figure.label}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-center text-ink-600">Our track record, the clients we have worked with and the research behind the method are on <Link href="/experience" className="font-semibold text-brand underline underline-offset-4">Experience</Link>.</p>
        </div>
      </section>

      <section id="what" aria-labelledby="what-heading" className="border-b border-line bg-paper-sunken/50 py-20 sm:py-24">
        <div className="container mx-auto grid max-w-5xl grid-cols-1 items-start gap-12 md:grid-cols-2">
          <Reveal>
            <SectionHeading id="what-heading" eyebrow="What we do" title="We find what is holding your business back, then fix it." />
            <p className="mt-6 text-lg leading-relaxed text-ink-600">Every engagement starts with the problem, not a package. The free Business Health Check reads your business in ten minutes. Then you choose how we help.</p>
            <p className="mt-4 leading-relaxed text-ink-soft">We don't run your business; you do. We are not a course: we do the work, or fix it with you.</p>
          </Reveal>
          <Reveal delay={0.12} className="md:pt-8">
            <ul className="space-y-5 text-ink-600">
              <li><span className="block font-semibold text-ink">Done for You</span>Finished work from your records, in days: a <ServiceLink id="business_plan" />, a <ServiceLink id="cash_flow_forecast" /> or a <ServiceLink id="pricing_unit_cost_review" />.</li>
              <li><span className="block font-semibold text-ink">The <ServiceLink id="business_review" /></span>Two weeks and two Sessions that find the one problem to fix first.</li>
              <li><span className="block font-semibold text-ink">The <ServiceLink id="six_week_fix" /></span>One problem and one Measure of Success, with a Weekly Check-in until it moves.</li>
              <li><span className="block font-semibold text-ink">Every month</span>Your <ServiceLink id="monthly_accounts" />, a <ServiceLink id="monthly_adviser_review" />, or <ServiceLink id="digital_marketing" />.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="how" aria-labelledby="how-heading" className="border-b border-line py-20 sm:py-24">
        <div className="container mx-auto grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-2">
          <Reveal><SectionHeading id="how-heading" eyebrow="How we work" title="A consultant you can name, on every piece of work." /></Reveal>
          <Stagger as="ul" className="space-y-3 text-lg text-ink-600 md:pt-8">
            {HOW_WE_WORK.map((line) => (
              <li key={line} className="flex items-start gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-brand" aria-hidden />{line}</li>
            ))}
          </Stagger>
        </div>
      </section>

      <section id="for" aria-labelledby="for-heading" className="border-b border-line bg-paper-sunken/50 py-20 sm:py-24">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <SectionHeading id="for-heading" eyebrow="Who it is for" title="Owners who already trade." />
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink-600">
              Business owners in Nigeria who want a straight answer about their numbers, prices, cash, funding, people or sales. We work with businesses across Nigeria; most of the work happens online.
            </p>
            <p className="mt-4 max-w-3xl leading-relaxed text-ink-soft">
              Smaller business? Start with the free Business Health Check and a Done for You product, from {formatNaira(startingPriceOf("done_for_you"))}. Several problems across a larger business? Start with a Business Review; work that needs a project team goes to {BRAND.trackRecord.groupName}.
            </p>
          </Reveal>
        </div>
      </section>

      <section aria-label="Questions about us" className="py-20 sm:py-24">
        <div className="container mx-auto max-w-3xl">
          <Faq id="about-questions" heading={`Questions about ${BRAND.organisationName}`} items={ABOUT_FAQ} />
        </div>
      </section>

      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
