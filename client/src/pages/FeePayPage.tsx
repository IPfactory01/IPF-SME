import { PrivacyLink, TermsLink } from "@/components/LegalLinks";
import { PaymentShell, TestModeBanner } from "@/components/PaymentShell";
import { Button } from "@/components/ui/button";
import { openCheckout, rememberPayPage } from "@/lib/payOnline";
import { trpc } from "@/lib/trpc";
import { formatNaira } from "@shared/businessSupport";
import { CheckCircle2, Lock } from "lucide-react";
import React, { useState } from "react";
import { useParams } from "wouter";

/**
 * Paying one engagement fee (R11): reached from the payment email or the Payments tab of the client's room. The server
 * decides everything on it: the fee and its amount come from the fee line, and the button only asks the server to open
 * Paystack's checkout, which takes card, bank transfer or USSD.
 */
export default function FeePayPage() {
  const params = useParams<{ feeLineId: string; token: string }>();
  const feeLineId = Number(params.feeLineId);
  const token = params.token ?? "";
  const valid = Number.isInteger(feeLineId) && feeLineId > 0 && token.length >= 16;
  const page = trpc.onlinePayment.feePage.useQuery({ feeLineId, token }, { enabled: valid, retry: false, refetchOnWindowFocus: false });
  const [problem, setProblem] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [paidMeanwhile, setPaidMeanwhile] = useState(false);
  const start = trpc.onlinePayment.feeStart.useMutation({
    onSuccess: (result) => {
      if (result.alreadyPaid) return setPaidMeanwhile(true);
      setLeaving(true);
      rememberPayPage(`/pay/fee/${feeLineId}/${token}`);
      try {
        openCheckout(result.url);
      } catch (error) {
        setLeaving(false);
        setProblem(error instanceof Error ? error.message : "We could not open Paystack.");
      }
    },
    onError: (error) => setProblem(error.message),
  });

  const invalid = (message?: string) => (
    <PaymentShell>
      <h1 className="font-serif text-3xl font-normal">This link is not valid</h1>
      <p className="mt-3 text-ink-soft">{message ?? "Use the link in your payment email, or reply to it for help."}</p>
    </PaymentShell>
  );
  if (!valid) return invalid();
  if (page.isLoading) return <PaymentShell><p className="text-sm text-ink-muted">Opening your payment…</p></PaymentShell>;
  if (page.error || !page.data) return invalid(page.error?.message);

  const { businessName, engagement, label, amountNaira, reference, mode, state } = page.data;
  const amount = formatNaira(amountNaira);
  const banner = mode === "test" ? <TestModeBanner /> : null;

  if (state === "paid" || paidMeanwhile) {
    return (
      <PaymentShell>
        {banner}
        <div className="space-y-4">
          <CheckCircle2 className="h-10 w-10 text-brand" aria-hidden />
          <h1 className="font-serif text-3xl font-normal">Already paid</h1>
          <p className="text-ink-soft">{label} for the {engagement} is paid. Thank you.</p>
        </div>
      </PaymentShell>
    );
  }

  return (
    <PaymentShell>
      {banner}
      <p className="text-sm font-semibold text-brand">Payment · {businessName}</p>
      <h1 className="mt-2 font-serif text-3xl font-normal sm:text-4xl">{engagement}</h1>
      <p className="mt-3 text-ink-soft">{label}</p>
      <p className="mt-6 font-sans text-5xl font-semibold tracking-tight tabular-nums text-ink">{amount}</p>
      <p className="mt-2 text-xs text-ink-muted">Reference {reference}</p>

      {mode === "off" ? (
        <p className="mt-6 border border-line bg-paper-raised p-4 text-sm text-ink-soft">
          Online payment is not open yet. Please reply to your payment email and we will send you a link when it is.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          <Button type="button" disabled={start.isPending || leaving} onClick={() => { setProblem(null); start.mutate({ feeLineId, token }); }}
            className="h-14 w-full rounded-none bg-highlight-ink px-6 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60">
            <Lock className="mr-2 h-4 w-4" aria-hidden />
            {start.isPending || leaving ? "Opening Paystack…" : `Pay ${amount} securely with Paystack`}
          </Button>
          <p className="text-xs leading-relaxed text-ink-muted">By proceeding with payment, you agree to the <TermsLink newTab /> and acknowledge the <PrivacyLink newTab />.</p>
          <p className="text-xs leading-relaxed text-ink-muted">You go to Paystack's secure page to pay by card, bank transfer or USSD, then come back here. Your payment is confirmed straight away, and we email you a receipt.</p>
          {problem && <p role="alert" className="text-sm text-danger-strong">{problem}</p>}
        </div>
      )}
    </PaymentShell>
  );
}
