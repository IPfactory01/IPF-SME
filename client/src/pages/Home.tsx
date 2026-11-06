/**
 * The home page, from the visitor's side (ET, 6 November 2026, after a prospect's feedback): what we do and why it
 * matters to them, with the free check straight under it; the problem we solve and the evidence; the owners' own words,
 * each leading to the service that answers it; how we fix it; why us, in one band (the full record is on Experience);
 * where most owners start; the free check again. The page before this redesign is commit 0de5a75.
 */
import { TheProblem, WhyUs } from "@/components/home/Experience";
import { CheckCta, FeaturedServices, Hero, HowWeWorkTeaser, ProblemsToServices, useStartCheck } from "@/components/home/HomeSections";
import { ScrollProgress } from "@/components/motion";
import { SiteShell } from "@/components/SiteShell";
import React from "react";

export default function Home() {
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <ScrollProgress />
      <Hero onStart={startCheck} />
      <TheProblem />
      <ProblemsToServices />
      <HowWeWorkTeaser />
      <WhyUs />
      <FeaturedServices />
      <CheckCta onStart={startCheck} />
    </SiteShell>
  );
}
