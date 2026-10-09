import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CURRENT_STATE } from "@shared/businessSupport";
import React, { useState } from "react";
import { toast } from "sonner";

const STAGE_NAMES: Record<string, string> = { lead: "Lead", qualified_lead: "Qualified lead", call_booked: "Call requested", opportunity: "Opportunity", won: "Won", lost: "Lost", nurture: "Nurture", referred: "Referred" };
const INVITATION_NAMES: Record<string, string> = { pending: "Link sent, waiting", accepted: "Accepted", revoked: "Revoked", expired: "Expired" };

const formatDate = (value: Date | string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");

/**
 * Invite a business check to become a client account. Shown only to administrators with the
 * manage_client_onboarding responsibility (the server enforces it; this only hides the tab).
 * The secure link is shown once, to the administrator, because email delivery may be unavailable.
 */
export default function ClientOnboardingPanel() {
  const utils = trpc.useUtils();
  const candidates = trpc.onboarding.candidates.useQuery(undefined, { retry: false });
  const invitations = trpc.onboarding.invitations.useQuery(undefined, { retry: false });
  const metrics = trpc.onboarding.metrics.useQuery(undefined, { retry: false });
  const [issued, setIssued] = useState<{ url: string; email: string; delivery: string } | null>(null);

  const refresh = () => {
    void utils.onboarding.invitations.invalidate();
    void utils.onboarding.metrics.invalidate();
  };
  const invite = trpc.onboarding.invite.useMutation({
    onSuccess: (result, variables) => {
      const lead = candidates.data?.find(item => item.id === variables.businessCheckId);
      setIssued({ url: result.invitationUrl, email: lead?.email ?? "", delivery: result.deliveryStatus });
      toast.success(result.deliveryStatus === "Sent" ? "Onboarding link emailed." : "Onboarding link created. Copy it to send it yourself.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  /** Won means the Current State Assessment is paid; inviting anyone earlier is allowed but has to be deliberate. */
  const inviteCandidate = (item: { id: number; fullName: string; pipelineStage: string }) => {
    const stage = STAGE_NAMES[item.pipelineStage] ?? item.pipelineStage;
    if (item.pipelineStage !== "won" && !window.confirm(`${item.fullName} is at ${stage}: the ${CURRENT_STATE.name} is not paid yet. Invite them to set up a client account anyway?`)) return;
    invite.mutate({ businessCheckId: item.id });
  };
  const revoke = trpc.onboarding.revoke.useMutation({ onSuccess: () => { toast.success("Invitation revoked."); refresh(); }, onError: error => toast.error(error.message) });

  const stats = metrics.data;
  return (
    <div className="space-y-6 p-6">
      <p role="note" className="border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        The invitation goes out by itself when the {CURRENT_STATE.name} payment is confirmed. Invite by hand only to resend or for an agreed exception.
      </p>
      <p className="text-sm text-ink-muted">
        The link creates the client's account and business workspace. It works once, is tied to their email, and expires in seven days.
      </p>
      {stats && (
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          {[["Business checks", stats.businessChecks], ["Portal users", stats.portalUsers], ["Businesses", stats.businesses], ["Memberships", stats.memberships], ["Pending links", stats.pendingInvitations]].map(([label, value]) => (
            <div key={label as string} className="border border-line bg-white p-3"><dt className="text-xs uppercase tracking-wider text-ink-muted">{label}</dt><dd className="font-serif text-2xl">{value}</dd></div>
          ))}
        </dl>
      )}
      {issued && (
        <div role="status" className="space-y-2 border border-brand-line bg-brand-tint-softest p-4 text-sm">
          <p className="font-semibold">Secure link for {issued.email}</p>
          <p className="text-ink-muted">{issued.delivery === "Sent" ? "The link was also emailed to the client. It is shown only once; do not post it publicly." : "Email not sent. Copy this secure link and send it to the client manually. It is shown only once; do not post it publicly."}</p>
          <div className="flex gap-2">
            <input readOnly value={issued.url} className="w-full border border-line bg-white px-2 py-1 text-xs" aria-label="Onboarding link" onFocus={event => event.currentTarget.select()} />
            <Button type="button" variant="outline" className="rounded-none text-xs" onClick={() => { void navigator.clipboard?.writeText(issued.url); toast.success("Link copied."); }}>Copy</Button>
            <Button type="button" variant="outline" className="rounded-none text-xs" onClick={() => setIssued(null)}>Hide</Button>
          </div>
        </div>
      )}

      <section>
        <h3 className="mb-2 font-serif text-lg">Business checks</h3>
        {candidates.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted"><th className="py-2 pr-3">Name</th><th className="pr-3">Business</th><th className="pr-3">Email</th><th className="pr-3">Call</th><th className="pr-3">Stage</th><th className="pr-3">Onboarding link</th><th /></tr></thead><tbody>
            {candidates.data?.map(item => (
              <tr key={item.id} className="border-b border-line-soft">
                <td className="py-2 pr-3">{item.fullName}</td><td className="pr-3">{item.businessName ?? "-"}</td><td className="pr-3">{item.email}</td><td className="pr-3">{item.callRequestedAt ? `Requested ${formatDate(item.callRequestedAt)}` : "Not requested"}</td><td className="pr-3">{STAGE_NAMES[item.pipelineStage] ?? item.pipelineStage}</td><td className="pr-3">{item.invitationStatus ? INVITATION_NAMES[item.invitationStatus] ?? item.invitationStatus : "None"}</td>
                <td className="text-right"><Button type="button" size="sm" disabled={invite.isPending} className="rounded-none bg-brand text-xs text-white" onClick={() => inviteCandidate(item)}>Invite to onboard</Button></td>
              </tr>
            ))}
            {candidates.data?.length === 0 && <tr><td colSpan={7} className="py-4 text-ink-muted">No business checks yet.</td></tr>}
          </tbody></table></div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-serif text-lg">Invitations</h3>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted"><th className="py-2 pr-3">Email</th><th className="pr-3">Business</th><th className="pr-3">Status</th><th className="pr-3">Expires</th><th /></tr></thead><tbody>
          {invitations.data?.map(item => (
            <tr key={item.id} className="border-b border-line-soft">
              <td className="py-2 pr-3">{item.email}</td><td className="pr-3">{item.businessName || "-"}</td><td className="pr-3 capitalize">{item.status}</td><td className="pr-3">{formatDate(item.expiresAt)}</td>
              <td className="text-right">{item.status === "pending" && <Button type="button" size="sm" variant="outline" disabled={revoke.isPending} className="rounded-none text-xs" onClick={() => revoke.mutate({ invitationId: item.id })}>Revoke</Button>}</td>
            </tr>
          ))}
          {invitations.data?.length === 0 && <tr><td colSpan={5} className="py-4 text-ink-muted">No invitations yet.</td></tr>}
        </tbody></table></div>
      </section>
    </div>
  );
}
