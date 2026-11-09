/**
 * Experience (/experience): the record behind The Shift, moved off the home page (ET, 6 November 2026) so the home page
 * can lead with the visitor's problem. The track record and client logos, the experience behind the method, and the
 * research. Figures from BRAND.trackRecord.
 */
import { ExperienceBehind, TrackRecord, WhyStuck } from "@/components/home/Experience";
import { CheckCta, useStartCheck } from "@/components/home/HomeSections";
import { PageHero, SectionHeading } from "@/components/PageHero";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { BRAND } from "@shared/brand";
import { PAGE_META } from "@shared/pageMeta";
import React from "react";

export default function ExperiencePage() {
  useScrollToTop();
  usePageMeta(PAGE_META.experience.title, PAGE_META.experience.description);
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <PageHero eyebrow="Experience" title="We have done this before, many times." sub={`Since ${BRAND.trackRecord.since}, the partners behind ${BRAND.productName} have advised more than ${BRAND.trackRecord.clients.replace("+", "")} clients across Nigeria, from owner-run businesses to banks, funds and boards.`} />
      <TrackRecord />
      <ExperienceBehind />
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
