/**
 * The frame of the public pages outside the home page (the menu, the product pages, ordering and the legal pages): one
 * header and one footer, so every public page carries the same mark, name, gradient rule and legal links.
 */
import { LegalFooterLinks } from "@/components/LegalLinks";
import { BRAND } from "@shared/brand";
import { pageTitle, SITE_ORIGIN } from "@shared/seo";
import { ArrowRight, Menu, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

/**
 * Sets the browser tab title, search description and canonical address while the page is open. Titles and descriptions
 * come from shared/seo.ts, which the build also writes into each public page's own HTML.
 */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle(title);
    const meta = document.querySelector('meta[name="description"]') ?? Object.assign(document.createElement("meta"), { name: "description" });
    const before = meta.getAttribute("content");
    meta.setAttribute("content", description);
    if (!meta.isConnected) document.head.appendChild(meta);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? Object.assign(document.createElement("link"), { rel: "canonical" });
    const canonicalBefore = canonical.getAttribute("href");
    // One address per page: "/services/x/" and "/services/x" are the same page to a search engine.
    canonical.setAttribute("href", `${SITE_ORIGIN}${window.location.pathname.replace(/(.)\/+$/, "$1")}`);
    if (!canonical.isConnected) document.head.appendChild(canonical);
    return () => {
      document.title = previous;
      if (before !== null) meta.setAttribute("content", before);
      if (canonicalBefore !== null) canonical.setAttribute("href", canonicalBefore);
    };
  }, [title, description]);
}

/** Opens a page at the top, as a new page should, rather than where the last page was scrolled to. */
export function useScrollToTop(key?: string) {
  useEffect(() => {
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }, [key]);
}

/** The site's pages, in menu order. Every public page carries the same menu. */
export const SITE_PAGES = [
  { href: "/services", label: "Services" },
  { href: "/how-we-work", label: "How we work" },
  { href: "/about", label: "About" },
  { href: "/questions", label: "Questions" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const current = (href: string) => location === href || location.startsWith(`${href}/`);
  useEffect(() => { setOpen(false); }, [location]);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-md">
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="container flex h-[60px] items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label={`${BRAND.productEndorsement}: home`}>
          <img src={BRAND.markUrl} alt="" className="h-9 w-auto" />
          <span className="hidden whitespace-nowrap border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted sm:inline">{BRAND.productName}</span>
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-6 text-sm font-medium text-ink-600 lg:flex">
          {SITE_PAGES.map((page) => (
            <Link key={page.href} href={page.href} aria-current={current(page.href) ? "page" : undefined} className={`relative whitespace-nowrap py-1 transition-colors hover:text-brand ${current(page.href) ? "text-brand" : ""}`}>
              {page.label}
              {current(page.href) && <span aria-hidden className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-highlight-ink" />}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden whitespace-nowrap border border-brand-line px-3 py-2 text-xs font-semibold uppercase tracking-wider text-brand transition-colors hover:bg-brand-tint sm:inline-flex">Client sign in</Link>
          {cta && (
            <Link href="/check" className="group hidden items-center whitespace-nowrap bg-ink px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-paper transition-colors hover:bg-charcoal md:inline-flex">
              Free Business Health Check <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          <button type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((value) => !value)} className="inline-flex h-10 w-10 items-center justify-center text-ink lg:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
          </button>
        </div>
      </div>
      {open && (
        <nav id="site-menu" aria-label="Site menu" className="border-t border-line bg-paper lg:hidden">
          <ul className="container grid py-2">
            {SITE_PAGES.map((page) => (
              <li key={page.href}><Link href={page.href} aria-current={current(page.href) ? "page" : undefined} className={`block border-b border-line-soft py-3.5 text-lg font-semibold ${current(page.href) ? "text-brand" : "text-ink"}`}>{page.label}</Link></li>
            ))}
            <li><Link href="/login" className="block py-3.5 text-lg font-semibold text-ink">Client sign in</Link></li>
            <li className="pb-3"><Link href="/check" className="flex h-12 items-center justify-center bg-ink font-bold text-paper">Free Business Health Check</Link></li>
          </ul>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper py-10">
      <div className="container flex flex-col items-center gap-3 text-center text-xs text-ink-muted">
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 text-sm">
          {[{ href: "/", label: "Home" }, ...SITE_PAGES, { href: "/check", label: "Free Business Health Check" }, { href: "/login", label: "Client sign in" }].map((page) => (
            <Link key={page.href} href={page.href} className="inline-flex min-h-11 items-center hover:text-ink hover:underline">{page.label}</Link>
          ))}
        </nav>
        <LegalFooterLinks />
        <address className="not-italic">{BRAND.organisationName} · {BRAND.officeAddress.oneLine}</address>
        <p>© 2026 {BRAND.organisationLegalName} ({BRAND.organisationName}). {BRAND.productEndorsement} · <a href={`mailto:${BRAND.businessSupportMailbox}`} className="hover:text-ink">{BRAND.businessSupportMailbox}</a></p>
      </div>
    </footer>
  );
}

/** Header, page body and footer. */
export function SiteShell({ children, cta = true }: { children: React.ReactNode; cta?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <a href="#main" className="sr-only z-50 bg-ink px-4 py-3 font-semibold text-paper focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
      <SiteHeader cta={cta} />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <SiteFooter />
    </div>
  );
}
