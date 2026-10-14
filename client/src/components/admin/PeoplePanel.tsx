import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import React, { useState } from "react";
import { toast } from "sonner";
import { CopyButton, TD, TH } from "./AdminPrimitives";
import { formatDate, roleDisplay } from "./format";

const STATUS: Record<string, string> = { active: "Active", suspended: "Suspended", disabled: "Disabled" };

/**
 * Everyone who signs in with a password: clients and staff. For the people who manage users (the Super Admin by
 * default): issue a password reset link, suspend an account or reinstate it. Shows nothing to anyone else; the server
 * checks again.
 */
export default function PeoplePanel() {
  const utils = trpc.useUtils();
  const people = trpc.people.list.useQuery(undefined, { retry: false });
  const [issued, setIssued] = useState<{ email: string; url: string; sent: boolean } | null>(null);
  const [suspending, setSuspending] = useState<{ id: number; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => void utils.people.list.invalidate();
  const issue = trpc.people.issuePasswordReset.useMutation({
    onSuccess: (result, variables) => {
      const person = people.data?.find(item => item.id === variables.userId);
      setIssued({ email: person?.email ?? "", url: result.resetUrl, sent: result.deliveryStatus === "Sent" });
      toast.success(result.deliveryStatus === "Sent" ? "Reset link emailed." : "Reset link created. Copy it to send it yourself.");
    },
    onError: error => toast.error(error.message),
  });
  const setStatus = trpc.people.setStatus.useMutation({
    onSuccess: result => {
      toast.success(result.status === "suspended" ? "Account suspended." : "Account reinstated.");
      setSuspending(null);
      setReason("");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const suspend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!suspending || reason.trim().length < 3) return;
    setStatus.mutate({ userId: suspending.id, status: "suspended", reason: reason.trim() });
  };

  if (people.error || !people.data) return null;
  return (
    <div className="space-y-5 border-b border-line p-6">
      <div>
        <h2 className="font-serif text-xl font-bold">People</h2>
        <p className="text-sm text-ink-muted">Everyone who signs in with a password, clients and staff. A reset link is emailed to the person and shown once here; it works once, for 20 minutes, and signs them out everywhere. Suspending an account signs the person out at once and refuses their sign-in until it is reinstated.</p>
      </div>
      {issued && (
        <div role="status" className="space-y-2 border border-brand-line bg-brand-tint p-3 text-sm">
          <p className="font-semibold">Reset link for {issued.email}</p>
          <p className="text-ink-muted">{issued.sent ? "It was emailed. The link is shown once here as well." : "Email is not set up yet: copy this link and send it to them yourself. It is shown once."}</p>
          <div className="flex items-center gap-2"><input readOnly aria-label="Reset link" className="w-full border border-line bg-white px-2 py-1 text-xs" value={issued.url} /><CopyButton value={issued.url} label="Copy the reset link" /><Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={() => setIssued(null)}>Hide</Button></div>
        </div>
      )}
      {suspending && (
        <form aria-label="Suspend account" onSubmit={suspend} className="space-y-2 border border-health-watch/40 bg-health-watch-tint p-4 text-sm">
          <p className="font-semibold">Suspend {suspending.name}?</p>
          <p className="text-ink-muted">They are signed out everywhere at once and cannot sign in until reinstated. Give the reason; it is recorded.</p>
          <div className="space-y-1">
            <label htmlFor="suspend-reason" className="text-xs uppercase tracking-wider text-ink-muted">Reason</label>
            <input id="suspend-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} className="w-full border border-line bg-white px-2 py-1" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={setStatus.isPending || reason.trim().length < 3} className="rounded-none bg-brand text-xs text-white">Suspend</Button>
            <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" onClick={() => { setSuspending(null); setReason(""); }}>Cancel</Button>
          </div>
        </form>
      )}
      <div className="overflow-x-auto border border-line bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-line"><th className={TH}>Person</th><th className={TH}>Roles</th><th className={TH}>Status</th><th className={TH}>Last signed in</th><th className={TH} /></tr></thead>
          <tbody>
            {people.data.map(person => (
              <tr key={person.id} className="border-b border-line-soft">
                <td className={TD}><span className="block font-medium">{person.name || "-"}</span><span className="block text-xs text-ink-muted">{person.email}</span></td>
                <td className={TD}>{person.roles.length ? roleDisplay(person.roles) : person.businesses ? "Client" : "-"}</td>
                <td className={TD}>{STATUS[person.status] ?? person.status}</td>
                <td className={TD}>{formatDate(person.lastSignedIn)}</td>
                <td className={`${TD} text-right`}>
                  <div className="flex flex-wrap justify-end gap-2">
                    {person.status === "active" && <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={issue.isPending} onClick={() => issue.mutate({ userId: person.id })}>Reset link</Button>}
                    {person.status === "active" && <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={setStatus.isPending} onClick={() => { setSuspending({ id: person.id, name: person.name || person.email || "this person" }); setReason(""); }}>Suspend</Button>}
                    {person.status === "suspended" && <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ userId: person.id, status: "active" })}>Reinstate</Button>}
                  </div>
                </td>
              </tr>
            ))}
            {people.data.length === 0 && <tr><td colSpan={5} className={TD}>Nobody has a password account yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
