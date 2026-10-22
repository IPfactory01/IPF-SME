/**
 * The frame of the public pages outside the home page (the menu, the product pages, ordering and the legal pages): one
 * header and one footer, so every public page carries the same mark, name, gradient rule and legal links.
 */
import { LegalFooterLinks } from "@/components/LegalLinks";
import { BRAND } from "@shared/brand";
import { ArrowRight } from "lucide-react";
import React, { useEffect } from "react";
import { Link } from "wouter";

/** Sets the browser tab title and search description while the page is open. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${BRAND.productEndorsement}`;
    const meta = document.querySelector('meta[name="description"]') ?? Object.assign(document.createElement("meta"), { name: "description" });
    const before = meta.getAttribute("content");
    meta.setAttribute("content", description);
    if (!meta.isConnected) document.head.appendChild(meta);
    return () => {
      document.title = previous;
      if (before !== null) meta.setAttribute("content", before);
    };
  }, [title, description]);
}

/** Opens a page at the top, as a new page should, rather than where the last page was scrolled to. */
export function useScrollToTop(key?: string) {
  useEffect(() => {
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }, [key]);
}

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="container flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label={`${BRAND.productEndorsement}: home`}>
          <img src={BRAND.markUrl} alt="" className="h-9 w-auto" />
          <span className="hidden whitespace-nowrap border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted sm:inline">{BRAND.productName}</span>
        </Link>
        <nav aria-label="Site" className="flex items-center gap-4 text-sm font-medium text-ink-600 sm:gap-6">
          <Link href="/services" className="whitespace-nowrap hover:text-brand">Services</Link>
          <Link href="/login" className="hidden whitespace-nowrap hover:text-brand sm:inline">Client sign in</Link>
          {cta && (
            <Link href="/check" className="group hidden items-center whitespace-nowrap bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-charcoal md:inline-flex">
              Free Business Health Check <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper py-10">
      <div className="container flex flex-col items-center gap-3 text-center text-xs text-ink-muted">
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <Link href="/" className="hover:text-ink hover:underline">Home</Link>
          <Link href="/services" className="hover:text-ink hover:underline">Services</Link>
          <Link href="/check" className="hover:text-ink hover:underline">Free Business Health Check</Link>
          <Link href="/login" className="hover:text-ink hover:underline">Client sign in</Link>
        </nav>
        <LegalFooterLinks />
        <p>© 2026 {BRAND.organisationLegalName} ({BRAND.organisationName}). {BRAND.productEndorsement} · <a href={`mailto:${BRAND.businessSupportMailbox}`} className="hover:text-ink">{BRAND.businessSupportMailbox}</a></p>
      </div>
    </footer>
  );
}

/** Header, page body and footer. */
export function SiteShell({ children, cta = true }: { children: React.ReactNode; cta?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader cta={cta} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
