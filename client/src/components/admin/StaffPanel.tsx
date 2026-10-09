import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { PlatformRole } from "@shared/auth";
import React, { useState } from "react";
import { toast } from "sonner";
import { CopyButton, TD, TH } from "./AdminPrimitives";
import { formatDate, roleDisplay } from "./format";

const INVITABLE: { role: Exclude<PlatformRole, "super_admin">; label: string }[] = [
  { role: "desk_lead", label: "Desk lead" },
  { role: "analyst", label: "Analyst" },
  { role: "partner", label: "Partner" },
  { role: "subject_matter_expert", label: "Subject matter expert" },
  { role: "finance", label: "Finance" },
  { role: "admin", label: "Administrator (no powers until granted)" },
];
const STATUS: Record<string, string> = { pending: "Link sent, waiting", accepted: "Accepted", revoked: "Revoked", expired: "Expired" };

/**
 * IP Factory staff on the email-and-password sign-in: everyone with a role, and invitations that create a staff
 * account with one role. Shown to people who manage roles; the server checks again.
 */
export default function StaffPanel() {
  const utils = trpc.useUtils();
  const team = trpc.invitations.staff.team.useQuery(undefined, { retry: false });
  const invitations = trpc.invitations.staff.list.useQuery(undefined, { retry: false });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof INVITABLE)[number]["role"]>("analyst");
  const [issued, setIssued] = useState<{ email: string; url: string; sent: boolean } | null>(null);
  const refresh = () => {
    void utils.invitations.staff.list.invalidate();
    void utils.invitations.staff.team.invalidate();
  };
  const invite = trpc.invitations.staff.invite.useMutation({
    onSuccess: result => {
      setIssued({ email, url: result.invitationUrl, sent: result.deliveryStatus === "Sent" });
      setFullName("");
      setEmail("");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.invitations.staff.revoke.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });

  if (team.error) return <p role="alert" className="border-b border-line p-6 text-sm text-danger">{team.error.message}</p>;
  return (
    <div className="space-y-5 border-b border-line p-6">
      <div>
        <h2 className="font-serif text-xl font-bold">Staff</h2>
        <p className="text-sm text-ink-muted">Everyone who signs in with email and password and holds a role. Invite a new person with one role; they set their own password from the link.</p>
      </div>
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-line"><th className={TH}>Person</th><th className={TH}>Roles</th></tr></thead>
          <tbody>
            {team.data?.map(member => <tr key={member.userId} className="border-b border-line-soft"><td className={TD}><span className="block font-medium">{member.name || "-"}</span><span className="block text-xs text-ink-muted">{member.email}</span></td><td className={TD}>{roleDisplay(member.roles)}</td></tr>)}
            {team.data?.length === 0 && <tr><td colSpan={2} className={TD}>No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" onSubmit={event => { event.preventDefault(); invite.mutate({ fullName, email, role }); }}>
        <div><label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted" htmlFor="staff-name">Full name</label><input id="staff-name" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={fullName} onChange={event => setFullName(event.target.value)} /></div>
        <div><label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted" htmlFor="staff-email">Email</label><input id="staff-email" type="email" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={email} onChange={event => setEmail(event.target.value)} /></div>
        <select aria-label="Role" className="border border-line bg-white px-2 py-1.5 text-sm" value={role} onChange={event => setRole(event.target.value as typeof role)}>{INVITABLE.map(item => <option key={item.role} value={item.role}>{item.label}</option>)}</select>
        <Button type="submit" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={invite.isPending || !fullName.trim() || !email.trim()}>Invite</Button>
      </form>
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
              <span>{item.fullName} <span className="text-ink-muted">· {item.email} · {roleDisplay(item.role ? [item.role] : [])} · {STATUS[item.status]}{item.status === "pending" ? ` until ${formatDate(item.expiresAt)}` : ""}</span></span>
              {item.status === "pending" && <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate({ invitationId: item.id })}>Revoke</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
