import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { FIRM_LEVELS, LEVEL_ACCESS, type FirmLevel } from "@shared/platformPermissions";
import React, { useState } from "react";
import { toast } from "sonner";
import { CopyButton, TD, TH } from "./AdminPrimitives";
import { formatDate, roleDisplay } from "./format";

const STATUS: Record<string, string> = { pending: "Link sent, waiting", accepted: "Accepted", revoked: "Revoked", expired: "Expired" };

/**
 * IP Factory staff on the email-and-password sign-in: everyone with a role, and invitations that create a staff
 * account with one role. Shown to people who manage roles; the server checks again.
 */
export default function StaffPanel() {
  const utils = trpc.useUtils();
  const invitations = trpc.invitations.staff.list.useQuery(undefined, { retry: false });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<FirmLevel>("Business Analyst");
  const [expiresOn, setExpiresOn] = useState("");
  const needsEnd = level === "Specialist";
  const [issued, setIssued] = useState<{ email: string; url: string; sent: boolean } | null>(null);
  const refresh = () => {
    void utils.invitations.staff.list.invalidate();
    void utils.people.list.invalidate();
  };
  const invite = trpc.invitations.staff.invite.useMutation({
    onSuccess: result => {
      setIssued({ email, url: result.invitationUrl, sent: result.deliveryStatus === "Sent" });
      setFullName("");
      setEmail("");
      setExpiresOn("");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.invitations.staff.revoke.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });

  return (
    <div className="space-y-5 border-b border-line p-6">
      <div>
        <h2 className="font-serif text-xl font-normal">Invite someone</h2>
        <p className="text-sm text-ink-muted">Invite by level: the level decides what they can open, and their function on each project is set in Engagements. They set their own password from the link, then two-step sign-in on their phone. A specialist's access ends on the date you choose.</p>
      </div>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end" onSubmit={event => { event.preventDefault(); invite.mutate({ fullName, email, level, expiresOn: expiresOn || null }); }}>
        <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="staff-name">Full name</label><input id="staff-name" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={fullName} onChange={event => setFullName(event.target.value)} /></div>
        <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="staff-email">Email</label><input id="staff-email" type="email" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={email} onChange={event => setEmail(event.target.value)} /></div>
        <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="staff-level">Level</label><select id="staff-level" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={level} onChange={event => setLevel(event.target.value as FirmLevel)}>{FIRM_LEVELS.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
        <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="staff-ends">Access ends{needsEnd ? "" : " (optional)"}</label><input id="staff-ends" type="date" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></div>
        <Button type="submit" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={invite.isPending || !fullName.trim() || !email.trim() || (needsEnd && !expiresOn)}>Invite</Button>
      </form>
      <p className="text-xs text-ink-muted">{level}: {LEVEL_ACCESS[level]}. Their function on each project (Engagement Manager, Lead Consultant, Analyst, Specialist) is set in Engagements.</p>
      {issued && (
        <div role="status" className="space-y-2 border border-brand-line bg-brand-tint p-3 text-sm">
          <p className="font-semibold">Invitation for {issued.email}</p>
          <p className="text-ink-muted">{issued.sent ? "It was emailed. The link is shown once here as well." : "Email is not set up yet: copy this link and send it to them yourself. It is shown once."}</p>
          <div className="flex items-center gap-2"><input readOnly aria-label="Invitation link" className="w-full border border-line bg-white px-2 py-1 text-xs" value={issued.url} /><CopyButton value={issued.url} label="Copy the invitation link" /></div>
        </div>
      )}
      {invitations.data && invitations.data.length > 0 && (
        <ul aria-label="Staff invitations" className="space-y-1 text-sm">
          {invitations.data.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft py-1">
              <span>{item.fullName} <span className="text-ink-muted">· {item.email} · {item.level ?? roleDisplay(item.role ? [item.role] : [])}{item.roleExpiresAt ? ` until ${formatDate(item.roleExpiresAt)}` : ""} · {STATUS[item.status]}{item.status === "pending" ? ` until ${formatDate(item.expiresAt)}` : ""}</span></span>
              {item.status === "pending" && <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate({ invitationId: item.id })}>Revoke</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
