/** The top of an inner public page: a small eyebrow, the page's one headline and a line under it. */
import React from "react";

export function PageHero({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <div className="container mx-auto max-w-5xl pt-16 pb-14 text-center sm:pt-20 sm:pb-16">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">{eyebrow}</p>
        <h1 className="font-display mx-auto mt-4 max-w-3xl text-[clamp(2.6rem,7vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-[clamp(1.15rem,2.4vw,1.4rem)] leading-snug text-ink-soft">{sub}</p>
        {children}
      </div>
    </section>
  );
}

/** A section heading inside a page, with its eyebrow. */
export function SectionHeading({ id, eyebrow, title, sub, center }: { id: string; eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-highlight-ink">{eyebrow}</p>
      <h2 id={id} className="font-display mt-3 text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">{title}</h2>
      {sub && <p className="mt-4 text-lg leading-relaxed text-ink-soft">{sub}</p>}
    </div>
  );
}
