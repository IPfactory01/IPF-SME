import React from "react";
import { Link } from "wouter";

export const TERMS_PATH = "/terms";
export const PRIVACY_PATH = "/privacy";

const linkClass = "font-medium text-brand underline underline-offset-2 hover:text-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * A link to one of the legal pages. `newTab` is for the middle of a form or a payment, where leaving the page would
 * lose what the person has typed.
 */
export function LegalLink({ to, newTab, children }: { to: typeof TERMS_PATH | typeof PRIVACY_PATH; newTab?: boolean; children: React.ReactNode }) {
  return newTab
    ? <a href={to} target="_blank" rel="noopener" className={linkClass}>{children}</a>
    : <Link href={to} className={linkClass}>{children}</Link>;
}

export const TermsLink = ({ newTab }: { newTab?: boolean }) => <LegalLink to={TERMS_PATH} newTab={newTab}>Terms &amp; Conditions</LegalLink>;
export const PrivacyLink = ({ newTab }: { newTab?: boolean }) => <LegalLink to={PRIVACY_PATH} newTab={newTab}>Privacy Policy</LegalLink>;

/** The quiet "Terms & Conditions · Privacy Policy" line under sign-in cards, settings and similar pages. */
export function LegalFooterLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-muted ${className}`}>
      <Link href={TERMS_PATH} className="hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">Terms &amp; Conditions</Link>
      <Link href={PRIVACY_PATH} className="hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">Privacy Policy</Link>
    </nav>
  );
}
