import { PaymentShell, TestModeBanner } from "@/components/PaymentShell";
import { Button } from "@/components/ui/button";
import { rememberedPayPage } from "@/lib/payOnline";
import { trpc } from "@/lib/trpc";
import { BRAND } from "@shared/brand";
import { CURRENT_STATE, FULL_REPORT } from "@shared/businessSupport";
import { METHOD } from "@shared/method";
import type { OnlinePaymentMode, OnlinePaymentStatus, PaymentItem } from "@shared/payments";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";

/**
 * Where Paystack sends the owner back to (`/pay/return?reference=…`). The server asks Paystack how the payment stands
 * and confirms it if Paystack's webhook has not yet, so the owner sees the outcome at once. The page learns only paid,
 * pending or failed, and which item.
 */

type Outcome = { status: OnlinePaymentStatus; item: PaymentItem; mode: OnlinePaymentMode };

const NEXT_STEPS: Record<PaymentItem, { thanks: string; steps: string[] }> = {
  full_report: {
    thanks: `Thank you. Your ${METHOD.fullReport} is paid.`,
    steps: [
      `We email you a link to the ${METHOD.reportIntake}, a short form about your business (about ${FULL_REPORT.formMinutes} minutes).`,
      `Your ${METHOD.fullReport} is built from your answers and emailed to you the moment you finish.`,
    ],
  },
  current_state: {
    thanks: `Thank you. Your ${METHOD.currentState} is paid, and it starts now.`,
    steps: [
      CURRENT_STATE.start,
      `We email you a link to set up your client account on ${BRAND.productName}. Your ${METHOD.currentState} lives there.`,
      `We agree the time of your first ${METHOD.currentState} ${METHOD.session} with you.`,
    ],
  },
};

function NotFound({ message }: { message: string }) {
  return (
    <PaymentShell>
      <h1 className="font-serif text-3xl font-bold">We could not find your payment</h1>
      <p className="mt-3 text-ink-soft">{message}</p>
    </PaymentShell>
  );
}

export default function PayReturnPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const reference = (params.get("reference") || params.get("trxref") || "").trim();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const status = trpc.onlinePayment.status.useMutation({
    onSuccess: (result) => { setProblem(null); setOutcome(result); },
    onError: (error) => setProblem(error.message),
  });

  useEffect(() => {
    if (reference) status.mutate({ reference });
  }, [reference]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!reference) return <NotFound message="Use the Pay online button in your payment email to try again, or reply to that email for help." />;
  if (problem && !outcome) return <NotFound message={problem} />;
  if (!outcome) return <PaymentShell><p className="text-sm text-ink-muted">Checking your payment with Paystack…</p></PaymentShell>;

  const banner = outcome.mode === "test" ? <TestModeBanner /> : null;
  if (outcome.status === "paid") {
    const next = NEXT_STEPS[outcome.item];
    return (
      <PaymentShell>
        {banner}
        <div className="space-y-4">
          <CheckCircle2 className="h-10 w-10 text-highlight-ink" aria-hidden />
          <h1 className="font-serif text-3xl font-bold">Payment received</h1>
          <p className="text-ink-soft">{next.thanks} We have emailed you a confirmation.</p>
          <h2 className="pt-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">What happens next</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-ink-soft" aria-label="What happens next">
            {next.steps.map((step) => <li key={step} className="border-l-2 border-highlight pl-3">{step}</li>)}
          </ul>
        </div>
      </PaymentShell>
    );
  }

  if (outcome.status === "pending") {
    return (
      <PaymentShell>
        {banner}
        <div className="space-y-4">
          <Clock className="h-10 w-10 text-health-watch" aria-hidden />
          <h1 className="font-serif text-3xl font-bold">Still confirming</h1>
          <p className="text-ink-soft">Paystack has not confirmed your payment to us yet. This usually takes a moment.</p>
          <Button type="button" disabled={status.isPending} onClick={() => status.mutate({ reference })}
            className="h-12 rounded-none bg-brand px-6 text-sm font-semibold uppercase tracking-wider text-white hover:bg-brand-deep-hover disabled:opacity-60">
            {status.isPending ? "Checking…" : "Check again"}
          </Button>
          {problem && <p role="alert" className="text-sm text-danger-strong">{problem}</p>}
          <p className="text-sm text-ink-muted">If you have paid and this does not change within a few minutes, reply to your payment email. Please do not pay again.</p>
        </div>
      </PaymentShell>
    );
  }

  const back = rememberedPayPage();
  return (
    <PaymentShell>
      {banner}
      <div className="space-y-4">
        <XCircle className="h-10 w-10 text-danger" aria-hidden />
        <h1 className="font-serif text-3xl font-bold">Payment not completed</h1>
        <p className="text-ink-soft">Your payment did not go through, so nothing has been confirmed. You can try again.</p>
        {back
          ? <Link href={back} className="inline-flex h-12 items-center bg-highlight-ink px-6 text-sm font-semibold uppercase tracking-widest text-paper hover:opacity-90">Try again</Link>
          : <p className="text-ink-soft">Use the Pay online button in your payment email to try again.</p>}
      </div>
    </PaymentShell>
  );
}
