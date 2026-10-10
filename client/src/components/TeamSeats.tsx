import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CLIENT_ACCESS_LABELS, CLIENT_ACCESS_LEVELS, type ClientAccessLevel } from "@shared/engagement";
import React, { useState } from "react";
import { toast } from "sonner";

/**
 * The owner's team on the engagement: the included seat, who has it or is invited, and what they can see. Shown to
 * the owner; the server refuses everyone else.
 */
export default function TeamSeats() {
  const utils = trpc.useUtils();
  const seats = trpc.invitations.seats.list.useQuery(undefined, { retry: false });
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<ClientAccessLevel>("contributor");
  const [link, setLink] = useState<string | null>(null);
  const refresh = { onSuccess: () => void utils.invitations.seats.list.invalidate(), onError: (error: { message: string }) => toast.error(error.message) };
  const invite = trpc.invitations.seats.invite.useMutation({
    ...refresh,
    onSuccess: result => {
      refresh.onSuccess();
      toast.success(result.deliveryStatus === "Sent" ? "Invitation sent." : "Invitation ready. Send them the link below.");
      setLink(result.deliveryStatus === "Sent" ? null : result.invitationUrl);
      setFullName("");
      setEmail("");
    },
  });
  const revoke = trpc.invitations.seats.revoke.useMutation(refresh);
  const remove = trpc.invitations.seats.remove.useMutation(refresh);
  const change = trpc.invitations.seats.setAccess.useMutation(refresh);
  if (!seats.data) return null;
  const { included, used, members, invitations } = seats.data;
  const free = used < included;
  return (
    <section aria-labelledby="your-team" className="border border-line-soft bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Your team</p>
      <h2 id="your-team" className="mt-1 font-serif text-xl font-bold tracking-tight">Bring in one person from your business</h2>
      <p className="mt-1 text-sm text-ink-muted">Your engagement includes {included === 1 ? "one person" : `${included} people`} besides you, at no cost. Session notes and Findings stay with you unless you share them.</p>
      <ul className="mt-4 space-y-3">
        {members.map(member => (
          <li key={member.membershipId} className="flex flex-col gap-2 border border-line-soft p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{member.name}</p><p className="text-xs text-ink-muted">{member.email}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={`What ${member.name} can see`} className="border border-line bg-white px-2 py-1 text-sm" value={member.access} disabled={change.isPending} onChange={event => change.mutate({ membershipId: member.membershipId, access: event.target.value as ClientAccessLevel })}>
                {CLIENT_ACCESS_LEVELS.map(level => <option key={level} value={level}>{CLIENT_ACCESS_LABELS[level].name}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={remove.isPending} onClick={() => window.confirm(`Remove ${member.name}? They lose access straight away.`) && remove.mutate({ membershipId: member.membershipId })}>Remove</Button>
            </div>
          </li>
        ))}
        {invitations.map(item => (
          <li key={item.id} className="flex flex-col gap-2 border border-line-soft p-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">{item.fullName}</p><p className="text-xs text-ink-muted">{item.email} · invited, {item.access ? CLIENT_ACCESS_LABELS[item.access].name.toLowerCase() : ""} access</p></div>
            <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={revoke.isPending} onClick={() => revoke.mutate({ invitationId: item.id })}>Cancel the invitation</Button>
          </li>
        ))}
      </ul>
      {free && (
        <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); invite.mutate({ fullName, email, access }); }}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="seat-name">Their name</label><input id="seat-name" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={fullName} onChange={event => setFullName(event.target.value)} /></div>
            <div><label className="block text-xs font-semibold text-ink-muted" htmlFor="seat-email">Their email</label><input id="seat-email" type="email" className="w-full border border-line bg-white px-2 py-1.5 text-sm" value={email} onChange={event => setEmail(event.target.value)} /></div>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-ink-muted">What they can see</legend>
            {CLIENT_ACCESS_LEVELS.map(level => (
              <label key={level} className="flex items-start gap-2 text-sm">
                <input type="radio" name="seat-access" value={level} checked={access === level} onChange={() => setAccess(level)} className="mt-1" />
                <span><strong>{CLIENT_ACCESS_LABELS[level].name}.</strong> {CLIENT_ACCESS_LABELS[level].detail}</span>
              </label>
            ))}
          </fieldset>
          <Button type="submit" size="sm" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white" disabled={invite.isPending || !fullName.trim() || !email.trim()}>Invite</Button>
        </form>
      )}
      {link && <p role="status" className="mt-3 break-all border border-brand-line bg-brand-tint p-3 text-xs">Send them this link yourself (it works once): {link}</p>}
    </section>
  );
}
