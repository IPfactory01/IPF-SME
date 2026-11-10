import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import React from "react";
import { toast } from "sonner";
import { formatDateTime } from "./format";

/** Why an email did not arrive, in a line. */
const WHY: Record<string, string> = {
  failed: "Not sent: Resend did not accept it, or could not be reached.",
  bounced: "Bounced: the address does not exist, or its mail server refused it.",
  suppressed: "Not sent: this address bounced or reported spam before, so Resend held it back.",
};

/**
 * Emails that did not arrive (G3, R42; App flow 7): at the top of Pipeline while there are any, nothing otherwise. Each
 * says what it was, whom it was for, when and why; **Dealt with** clears it for everyone once someone has sent it again
 * or reached the person another way. The server checks the permission (manage_client_onboarding) and records who did.
 */
export default function FailedEmails() {
  const utils = trpc.useUtils();
  const list = trpc.businessSupport.failedEmails.useQuery(undefined);
  const dealt = trpc.businessSupport.emailsDealtWith.useMutation({
    onSuccess: () => void utils.businessSupport.failedEmails.invalidate(),
    onError: error => toast.error(error.message),
  });
  if (list.error && list.data === undefined) {
    return (
      <p role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2 text-xs text-ink-muted">
        We could not check for emails that did not arrive.
        <button type="button" className="font-semibold text-brand underline" onClick={() => void list.refetch()}>Try again</button>
      </p>
    );
  }
  const data = list.data;
  if (!data || data.total === 0) return null;
  const more = data.total - data.emails.length;
  return (
    <section aria-label="Emails that did not arrive" className="space-y-2 border-b border-line bg-white p-4">
      <div className="space-y-1 border-l-2 border-danger pl-3">
        <h2 className="text-sm font-semibold text-ink">Emails that did not arrive ({data.total})</h2>
        <p className="text-xs text-ink-muted">These went to a client or a prospect but did not reach them. Check the address, then send the email again from where it came, or reach them on WhatsApp. Mark each one dealt with once you have.</p>
      </div>
      <ul aria-label="Emails that did not arrive" className="divide-y divide-line-soft">
        {data.emails.map(email => (
          <li key={email.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="break-words text-sm font-medium text-ink">{email.subject}</p>
              <p className="break-all text-xs text-ink-muted">To {email.recipient}{email.client ? ` · ${email.client}` : ""} · {formatDateTime(email.at)}</p>
              <p className="text-xs text-danger">{WHY[email.state] ?? "It did not arrive."}</p>
            </div>
            <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={dealt.isPending} onClick={() => dealt.mutate({ deliveryIds: [email.id] })} aria-label={`Dealt with: ${email.subject} to ${email.recipient}`}>Dealt with</Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {more > 0 ? <p className="text-xs text-ink-muted">And {more} older, shown as these are dealt with.</p> : <span />}
        {data.emails.length > 1 && (
          <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={dealt.isPending} onClick={() => dealt.mutate({ deliveryIds: data.emails.map(email => email.id) })}>Mark all {data.emails.length} dealt with</Button>
        )}
      </div>
    </section>
  );
}
