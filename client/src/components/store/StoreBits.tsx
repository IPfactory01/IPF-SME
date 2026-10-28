/** Small shared pieces of the store pages: the promises, how a product starts, and how its price reads on a tile. */
import { LegalLink, TERMS_PATH } from "@/components/LegalLinks";
import { DELIVERY_REMEDY, formatNaira } from "@shared/businessSupport";
import { BRAND } from "@shared/brand";
import { DELIVERY_PROMISE, perMonthAmount, priceLabel, startMode, type PriceModel, type Product } from "@shared/products";
import { ArrowRight, CalendarCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import React from "react";
import { Link } from "wouter";

/** The three promises behind every product, on the services page and How we work. */
export const PROMISES = [
  { icon: CalendarCheck, title: "A date we stand behind.", body: `We confirm your delivery date once your records are in. ${DELIVERY_REMEDY}` },
  { icon: ShieldCheck, title: "Checked before you see it.", body: "A consultant who did not prepare the work signs it off. Every figure is traced to your records." },
  { icon: LockKeyhole, title: "Your records stay private.", body: "Uploads go to private storage that only the people on your order can open." },
] as const;

/** The delivery promise as a paragraph, with "Terms" linked to the Terms page (the sentence ends with it: DELIVERY_REMEDY). */
export function DeliveryPromise({ className }: { className?: string }) {
  return <p className={className}>{DELIVERY_PROMISE.replace(/Terms\.$/, "")}<LegalLink to={TERMS_PATH}>Terms</LegalLink>.</p>;
}

export const orderPath = (product: Pick<Product, "slug">) => `/order/${product.slug}`;

/** The price as a tile says it: "From ₦300,000" for the Catch-Up, "₦200,000 a month" for a Monthly Service. */
export function tilePrice(price: PriceModel): { main: string; note?: string } {
  if (price.kind === "per_month") return { main: `From ${formatNaira(perMonthAmount(price, price.minMonths))}`, note: `${formatNaira(price.perMonth)} a month of records` };
  if (price.kind === "milestones") return { main: formatNaira(price.total), note: "or in three payments" };
  if (price.kind === "quarterly") return { main: priceLabel(price), note: "paid by the quarter" };
  return { main: priceLabel(price) };
}

/** Brand fill on light backgrounds; light fill on the dark and gradient bands. */
const TONES = {
  brand: "bg-brand text-paper hover:bg-brand-deep",
  light: "bg-paper-raised text-brand-deep hover:bg-paper",
} as const;

const SIZES = {
  lg: "h-12 px-7 text-base",
  sm: "h-9 px-4 text-sm",
} as const;

/** The one action that starts a product: Buy, Book a free call, or the free check. */
export function StartButton({ product, size = "lg", tone = "brand", label, className = "" }: { product: Product; size?: keyof typeof SIZES; tone?: keyof typeof TONES; label?: string; className?: string }) {
  const mode = startMode(product);
  const classes = `group inline-flex items-center justify-center gap-2 font-bold transition-[transform,background-color] duration-150 active:scale-[0.97] ${TONES[tone]} ${SIZES[size]} ${className}`;
  if (mode === "self") return <Link href={orderPath(product)} className={classes}>{label ?? "Buy"}</Link>;
  if (mode === "after_call") return <a href={BRAND.discoveryCallUrl} target="_blank" rel="noopener noreferrer" className={classes}>{label ?? "Book a free call"}</a>;
  return <Link href="/check" className={classes}>{label ?? "Take the free check"}</Link>;
}

/** The quiet second action, Apple-style: blue text with a chevron. */
export function QuietLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const classes = "group inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-brand hover:underline underline-offset-4";
  const body = <>{children}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden /></>;
  return external ? <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>{body}</a> : <Link href={href} className={classes}>{body}</Link>;
}

/** What the start action says, for copy next to it. */
export function startNote(product: Product): string {
  const mode = startMode(product);
  if (mode === "self") return "Pay by transfer or card. The form for your records follows.";
  if (mode === "after_call") return "Twenty minutes, by phone or video. We send your payment link after the call.";
  return "Ten minutes on your phone. No card needed.";
}
