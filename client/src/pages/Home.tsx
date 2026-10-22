/**
 * The home page: what The Shift is, the track record behind it, owners' problems each leading to the service that
 * answers it, where most owners start, how we work in three steps, and the evidence. Each block links on to its own
 * page (Services, How we work, About), so the home page stays short. Copy: concept note v0.8.1, section 16.
 */
import { TrackRecord, WhyStuck } from "@/components/home/Experience";
import { CheckCta, FeaturedServices, Hero, HowWeWorkTeaser, ProblemsToServices, useStartCheck } from "@/components/home/HomeSections";
import { ParticipantSignIn } from "@/components/home/ParticipantSignIn";
import { Reveal, ScrollProgress } from "@/components/motion";
import { SiteShell } from "@/components/SiteShell";
import { BRAND } from "@shared/brand";
import { ArrowRight } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export default function Home() {
  const startCheck = useStartCheck();

  return (
    <SiteShell>
      <ScrollProgress />
      <Hero onStart={startCheck} />
      <TrackRecord />
      <ProblemsToServices />
      <FeaturedServices />
      <HowWeWorkTeaser />

      <section id="evidence" aria-labelledby="evidence-heading" className="border-b border-line py-20 sm:py-24">
        <div className="container mx-auto max-w-5xl">
          <Reveal>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">Why it works</p>
            <h2 id="evidence-heading" className="font-display mt-3 max-w-3xl text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">You don&apos;t need another course.</h2>
          </Reveal>
          <WhyStuck />
          <Link href="/about" className="group inline-flex items-center gap-1.5 font-semibold text-brand">About {BRAND.productName} and the team behind it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden /></Link>
        </div>
      </section>

      <CheckCta onStart={startCheck} />
      <ParticipantSignIn onStartCheck={startCheck} />
    </SiteShell>
  );
}
