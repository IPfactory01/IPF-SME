import { BRAND } from "@shared/brand";
import { ONLINE_TEST_NOTICE } from "@shared/payments";
import { AlertTriangle } from "lucide-react";
import React from "react";

/** The frame of the pay pages: the logo beside "The Shift", the logo's colour line, a narrow reading column. */
export function PaymentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div aria-hidden className="h-1 bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-8 flex items-center gap-4">
          <img src={BRAND.logoUrl} alt={BRAND.organisationName} className="h-14 w-auto" />
          <span className="border-l border-line pl-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">{BRAND.productName}</span>
        </header>
        {children}
      </div>
    </main>
  );
}

/** Shown on every pay page while Paystack runs on its test keys. */
export function TestModeBanner() {
  return (
    <div role="note" aria-label="Test mode" className="mb-6 flex items-start gap-3 border border-health-watch bg-health-watch-tint p-4 text-sm text-ink-700">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-health-watch" aria-hidden />
      <div>
        <p className="font-bold uppercase tracking-wider text-health-watch">{ONLINE_TEST_NOTICE}</p>
        <p className="mt-1">Online payment is in Paystack's test mode while we test it. Use Paystack's test card. Nothing you pay here is real money.</p>
      </div>
    </div>
  );
}
