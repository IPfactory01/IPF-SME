/**
 * The frame of the Business Health Check (its header, page and footer) and its first screen. Kept apart from the
 * questions (pages/BusinessCheck.tsx) so /check opens with this alone (R70): the questions, the scoring and the
 * screens' motion load in the background once the page is up (pages/CheckPage.tsx).
 */
import { LegalFooterLinks } from "@/components/LegalLinks";
import { BRAND } from "@shared/brand";
import { PROMISE } from "@shared/businessSupport";
import { ArrowRight, LockKeyhole } from "lucide-react";
import React from "react";
import { Link } from "wouter";

/** The check's header, page and footer. `rail` sits under the header; `aside` beside the screen on a wide screen. */
export function CheckFrame({ rail, aside, children }: { rail?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col">
      <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3" aria-label={`${BRAND.organisationName} home`}>
            <img src={BRAND.markUrl} alt={BRAND.organisationName} className="h-9 w-auto" />
            <span className="border-l border-line pl-3 text-sm font-semibold text-ink-muted">Business Health Check</span>
          </Link>
          <Link href="/" className="text-sm font-semibold text-brand hover:text-brand-deep">Back to site</Link>
        </div>
        {rail}
      </header>

      <main className="flex-1 py-8 md:py-12">
        <div className={`container ${aside ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] max-w-6xl" : "max-w-3xl"} mx-auto`}>
          <div className="relative min-w-0">{children}</div>
          {aside}
        </div>
      </main>
      <footer className="border-t border-line py-4">
        <LegalFooterLinks />
      </footer>
    </div>
  );
}

/** The check's main button: it lifts on hover and gives on the press. */
export function PrimaryButton({ children, onClick, disabled, type = "button", large, "aria-describedby": describedBy }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; large?: boolean; "aria-describedby"?: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className={`group inline-flex items-center justify-center bg-ink font-semibold text-paper shadow-[0_14px_30px_-16px_rgba(18,50,79,0.8)] transition-[color,background-color,transform] duration-200 hover:bg-charcoal enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.97] enabled:active:duration-75 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${large ? "h-14 px-8 text-sm" : "h-12 px-7 text-xs"}`}
    >
      {children}
      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </button>
  );
}

/** The first screen: what the check is, its three parts, and the way in. All there at once (R70). */
export function Intro({ hasProgress, onStart, onRestart }: { hasProgress: boolean; onStart: () => void; onRestart: () => void }) {
  return (
    <div className="space-y-10">
      <div>
        {/* The promise is the home page's heading; here it is a line, and the check has its own (R73). */}
        <p className="text-sm font-semibold text-brand">{PROMISE.join(" ")}</p>
        <h1 className="mt-3 font-serif text-4xl font-normal leading-[1.08] sm:text-6xl">
          Free Business Health Check
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-ink-600">
          Some owners know exactly what is wrong. Many can only feel it: busy every day, money in and out, and no clear picture of why it isn't working. This check is for both.
        </p>
        {/* Running text in the body face, never italic serif (B11); the result's headings named as they appear there. */}
        <p className="mt-4 text-lg leading-relaxed text-ink-600">
          It starts with you, the founder, then walks through the parts of the business that apply to you. Each answer determines the next question, so you only see what is relevant. At the end you get a short read: your Findings, what we think the real problem is, and where to start.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {[
          { title: "Your business", body: "Stage, size and how you make money." },
          { title: "Founder readiness", body: "How you lead, what you know, the time you have." },
          { title: "The areas that apply", body: "From strategic intent to financials, chosen by your answers." },
        ].map((item, index) => (
          <li key={item.title} className="border border-line bg-paper-raised p-5 transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-lg">
            <span className="font-serif text-2xl font-normal text-brand">{index + 1}</span>
            <p className="mt-2 font-semibold">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.body}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <PrimaryButton onClick={onStart} large>{hasProgress ? "Continue where you left off" : "Take the Business Health Check"}</PrimaryButton>
        {hasProgress && (
          <button type="button" onClick={onRestart} className="text-sm font-semibold text-brand underline underline-offset-4">Start again</button>
        )}
        <p className="text-sm text-ink-muted">About ten minutes. Free. Ranges are fine.</p>
      </div>

      <p className="flex items-start gap-3 border border-brand-line bg-brand-tint p-4 text-xs leading-relaxed text-brand">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Your answers are private to {BRAND.organisationName}. Progress is kept on this device until you send it, so you can stop and come back.</span>
      </p>
    </div>
  );
}
