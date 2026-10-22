import { PrivacyLink, TermsLink } from "@/components/LegalLinks";
import { PaymentShell, TestModeBanner } from "@/components/PaymentShell";
import { Button } from "@/components/ui/button";
import { openCheckout, rememberPayPage } from "@/lib/payOnline";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { CURRENT_STATE, formatNaira, FULL_REPORT } from "@shared/businessSupport";
import { METHOD, METHOD_MEANING } from "@shared/method";
import { isPaymentItem, payPath, type PaymentItem } from "@shared/payments";
import { CheckCircle2, Lock } from "lucide-react";
import React, { useState } from "react";
import { useParams } from "wouter";

/**
 * The pay page, reached from the "Pay online" button in the payment email or "Pay for your Full Report" in the Business
 * Check summary email. The server decides everything on it: the amount comes from the payment request, and the button
 * only asks the server to open Paystack's checkout, which takes card, bank transfer or USSD. Paystack is the only way to pay.
 */

const MEANING: Record<PaymentItem, string> = { full_report: METHOD_MEANING.fullReport, current_state: METHOD_MEANING.currentState };

/** What happens once the item is paid, in the owner's words. */
const AFTER_PAYING: Record<PaymentItem, string> = {
  full_report: `We email you the ${METHOD.reportIntake}, a short form about your business (about ${FULL_REPORT.formMinutes} minutes). Your ${METHOD.fullReport} is emailed to you the moment you finish it.`,
  current_state: `Your ${METHOD.currentState} is booked. ${CURRENT_STATE.start} We email you a link to set up your client account on ${BRAND.productName}.`,
};

const ALREADY_PAID: Record<PaymentItem, string> = {
  full_report: `Your ${METHOD.reportIntake} link is in your email. If you cannot find it, reply to your payment email.`,
  current_state: `Your ${METHOD.currentState} is paid. Look for the email with the link to set up your client account on ${BRAND.productName}.`,
};

export default function PayPage() {
  const params = useParams<{ token: string; item: string }>();
  const token = params.token ?? "";
  const item = isPaymentItem(params.item) ? params.item : null;
  const page = trpc.onlinePayment.page.useQuery({ token, item: item ?? "full_report" }, { enabled: Boolean(item && token), retry: false, refetchOnWindowFocus: false });
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paidMeanwhile, setPaidMeanwhile] = useState(false);
  const start = trpc.onlinePayment.start.useMutation({
    onSuccess: (result) => {
      if (result.alreadyPaid) return setPaidMeanwhile(true);
      setLeaving(true);
      rememberPayPage(payPath(token, item!));
      try {
        openCheckout(result.url);
      } catch (error) {
        setLeaving(false);
        setProblem(error instanceof Error ? error.message : "We could not open Paystack.");
      }
    },
    onError: (error) => setProblem(error.message),
  });

  if (!item) {
    return (
      <PaymentShell>
        <h1 className="font-serif text-3xl font-bold">This link is not valid</h1>
        <p className="mt-3 text-ink-soft">Use the link in your payment email, or reply to it for help.</p>
      </PaymentShell>
    );
  }
  if (page.isLoading) return <PaymentShell><p className="text-sm text-ink-muted">Opening your payment…</p></PaymentShell>;
  if (page.error || !page.data) {
    return (
      <PaymentShell>
        <h1 className="font-serif text-3xl font-bold">This link is not valid</h1>
        <p className="mt-3 text-ink-soft">{page.error?.message ?? "Use the link in your payment email, or reply to it for help."}</p>
      </PaymentShell>
    );
  }

  const { name, amountNaira, mode, state } = page.data;
  const amount = formatNaira(amountNaira);
  const banner = mode === "test" ? <TestModeBanner /> : null;

  if (state === "paid" || paidMeanwhile) {
    return (
      <PaymentShell>
        {banner}
        <div className="space-y-4">
          <CheckCircle2 className="h-10 w-10 text-highlight-ink" aria-hidden />
          <h1 className="font-serif text-3xl font-bold">Already paid</h1>
          <p className="text-ink-soft">Your {name} is paid. Thank you.</p>
          <p className="text-ink-soft">{ALREADY_PAID[item]}</p>
        </div>
      </PaymentShell>
    );
  }

  const online = mode !== "off" && state !== "expired";
  return (
    <PaymentShell>
      {banner}
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight-ink">Payment</p>
      <h1 className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{name}</h1>
      <p className="mt-3 text-ink-soft">{MEANING[item]}</p>
      <p className="mt-6 font-serif text-5xl font-black tracking-tight text-ink">{amount}</p>

      {state === "expired" && (
        <p role="alert" className="mt-6 border border-danger-line bg-danger-tint p-4 text-sm text-danger-strong">
          This payment link has passed its 48 hours. Reply to your payment email and we will send you a new one.
        </p>
      )}
      {mode === "off" && state !== "expired" && (
        <p className="mt-6 border border-line bg-paper-raised p-4 text-sm text-ink-soft">
          Online payment is not open yet. Please try again later, or reply to your payment email and we will send you a link when it is.
        </p>
      )}

      {online && (
        <div className="mt-6 space-y-3">
          <Button type="button" disabled={start.isPending || leaving} onClick={() => { setProblem(null); start.mutate({ token, item }); }}
            className="h-14 w-full rounded-none bg-highlight-ink px-6 text-sm font-semibold uppercase tracking-widest text-paper hover:opacity-90 disabled:opacity-60">
            <Lock className="mr-2 h-4 w-4" aria-hidden />
            {start.isPending || leaving ? "Opening Paystack…" : `Pay ${amount} securely with Paystack`}
          </Button>
          <p className="text-xs leading-relaxed text-ink-muted">By proceeding with payment, you agree to the <TermsLink newTab /> and acknowledge the <PrivacyLink newTab />.</p>
          <p className="text-xs leading-relaxed text-ink-muted">You go to Paystack's secure page to pay by card, bank transfer or USSD, then come back here. Your payment is confirmed straight away.</p>
          {problem && <p role="alert" className="text-sm text-danger-strong">{problem}</p>}
        </div>
      )}

      <section aria-label="After you pay" className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">After you pay</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{AFTER_PAYING[item]}</p>
      </section>

    </PaymentShell>
  );
}
