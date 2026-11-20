/**
 * The emailed copy of a Pulse result, offered after the result is on screen. It sends a link back to the result (the
 * PDF arrives with the Pulse admin) and records the marketing choice. The confirmation says plainly whether the email
 * really went.
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const PRIVACY_NOTICE_VERSION = "v1";

function EmailReportForm({ sessionId }: { sessionId: string }) {
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitKey, setSubmitKey] = useState(0);
  const requestReport = trpc.pulse.requestEmailedReport.useMutation({
    onSuccess: (data) => {
      setMarketingConsent(false);
      // DEF-004 (Mark One QA): the confirmation must distinguish a real
      // email delivery from a recorded-but-not-delivered request.
      toast.success(
        data.delivered
          ? "A link to your results is on its way to your inbox."
          : "Your request is recorded, but the email could not be sent just now. Your results stay on this page.",
      );
      setSubmitted(true);
    },
    onError: (e) => {
      toast.error(e.message);
      // The request failed before being recorded — invite a retry so the
      // respondent is never left staring at a dead button.
      setSubmitKey((k) => k + 1);
    },
  });

  const submit = () => requestReport.mutate({ sessionId, marketingConsent });

  return (
    <div id="pulse-followup-email" className="scroll-mt-20 space-y-4 rounded-xl border bg-paper-raised p-5 sm:p-6 border-line">
      <div className="flex items-center gap-2.5">
        <Mail className="h-5 w-5 text-brand" />
        <h3 className="font-display text-base font-semibold">Email me the report</h3>
      </div>
        <p className="text-sm leading-relaxed text-ink-muted">
        We will send a link to these results to the email you gave at the start.
      </p>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-paper-muted/60 p-3 text-xs leading-relaxed">
        <Checkbox
          checked={marketingConsent}
          onCheckedChange={(v) => setMarketingConsent(v === true)}
          className="mt-0.5"
        />
        <span className="text-ink/80">
          Keep me updated with IP Factory insights, events and offers. You can opt out at any time. It does not affect your results.
        </span>
      </label>
      <p className="rounded-lg border border-line bg-paper-muted/30 p-3 text-xs leading-relaxed text-ink/75">
        <strong>Privacy notice ({PRIVACY_NOTICE_VERSION}) already acknowledged:</strong>{" "}
        your contact details were collected with your consent before the
        assessment and are used to deliver this report. Your answers remain
        subject to the same privacy notice.
      </p>
      {submitted ? (
        <p className="rounded-lg bg-brand-tint-soft p-3 text-xs leading-relaxed text-ink/85">
          Your request has been recorded with your privacy acknowledgement.
          {" "}
          <button
            type="button"
            className="font-semibold text-brand-deep underline underline-offset-2"
            onClick={() => {
              setSubmitted(false);
              setSubmitKey((k) => k + 1);
            }}
          >
            Send another copy
          </button>
        </p>
      ) : (
        <Button
          className="bg-brand text-white hover:bg-brand-deep disabled:bg-line-strong disabled:text-ink-muted w-full"
          disabled={requestReport.isPending}
          onClick={submit}
          key={submitKey}
        >
          {requestReport.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <FileText className="mr-1.5 h-4 w-4" /> Email my results
            </>
          )}
        </Button>
      )}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-muted">
        <ShieldCheck className="h-3.5 w-3.5" /> Consent and delivery are recorded for audit purposes
      </p>
    </div>
  );
}

export { EmailReportForm };
