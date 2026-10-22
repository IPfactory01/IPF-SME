/**
 * One product's page (/services/:slug): what it is, who it is for, what you get, what it costs and how it is paid, when
 * it is delivered, what we need from you, and how to start. Everything comes from shared/products.ts, so a product's
 * page is live the moment it is on the menu. A product you buy yourself opens the order form; one that starts with a
 * conversation books the free 20-minute call. Operational Business Plan, pages 11, 17, 18 and 19.
 */
import { Reveal } from "@/components/motion";
import { SiteShell, usePageMeta, useScrollToTop } from "@/components/SiteShell";
import { useProductPrice } from "@/lib/productPrice";
import { EYEBROW } from "@/pages/ServicesPage";
import { stepName } from "@shared/businessCheck/routing";
import { BRAND } from "@shared/brand";
import {
  DELIVERY_PROMISE, NEED_DETAILS, nextProduct, startMode, priceLabel, priceTerms, productBySlug, servicePath, WAY_DETAILS, type Product,
} from "@shared/products";
import { ArrowRight, CalendarClock, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import React from "react";
import { Link, useParams } from "wouter";

export const orderPath = (product: Pick<Product, "slug">) => `/order/${product.slug}`;

function StartPanel({ product }: { product: Product }) {
  const mode = startMode(product);
  if (mode === "self") {
    return (
      <>
        <Link href={orderPath(product)} className="group inline-flex h-12 w-full items-center justify-center bg-highlight-ink px-6 text-sm font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-brand-plum">
          Buy now <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <p className="mt-3 text-sm text-ink-muted">Your details, then payment by transfer or card. The form for your records follows.</p>
      </>
    );
  }
  if (mode === "after_call") {
    return (
      <>
        <a href={BRAND.discoveryCallUrl} target="_blank" rel="noopener noreferrer" className="group inline-flex h-12 w-full items-center justify-center bg-highlight-ink px-6 text-sm font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-brand-plum">
          Book a free call <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
        </a>
        <p className="mt-3 text-sm text-ink-muted">Twenty minutes, by phone or video. We talk first, so you only buy what fits; after the call we send your payment link.</p>
      </>
    );
  }
  return (
    <>
      <Link href="/check" className="group inline-flex h-12 w-full items-center justify-center bg-ink px-6 text-sm font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-charcoal">
        Take the free Business Health Check <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Link>
      {product.id === "full_report" && <p className="mt-3 text-sm text-ink-muted">The Full Report is offered at the end of the check, built from your answers.</p>}
    </>
  );
}

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const product = productBySlug(slug);
  useScrollToTop(slug);
  usePageMeta(product?.name ?? "Service not found", product?.short ?? "This service is not on the menu.");
  const price = useProductPrice(product ?? { id: "", price: { kind: "free" } });

  if (!product) {
    return (
      <SiteShell>
        <div className="container mx-auto max-w-3xl py-20">
          <h1 className="font-serif text-3xl font-bold">We could not find that service.</h1>
          <p className="mt-3 text-ink-soft">It may have moved. Every service is on the menu.</p>
          <Link href="/services" className="mt-6 inline-flex items-center font-semibold text-brand underline underline-offset-4">See all services</Link>
        </div>
      </SiteShell>
    );
  }

  const next = nextProduct(product);
  const dated = product.workingDays !== undefined;
  return (
    <SiteShell>
      <div className="container mx-auto max-w-5xl py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
          <Link href="/services" className="hover:text-brand">Services</Link> <span aria-hidden>›</span> <span className="text-ink-600">{product.name}</span>
        </nav>
        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_20rem]">
          <Reveal>
            <p className={EYEBROW}>{WAY_DETAILS[product.way].name} · {NEED_DETAILS[product.needs[0]].name}</p>
            <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight sm:text-5xl">{product.name}</h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-soft">{product.short}</p>
            {/* On a phone the price and how to start come straight after the introduction; on a wide screen they sit beside it. */}
            <div className="mt-6 border border-line bg-paper-raised p-5 lg:hidden">
              <p className="font-sans text-2xl font-bold text-ink">{priceLabel(price)}</p>
              <p className="mt-1 text-sm text-ink-soft">{product.delivery}</p>
              <div className="mt-4"><StartPanel product={product} /></div>
            </div>

            {product.variants && (
              <section aria-labelledby="variants" className="mt-10">
                <h2 id="variants" className="font-serif text-2xl font-bold">Pick the problem</h2>
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {product.variants.map((variant) => (
                    <li key={variant.id} className="border border-line bg-paper-raised p-4">
                      <p className="font-semibold text-ink">{product.name}: {variant.name}</p>
                      <p className="mt-1 text-sm text-ink-soft">{variant.problem}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="for-you" className="mt-10">
              <h2 id="for-you" className="font-serif text-2xl font-bold">This is for you if</h2>
              <p className="mt-3 leading-relaxed text-ink-soft">{product.forWhom}</p>
            </section>

            <section aria-labelledby="you-get" className="mt-10">
              <h2 id="you-get" className="font-serif text-2xl font-bold">What you get</h2>
              <ul className="mt-4 space-y-3">
                {product.youGet.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-ink-soft"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-highlight-ink" />{line}</li>
                ))}
              </ul>
              {product.boundary && <p className="mt-4 border-l-2 border-line pl-4 text-sm text-ink-muted">{product.boundary}</p>}
            </section>

            {product.intake.records.length > 0 && (
              <section aria-labelledby="we-need" className="mt-10">
                <h2 id="we-need" className="font-serif text-2xl font-bold">What we need from you</h2>
                <ul className="mt-4 space-y-3">
                  {product.intake.records.map((record) => (
                    <li key={record.id} className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                      <span><span className="font-medium text-ink">{record.label}</span>{!record.required && <span className="text-ink-muted"> (if you have it)</span>}<span className="block text-sm text-ink-muted">{record.detail}</span></span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-ink-muted">You upload them through a secure form after paying. Only the people working on your order can see them.</p>
              </section>
            )}
          </Reveal>

          <aside aria-label="Price and how to start" className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-paper-raised p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Price</p>
              <p className="mt-1 font-sans text-3xl font-bold text-ink">{priceLabel(price)}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{priceTerms(price)}</p>
              <div className="mt-5 flex items-start gap-3 border-t border-line pt-5 text-sm text-ink-soft">
                <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <span>{product.delivery}</span>
              </div>
              {dated && (
                <div className="mt-3 flex items-start gap-3 text-sm text-ink-soft">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-health-clear" />
                  <span>{DELIVERY_PROMISE}</span>
                </div>
              )}
              <div className="mt-6"><StartPanel product={product} /></div>
            </div>
            {next && (
              <Link href={servicePath(next)} className="group mt-4 block border border-line p-4 transition-colors hover:border-brand">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Usually next</span>
                <span className="mt-1 flex items-center justify-between font-semibold text-ink group-hover:text-brand">{stepName(next.id, product.nextVariant)}<ArrowRight className="h-4 w-4" /></span>
              </Link>
            )}
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}
