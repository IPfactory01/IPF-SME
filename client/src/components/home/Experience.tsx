/**
 * Trust without names: the track record strip under the hero, the evidence for the problem, and the experience behind
 * The Shift. Figures come from BRAND.trackRecord; the research figures from concept note v0.8.1, sections 2 and 3.
 */
import { Reveal, Stagger, staggerChild } from "@/components/motion";
import { logoWidth } from "@/lib/logoSize";
import { BRAND } from "@shared/brand";
import { motion } from "framer-motion";
import { BookOpenCheck, Scale, UserCheck } from "lucide-react";
import React from "react";

const RECORD = BRAND.trackRecord;
/** "250+" as words for a sentence: "250". */
const RECORD_TOTAL = RECORD.clients.replace("+", "");

export const TRACK_RECORD = [
  { value: RECORD.clients, label: "clients advised" },
  { value: RECORD.partnerYears, label: "years of partner experience" },
  { value: `Since ${RECORD.since}`, label: "advising Nigerian businesses" },
  { value: `${RECORD.sectors.length}`, label: "sectors of the economy" },
] as const;

/** Research on small businesses in Nigeria and on what help works, each with its source. */
export const EVIDENCE = [
  { value: "67%", label: "of small businesses saw demand fall", source: "PwC MSME Survey, 2024" },
  { value: "11%", label: "have ever had structured support", source: "World Bank, Nigeria, 2022" },
  { value: "Up to 61%", label: "higher profits after ten weeks of applied, expert help", source: "Field trial of 852 owners, 2018" },
] as const;

export function TrackRecord() {
  return (
    <section aria-label="Our track record" className="border-b border-line bg-paper-raised">
      <Stagger className="container mx-auto grid max-w-5xl grid-cols-2 gap-y-8 py-10 md:grid-cols-4">
        {TRACK_RECORD.map((item) => (
          <motion.div key={item.label} variants={staggerChild} className="px-4 text-center md:border-l md:border-line md:first:border-l-0">
            
            <p className="font-serif text-3xl font-bold text-brand sm:text-4xl">{item.value}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{item.label}</p>
          </motion.div>
        ))}
      </Stagger>
      {RECORD.clientLogos.length > 0 && (
        <Reveal className="container mx-auto max-w-5xl pb-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">The team behind {BRAND.productName} has worked with</p>
          {/* One tile per client, all the same size; each logo sized by area, in ink until a mouse points at it. */}
          <ul aria-label="Client logos" className="mt-5 flex flex-wrap justify-center gap-2 sm:gap-3">
            {RECORD.clientLogos.map((client) => {
              const box = { width: logoWidth(client), aspectRatio: `${client.width} / ${client.height}` };
              return (
                <li key={client.name} className="group flex h-[4.5rem] w-[6.25rem] items-center justify-center border border-line bg-paper-raised p-2 sm:h-20 sm:w-32 sm:p-2.5">
                  <span className="relative block max-w-full" style={box}>
                    <span role="img" aria-label={client.name} className="absolute inset-0 bg-ink opacity-80 transition-opacity duration-200 [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] group-hover:opacity-0" style={{ maskImage: `url(${client.mono})`, WebkitMaskImage: `url(${client.mono})` }} />
                    <img src={client.src} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>
      )}
    </section>
  );
}

/** Why owners stay stuck: the line from the concept note and the numbers behind it. */
export function WhyStuck() {
  return (
    <div className="mt-4 mb-12 border border-line bg-paper-raised p-6 sm:p-8">
      <Reveal>
        <p className="font-serif text-2xl leading-snug text-ink sm:text-3xl">
          Business owners rarely fail for lack of information. They fail between knowing and doing.
        </p>
        <p className="mt-3 text-ink-600">Courses leave you informed and still stuck. What works is help on your own numbers, week after week.</p>
      </Reveal>
      <Stagger className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {EVIDENCE.map((item) => (
          <motion.div key={item.label} variants={staggerChild} className="border-l-2 border-highlight-ink pl-4">
            
            <p className="font-serif text-3xl font-bold text-ink">{item.value}</p>
            <p className="mt-1 text-sm text-ink-600">{item.label}</p>
            <p className="mt-2 text-xs text-ink-faint">{item.source}</p>
          </motion.div>
        ))}
      </Stagger>
    </div>
  );
}

const POINTS = [
  { icon: BookOpenCheck, title: "Built from what we have seen", text: "Every question in the Business Health Check and every finding in the Full Report comes from patterns our partners have met again and again in Nigerian businesses." },
  { icon: UserCheck, title: "Not another AI tool", text: `AI helps with the analysis. The method, written from ${RECORD.partnerYears} years of partner experience, makes the call, and a named ${BRAND.organisationName} consultant stands behind it.` },
  { icon: Scale, title: "Your numbers, not theory", text: "We work on your own sales, costs and cash, every week, until the number we agreed on moves." },
] as const;

export function ExperienceBehind() {
  return (
    <section id="experience" className="py-24 border-b border-line">
      <div className="container max-w-5xl mx-auto">
        <Reveal className="max-w-3xl">
          <span className="text-xs uppercase tracking-widest text-ink-muted font-semibold block mb-3">The experience behind {BRAND.productName}</span>
          <h2 className="font-serif text-4xl font-bold tracking-tight mb-6">Years of consulting, built for a business your size.</h2>
          <p className="text-lg text-ink-600 leading-relaxed">
            {BRAND.productName} is run by {BRAND.organisationName}, the delivery and method arm of{" "}
            {RECORD.groupUrl
              ? <a href={RECORD.groupUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-4 hover:text-highlight-ink">{RECORD.groupName}</a>
              : <span className="font-semibold text-ink">{RECORD.groupName}</span>}
            , {RECORD.lineage}. Since {RECORD.since}, our partners have advised more than {RECORD_TOTAL} clients, from owner-run businesses to boards and development agencies.
          </p>
          <ul aria-label="Sectors we have worked in" className="mt-6 flex flex-wrap gap-2">
            {RECORD.sectors.map((sector) => (
              <li key={sector} className="border border-brand-line bg-paper-raised px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">{sector}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <blockquote className="my-12 border-l-4 border-highlight-ink bg-brand-tint px-6 py-6 font-serif text-2xl italic leading-snug text-brand-deep sm:text-3xl">
            The same method we use with larger clients. Run at the size and the price that fits your business.
          </blockquote>
        </Reveal>
        <Stagger className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <motion.div key={title} variants={staggerChild} className="border border-line bg-paper-raised p-6">
              <Icon className="mb-4 h-6 w-6 text-highlight-ink" />
              <h3 className="mb-2 font-semibold text-ink">{title}</h3>
              <p className="text-ink-600 leading-relaxed">{text}</p>
            </motion.div>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
