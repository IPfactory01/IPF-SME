/** One service on a shelf: the drawing of what it hands over, its promise, its price, Learn more and Buy. */
import { ProductArt } from "@/components/store/ProductArt";
import { QuietLink, tilePrice } from "@/components/store/StoreBits";
import { displayPrice } from "@/lib/productPrice";
import { BRAND } from "@shared/brand";
import type { ServicePrices } from "@shared/businessSupport";
import { storyOf } from "@shared/productStories";
import { orderable, servicePath, startMode, WAY_DETAILS, type Product } from "@shared/products";
import React from "react";
import { Link } from "wouter";

export function ServiceTile({ product, prices, as: Tag = "li" }: { product: Product; prices: ServicePrices; as?: "li" | "div" }) {
  const story = storyOf(product.id)!;
  const price = tilePrice(displayPrice(product, prices));
  return (
    <Tag className="flex flex-col bg-paper-raised px-7 pt-8 pb-7 text-center transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-32px_rgba(18,50,79,0.55)]">
      <Link href={servicePath(product)} className="mx-auto block w-full max-w-[15.25rem]" tabIndex={-1} aria-hidden>
        <ProductArt kind={story.art} className="h-auto w-full" />
      </Link>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">{WAY_DETAILS[product.way].name}</p>
      <h3 className="font-display mt-2 text-2xl font-extrabold tracking-[-0.02em] text-ink">{product.name}</h3>
      <p className="mt-2 flex-1 text-[16px] leading-snug text-ink-soft">{story.promise}</p>
      <p className="mt-5 text-[15px] text-ink-soft"><b className="font-extrabold text-ink tabular-nums">{price.main}</b>{price.note && <span className="block text-[13px]">{price.note}</span>}</p>
      <div className="mt-4 flex items-center justify-center gap-5">
        <Link href={servicePath(product)} aria-label={`Learn more about ${product.name}`} className="inline-flex h-11 items-center bg-brand px-5 text-sm font-bold text-paper transition-[transform,background-color] hover:bg-brand-deep active:scale-[0.97]">Learn more</Link>
        {orderable(product)
          ? <QuietLink href={`/order/${product.slug}`}>Buy</QuietLink>
          : startMode(product) === "after_call" ? <QuietLink href={BRAND.discoveryCallUrl} external>Book a call</QuietLink> : <QuietLink href="/check">Start</QuietLink>}
      </div>
    </Tag>
  );
}
