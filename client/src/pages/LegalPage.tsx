import { LegalFooterLinks } from "@/components/LegalLinks";
import { LegalDocument } from "@/lib/legalDocument";
import { BRAND } from "@shared/brand";
import React, { useEffect } from "react";
import { Link } from "wouter";
import privacySource from "../../../docs/legal/privacy.md?raw";
import termsSource from "../../../docs/legal/terms.md?raw";

/** A public legal page: the site's frame around the approved text, in a plain reading column. No sign-in needed. */
function LegalPage({ title, description, source }: { title: string; description: string; source: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${BRAND.organisationName}`;
    const meta = document.querySelector('meta[name="description"]') ?? Object.assign(document.createElement("meta"), { name: "description" });
    const before = meta.getAttribute("content");
    meta.setAttribute("content", description);
    if (!meta.isConnected) document.head.appendChild(meta);
    return () => {
      document.title = previous;
      if (before !== null) meta.setAttribute("content", before);
    };
  }, [title, description]);

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line">
        <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
        <div className="container flex items-center justify-between py-3">
          <Link href="/" className="flex items-center gap-3" aria-label={`${BRAND.organisationName}: home`}>
            <img src={BRAND.markUrl} alt="" className="h-9 w-auto" />
            <span className="border-l border-line pl-3 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
          </Link>
          <Link href="/" className="text-sm font-medium text-ink-600 hover:text-brand">Back to the site</Link>
        </div>
      </header>
      <main className="flex-1">
        <article className="mx-auto max-w-[820px] px-4 pb-16 pt-10 sm:pt-14">
          <LegalDocument source={source} />
        </article>
      </main>
      <footer className="border-t border-line py-8">
        <div className="container flex flex-col items-center gap-3 text-xs text-ink-muted">
          <LegalFooterLinks />
          <p>© 2026 {BRAND.organisationLegalName} ({BRAND.organisationName}) · <a href={`mailto:${BRAND.businessSupportMailbox}`} className="hover:text-ink">{BRAND.businessSupportMailbox}</a></p>
        </div>
      </footer>
    </div>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms & Conditions" description="The terms that apply when you use the IP Factory SME platform, pay for a service or create an account." source={termsSource} />;
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" description="How IP Factory collects, uses, shares, stores and protects personal and business information on its SME platform." source={privacySource} />;
}
