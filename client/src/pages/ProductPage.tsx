/**
 * One service's page (/services/:slug), told as a story (the store design ET approved on 22 October 2026): a bar that
 * stays in view with the name, the price and the start action; the promise as the headline; a sample of the work as
 * the hero; the features, each with its own sample; how it runs; who it is and is not for; what we need; the delivery
 * promise; questions. Facts come from shared/products.ts and the story from shared/productStories.ts, so every service
 * gets the same page.
 */
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { StartButton, startNote } from "@/components/store/StoreBits";
import { StoryVisual } from "@/components/store/StoryVisual";
import { useProductPrice } from "@/lib/productPrice";
import { EYEBROW } from "@/pages/ServicesPage";
import { stepName } from "@shared/businessCheck/routing";
import { storyOf } from "@shared/productStories";
import {
  DELIVERY_PROMISE, NEED_DETAILS, nextProduct, priceLabel, priceTerms, productById, productBySlug, servicePath, startMode, WAY_DETAILS, type PriceModel, type Product,
} from "@shared/products";
import { ArrowRight, Check, Minus } from "lucide-react";
import React from "react";
import { Link, useParams } from "wouter";

/** How the service runs, in three steps, from how it starts to what the owner receives. */
export function stepsFor(product: Product, price: PriceModel): { title: string; body: string }[] {
  const records = product.intake.records.filter((record) => record.required).map((record) => record.label.toLowerCase());
  const send = records.length ? `${records.slice(0, 3).join(", ").replace(/^./, (c) => c.toUpperCase())}. We check they are complete and confirm your date within one working day.` : "Your answers to a short form. We confirm your date within one working day.";
  const receive = { title: `Get your ${product.name}`, body: `${product.delivery} Checked by a consultant who did not prepare it, with a 30-minute call to walk you through it.` };
  const mode = startMode(product);
  if (mode === "check") return [
    { title: "Answer on your phone", body: "Ten minutes of questions about your business, in plain words." },
    { title: "See your result", body: "Where your business is stuck, area by area, and the first step that fits." },
    { title: "Decide what's next", body: "Book a free 20-minute call, or buy the Full Report for the detail." },
  ];
  if (product.way === "six_week_fix") return [
    { title: "Talk to us first", body: "A free 20-minute call to agree the problem. We send your payment link after it." },
    { title: "Week 1: the Prescription", body: "What to do, the tools, and the Measure of Success, agreed with you." },
    { title: "Weeks 2 to 6: every week", body: "A Weekly Check-in on the number until it moves. Then a Day-30 Review." },
  ];
  if (product.way === "monthly_service") return [
    { title: "Talk to us first", body: "A free 20-minute call to agree what you need each month." },
    { title: "Pay by the quarter", body: priceTerms(price) },
    { title: "Every month", body: product.delivery },
  ];
  if (mode === "after_call") return [
    { title: "Talk to us first", body: "A free 20-minute call. If it fits, we send your payment link after it." },
    { title: "Send your records", body: send },
    receive,
  ];
  return [
    { title: "Pay by link", body: `${priceLabel(price)}, by transfer or card on Paystack. Nothing to sign.` },
    { title: "Send your records", body: send },
    receive,
  ];
}

function NotFound() {
  return (
    <SiteShell>
      <div className="container mx-auto max-w-3xl py-20">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">We could not find that service.</h1>
        <p className="mt-3 text-ink-soft">It may have moved. Every service is on the services page.</p>
        <Link href="/services" className="mt-6 inline-flex items-center font-semibold text-brand underline underline-offset-4">See all services</Link>
      </div>
    </SiteShell>
  );
}

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const product = productBySlug(slug);
  const story = product ? storyOf(product.id) : undefined;
  useScrollToTop(slug);
  usePageMeta(product?.name ?? "Service not found", story?.sub ?? "This service is not on the services page.");
  const price = useProductPrice(product ?? { id: "", price: { kind: "free" } });
  if (!product || !story) return <NotFound />;

  const next = nextProduct(product);
  const dated = product.workingDays !== undefined;
  const steps = stepsFor(product, price);
  return (
    <SiteShell>
      {/* The service's own bar: name, price and the start action stay in reach while the page scrolls. */}
      <div className="sticky top-16 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="container mx-auto flex max-w-6xl items-center justify-between gap-4 py-2.5">
          <p className="font-display min-w-0 truncate text-lg font-extrabold tracking-[-0.02em] text-ink">{product.name}</p>
          <div className="flex shrink-0 items-center gap-5">
            <nav aria-label="On this page" className="hidden gap-5 text-[13px] text-ink-soft md:flex">
              <a href="#what-you-get" className="hover:text-ink">What you get</a>
              <a href="#how-it-works" className="hover:text-ink">How it works</a>
              <a href="#questions" className="hover:text-ink">Questions</a>
            </nav>
            <span className="hidden text-sm text-ink-soft tabular-nums sm:inline">{priceLabel(price)}</span>
            <StartButton product={product} size="sm" />
          </div>
        </div>
      </div>

      <section className="container mx-auto max-w-6xl pt-14 text-center sm:pt-16">
        {/* A product that answers several needs (the Six-Week Fix) is not labelled with just one of them. */}
        <p className={EYEBROW}>{WAY_DETAILS[product.way].name}{product.needs.length === 1 && ` · ${NEED_DETAILS[product.needs[0]].name}`}</p>
        <h1 className="font-display mx-auto mt-4 max-w-4xl text-[clamp(2.6rem,7.2vw,5.25rem)] font-extrabold leading-[1.0] tracking-[-0.04em] text-ink">
          {story.headline[0]}<br />
          <span className="bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight bg-clip-text text-transparent">{story.headline[1]}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[clamp(1.15rem,2.4vw,1.5rem)] leading-snug text-ink-soft">{story.sub}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <StartButton product={product} label={startMode(product) === "self" ? `Buy · ${priceLabel(price)}` : undefined} />
          <span className="text-[15px] text-ink-soft"><b className="text-ink">{priceLabel(price)}</b> · {product.delivery}</span>
        </div>
        <p className="mt-3 text-sm text-ink-muted">{startNote(product)}</p>
        <div className="mx-auto mt-12 max-w-5xl bg-paper-raised p-5 text-left shadow-[0_40px_90px_-60px_rgba(18,50,79,0.6)] sm:p-7">
          <StoryVisual visual={story.stage} />
        </div>
      </section>

      {product.variants && (
        <section aria-labelledby="variants" className="container mx-auto max-w-5xl pt-16">
          <h2 id="variants" className="font-display text-center text-3xl font-extrabold tracking-[-0.025em]">Pick the problem.</h2>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {product.variants.map((variant) => (
              <li key={variant.id} className="bg-paper-raised p-5">
                <p className="font-bold text-ink">{product.name}: {variant.name}</p>
                <p className="mt-1 text-ink-soft">{variant.problem}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container mx-auto max-w-6xl py-24 text-center sm:py-28">
        <p className="font-display mx-auto max-w-3xl text-[clamp(1.9rem,4.8vw,3.25rem)] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">
          {story.statement[0]} <span className="text-ink-muted">{story.statement[1]}</span>
        </p>
      </section>

      <section id="what-you-get" aria-label="What you get" className="container mx-auto max-w-6xl scroll-mt-32">
        {story.features.map((feature, index) => (
          <div key={feature.title} className="grid items-center gap-8 py-12 md:grid-cols-2 md:gap-14 md:py-16">
            <div className={index % 2 ? "md:order-2" : ""}>
              <p className={EYEBROW}>{feature.eyebrow}</p>
              <h2 className="font-display mt-3 text-[clamp(1.9rem,4vw,2.75rem)] font-extrabold leading-[1.06] tracking-[-0.03em] text-ink">{feature.title}</h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-soft">{feature.body}</p>
            </div>
            <div className="min-w-0 bg-paper-raised p-5 sm:p-6"><StoryVisual visual={feature.visual} /></div>
          </div>
        ))}
        <div className="border-t border-line py-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">Everything you get</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {product.youGet.map((line) => <li key={line} className="flex items-start gap-3 text-ink"><Check className="mt-0.5 h-5 w-5 shrink-0 text-health-clear" aria-hidden />{line}</li>)}
          </ul>
          {product.boundary && <p className="mt-5 text-sm text-ink-muted">{product.boundary}</p>}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-32 bg-paper-sunken">
        <div className="container mx-auto max-w-6xl py-20">
          <h2 className="font-display text-center text-[clamp(1.9rem,4vw,2.75rem)] font-extrabold tracking-[-0.03em] text-ink">How it works</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="bg-paper-raised p-6">
                <span className="font-display text-5xl font-extrabold leading-none tracking-[-0.04em] text-brand">{index + 1}</span>
                <h3 className="mt-4 font-sans text-lg font-extrabold text-ink">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
          {(product.price.kind === "milestones" || product.price.kind === "quarterly" || product.price.kind === "per_month") && (
            <p className="mx-auto mt-8 max-w-2xl text-center text-ink-soft"><b className="text-ink">How you pay:</b> {priceTerms(price)}</p>
          )}
        </div>
      </section>

      <section aria-label="Is it for you?" className="container mx-auto grid max-w-6xl gap-4 pt-16 md:grid-cols-2">
        <div className="bg-paper-raised p-6">
          <h2 className="font-sans text-lg font-extrabold text-ink">It's for you if</h2>
          <ul className="mt-4 grid gap-2.5 text-ink-soft">{story.forYou.map((line) => <li key={line} className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-health-clear" aria-hidden />{line}</li>)}</ul>
        </div>
        {story.notForYou.length > 0 && (
          <div className="bg-paper-raised p-6">
            <h2 className="font-sans text-lg font-extrabold text-ink">Start somewhere else if</h2>
            <ul className="mt-4 grid gap-2.5 text-ink-soft">
              {story.notForYou.map((item) => {
                const other = item.productId ? productById(item.productId) : undefined;
                return (
                  <li key={item.text} className="flex gap-3"><Minus className="mt-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                    <span>{item.text}{other && <> <Link href={servicePath(other)} className="font-semibold text-brand underline underline-offset-2">See {other.name}</Link></>}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {product.intake.records.length > 0 && (
        <section aria-labelledby="we-need" className="container mx-auto max-w-6xl pt-16">
          <h2 id="we-need" className="font-display text-[clamp(1.6rem,3.4vw,2.25rem)] font-extrabold tracking-[-0.025em] text-ink">What we need from you</h2>
          <ul className="mt-6 grid gap-6 md:grid-cols-3">
            {product.intake.records.map((record) => (
              <li key={record.id} className="border-t-2 border-ink pt-4">
                <p className="font-bold text-ink">{record.label}{!record.required && <span className="font-normal text-ink-muted"> (if you have it)</span>}</p>
                <p className="mt-1.5 text-sm text-ink-soft">{record.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-muted">You upload them through a secure form after paying. Only the people working on your order can see them.</p>
        </section>
      )}

      {dated && (
        <section className="mt-16 bg-gradient-to-r from-brand-plum to-brand text-paper">
          <div className="container mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-7 py-11">
            <div>
              <h2 className="font-display max-w-xl text-[clamp(1.6rem,3.6vw,2.4rem)] font-extrabold leading-[1.1] tracking-[-0.025em]">Delivered on the date we give you. Or your money back.</h2>
              <p className="mt-2.5 max-w-2xl text-on-dark-muted">{DELIVERY_PROMISE}</p>
            </div>
            <StartButton product={product} className="bg-paper-raised text-brand-deep hover:bg-paper" />
          </div>
        </section>
      )}

      <section id="questions" className="container mx-auto max-w-3xl scroll-mt-32 pt-16">
        <h2 className="font-display text-[clamp(1.6rem,3.4vw,2.25rem)] font-extrabold tracking-[-0.025em] text-ink">Questions</h2>
        <div className="mt-4">
          {story.faq.map((item) => (
            <details key={item.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-bold text-ink [&::-webkit-details-marker]:hidden">
                {item.q}<span aria-hidden className="text-2xl font-normal text-ink-muted transition-transform duration-200 group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-2xl pb-5 text-ink-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="container mx-auto max-w-6xl py-20 text-center sm:py-24">
        <h2 className="font-display mx-auto max-w-3xl text-[clamp(2.1rem,5vw,3.5rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">{story.closer}</h2>
        <p className="mt-4 text-lg text-ink-soft">{priceLabel(price)}. {product.delivery}{dated ? " A date, or your money back." : ""}</p>
        <div className="mt-7"><StartButton product={product} /></div>
        {next && (
          <p className="mt-10 text-ink-soft">Usually next: <Link href={servicePath(next)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">{stepName(next.id, product.nextVariant)} <ArrowRight className="h-4 w-4" aria-hidden /></Link></p>
        )}
      </section>
    </SiteShell>
  );
}
