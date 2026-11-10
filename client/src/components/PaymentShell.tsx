import { LegalFooterLinks } from "@/components/LegalLinks";
import { BRAND } from "@shared/brand";
import { ONLINE_TEST_NOTICE } from "@shared/payments";
import { firstNameOf, whatsappLink } from "@shared/whatsapp";
import { AlertTriangle, MessageCircle } from "lucide-react";
import React from "react";

/** The frame of the pay pages: the logo beside "The Shift", the logo's colour line, a narrow reading column. */
export function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div aria-hidden className="h-1 bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center gap-4">
          <img src={BRAND.logoUrl} alt={BRAND.organisationName} className="h-14 w-auto" />
          <span className="border-l border-line pl-4 text-sm font-semibold text-ink-muted">{BRAND.productName}</span>
        </header>
        {children}
        <LegalFooterLinks className="mt-10 !justify-start" />
      </div>
    </main>
  );
}

/** Shown on every pay page while Paystack runs on its test keys. */
export function TestModeBanner() {
  return (
    <div role="note" aria-label="Test mode" className="mb-6 flex items-start gap-3 rounded-lg border border-health-watch bg-health-watch-tint p-4 text-sm text-ink-700">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-health-watch-strong" aria-hidden />
      <div>
        <p className="font-semibold text-health-watch-strong">{ONLINE_TEST_NOTICE}</p>
        <p className="mt-1">Online payment is in Paystack's test mode while we test it. Use Paystack's test card. Nothing you pay here is real money.</p>
      </div>
    </div>
  );
}

/** The pay pages' one main action (Design brief, section 4): the logo gradient, white text, 8 px corners. */
export const PAY_BUTTON = "h-14 w-full rounded-lg bg-gradient-to-r from-brand-plum to-highlight-ink px-6 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.99] disabled:opacity-60";

/**
 * What a first-time payer checks before paying (R72): who receives the money and the name they will see, the reference,
 * that the receipt comes by email, and a person to ask on WhatsApp first: the engagement's main contact when they agreed
 * to show their number, else the office. What it is for is the page's heading, just above, so it is not said twice;
 * `what` goes into the WhatsApp message.
 */
export function BeforeYouPay({ what, reference, contact }: { what: string; reference: string | null; contact: { name: string; whatsapp: string } | null }) {
  const person = contact?.name ? firstNameOf(contact.name) : null;
  const message = `Hello${person ? ` ${person}` : ""}, I have a question before I pay${reference ? ` ${reference}` : ""}: ${what}.`;
  const row = (term: string, detail: React.ReactNode) => (
    <div className="grid gap-0.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold text-ink-muted sm:pt-0.5">{term}</dt>
      <dd className="text-ink">{detail}</dd>
    </div>
  );
  return (
    <section aria-label="Before you pay" className="mt-6 rounded-lg border border-line bg-paper-raised p-5 text-sm leading-relaxed">
      <dl className="space-y-3">
        {row("You pay", <>{BRAND.paymentsCollectedBy}, the firm behind {BRAND.organisationName}, through Paystack. Look for <span className="font-semibold">{BRAND.paymentsStatementName}</span> on Paystack's page and on your bank statement.</>)}
        {reference && row("Reference", <span className="tabular-nums">{reference}</span>)}
        {row("Receipt", "By email, as soon as Paystack confirms your payment.")}
      </dl>
      <a href={whatsappLink(contact?.whatsapp ?? BRAND.officeWhatsapp, message)} target="_blank" rel="noopener noreferrer"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-line px-4 text-sm font-semibold text-brand hover:bg-brand-tint">
        <MessageCircle className="h-4 w-4" aria-hidden />
        {person ? `Questions first? WhatsApp ${person}` : `Questions first? WhatsApp ${BRAND.organisationName}`}
      </a>
    </section>
  );
}
