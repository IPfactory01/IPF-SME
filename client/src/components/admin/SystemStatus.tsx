import { trpc } from "@/lib/trpc";
import React from "react";
import { StorageLine } from "./EngagementsView";

/**
 * System status, in one place (Admin › Team): whether clients can upload files, and what happened to recent Business
 * Support email. Both were on the tabs that use them; they are about the platform, not a client.
 */
export default function SystemStatus() {
  const storage = trpc.engagement.staff.storageStatus.useQuery(undefined, { retry: false });
  const emailStatus = trpc.businessSupport.emailDeliveryStatus.useQuery(undefined, { retry: false });
  return (
    <div className="space-y-4 border-b border-line p-6">
      <div>
        <h2 className="font-serif text-xl font-normal">System status</h2>
        <p className="text-sm text-ink-muted">File uploads and email, checked live.</p>
      </div>
      {storage.data && <StorageLine status={storage.data} onCheck={() => void storage.refetch()} />}
      {storage.error && <p role="status" aria-label="File uploads" className="border border-health-watch bg-health-watch-tint p-3 text-sm text-health-watch-strong">Could not check file storage: {storage.error.message}</p>}
      <section aria-labelledby="business-support-email-status" className="border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 id="business-support-email-status" className="font-serif text-lg font-normal">Business Support email status</h2>
          <p className="mt-1 text-xs text-ink-muted">Recent attempts and Resend delivery events. Message contents are not stored here.</p>
        </div>
        {emailStatus.isLoading ? <p className="p-4 text-sm text-ink-muted">Loading email status…</p> : emailStatus.error ? <p role="alert" className="p-4 text-sm text-danger-strong">Email status is unavailable.</p> : emailStatus.data?.length ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-paper text-ink-muted"><tr><th className="p-2">Recipient</th><th className="p-2">Email</th><th className="p-2">Status</th><th className="p-2">Related record</th><th className="p-2">Provider ID</th><th className="p-2">Last update</th></tr></thead>
              <tbody>{emailStatus.data.map((row, index) => <tr key={`${row.recipientEmail}-${row.attemptedAt}-${index}`} className="border-t border-line"><td className="p-2">{row.recipientEmail}</td><td className="p-2">{row.purpose}</td><td className="p-2">{row.latestState}</td><td className="p-2">{row.businessCheckId ? `Business Health Check #${row.businessCheckId}` : row.paymentRequestId ? `Payment #${row.paymentRequestId}` : row.invitationId ? `Invitation #${row.invitationId}` : "—"}</td><td className="max-w-48 truncate p-2" title={row.providerMessageId ?? undefined}>{row.providerMessageId ?? "—"}</td><td className="p-2">{new Date(row.lastEventAt ?? row.acceptedAt ?? row.attemptedAt).toLocaleString()}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="p-4 text-sm text-ink-muted">No Business Support email attempts have been recorded.</p>}
      </section>
    </div>
  );
}
