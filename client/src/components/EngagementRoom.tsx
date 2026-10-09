import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { OPEN_TASK_STATUSES } from "@shared/engagement";
import type { inferRouterOutputs } from "@trpc/server";
import { CalendarClock, Check, CircleDot, Circle } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Task = Room["tasks"][number];
type Deliverable = Room["deliverables"][number];

const lagos = (value: Date | string | null | undefined, withTime = true) =>
  value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}) }).format(new Date(value)) : "";
const dueText = (dueOn: string | null) => (dueOn ? `By ${lagos(`${dueOn}T12:00:00Z`, false)}` : "");

const CARD = "border border-line-soft bg-white p-5 shadow-sm";
const KICKER = "text-xs font-semibold uppercase tracking-widest text-ink-muted";

/**
 * The client's engagement room: where we are, what we need from you, what we have found. Everything shown here was
 * filtered on the server for this person; this screen decides nothing about access.
 */
export default function EngagementRoom({ room }: { room: Room }) {
  const open = room.tasks.filter(task => task.side === "client" && OPEN_TASK_STATUSES.includes(task.status));
  const withUs = room.tasks.filter(task => task.side === "client" && !OPEN_TASK_STATUSES.includes(task.status));
  const ours = room.tasks.filter(task => task.side === "ipf" && OPEN_TASK_STATUSES.includes(task.status));
  const sharedNotes = room.sessions.filter(session => session.notes);
  const isOwner = room.viewer.kind === "owner";
  return (
    <div className="space-y-5">
      <section aria-labelledby="where-are-we" className={CARD}>
        <p className={KICKER}>Where are we?</p>
        <h2 id="where-are-we" className="mt-1 font-serif text-2xl font-bold tracking-tight">{room.stageLabel}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4" aria-label="Your journey">
          {room.journey.map(step => (
            <li key={step.stage} aria-current={step.state === "current" ? "step" : undefined} className={`border-t-2 pt-2 text-sm ${step.state === "current" ? "border-brand" : step.state === "done" ? "border-brand-line-strong" : "border-line"}`}>
              <span className="flex items-center gap-1.5 font-semibold">
                {step.state === "done" ? <Check className="h-4 w-4 text-brand" aria-hidden /> : step.state === "current" ? <CircleDot className="h-4 w-4 text-brand" aria-hidden /> : <Circle className="h-4 w-4 text-ink-faint" aria-hidden />}
                {step.label}
              </span>
              {step.state === "current" && <span className="mt-1 block text-ink-muted">{step.summary}</span>}
            </li>
          ))}
        </ol>
        {room.nextSession ? (
          <div className="mt-5 flex flex-col gap-2 border border-brand-line bg-brand-tint p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-5 w-5 text-brand" aria-hidden />
              <div><p className="font-semibold">Next: {room.nextSession.title}</p><p className="text-sm text-ink-muted">{lagos(room.nextSession.scheduledFor)} (Lagos time){room.nextSession.durationMinutes ? `, ${room.nextSession.durationMinutes} minutes` : ""}</p></div>
            </div>
            {room.nextSession.meetingLink && <Button asChild size="sm" className="rounded-none bg-brand text-xs uppercase tracking-wider text-white"><a href={room.nextSession.meetingLink} target="_blank" rel="noreferrer">Join the call</a></Button>}
          </div>
        ) : (
          <p className="mt-5 text-sm text-ink-muted">We will book your next call with you and it will show here.</p>
        )}
        <div className="mt-5">
          <p className={KICKER}>Your team</p>
          {room.team.length ? <ul className="mt-1 text-sm">{room.team.map(member => <li key={`${member.name}-${member.roleLabel}`}>{member.name} <span className="text-ink-muted">· {member.roleLabel}</span></li>)}</ul> : <p className="mt-1 text-sm text-ink-muted">We are naming your team now.</p>}
        </div>
      </section>

      <section aria-labelledby="what-we-need" className={CARD}>
        <p className={KICKER}>What we need from you</p>
        <h2 id="what-we-need" className="mt-1 font-serif text-xl font-bold tracking-tight">{open.length ? `${open.length} thing${open.length === 1 ? "" : "s"} to send` : "Nothing outstanding"}</h2>
        {open.length > 0 && <p className="mt-1 text-sm text-ink-muted">Send each one on WhatsApp or by email, then tell us here. Estimates are fine.</p>}
        <ul className="mt-4 space-y-3">{open.map(task => <OpenTask key={task.id} task={task} />)}</ul>
        {withUs.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-brand">Already with us ({withUs.length})</summary>
            <ul className="mt-2 space-y-1">{withUs.map(task => <li key={task.id} className="flex justify-between gap-3 border-b border-line-soft py-1"><span>{task.title}</span><span className="text-ink-muted">{task.statusLabel}</span></li>)}</ul>
          </details>
        )}
        {ours.length > 0 && (
          <div className="mt-4">
            <p className={KICKER}>What we owe you</p>
            <ul className="mt-1 space-y-1 text-sm">{ours.map(task => <li key={task.id} className="flex justify-between gap-3"><span>{task.title}</span><span className="text-ink-muted">{dueText(task.dueOn)}</span></li>)}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby="what-we-found" className={CARD}>
        <p className={KICKER}>What we have found</p>
        <h2 id="what-we-found" className="mt-1 font-serif text-xl font-bold tracking-tight">{room.deliverables.length || sharedNotes.length ? "Shared with you" : "Nothing shared yet"}</h2>
        {!room.deliverables.length && !sharedNotes.length && <p className="mt-1 text-sm text-ink-muted">Notes from each call reach you the same day. Findings follow the second call.</p>}
        {room.problemStatement && <div className="mt-4 border-l-2 border-brand pl-3"><p className={KICKER}>The one problem we are fixing</p><p className="mt-1 text-sm">{room.problemStatement}</p></div>}
        <ul className="mt-4 space-y-4">{room.deliverables.map(item => <DeliverableItem key={item.id} item={item} isOwner={isOwner} />)}</ul>
        {sharedNotes.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className={KICKER}>Notes from our calls</p>
            {sharedNotes.map(session => (
              <article key={session.id} className="border border-line-soft p-3">
                <h3 className="text-sm font-semibold">{session.title}</h3>
                <p className="text-xs text-ink-muted">{lagos(session.scheduledFor ?? session.notesSharedAt)}{isOwner && session.notesAudience === "owner" ? " · only you can see these" : ""}</p>
                <p className="mt-2 whitespace-pre-line text-sm">{session.notes}</p>
                {isOwner && <AudienceToggle item="notes" id={session.id} audience={session.notesAudience ?? "owner"} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function useRoomRefresh() {
  const utils = trpc.useUtils();
  return { onSuccess: () => void utils.engagement.client.room.invalidate(), onError: (error: { message: string }) => toast.error(error.message) };
}

function OpenTask({ task }: { task: Task }) {
  const refresh = useRoomRefresh();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const respond = trpc.engagement.client.respondToTask.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success(task.kind === "data_request" ? "Thank you. We will check it and tell you if we need more." : "Marked as done."); } });
  return (
    <li className="border border-line-soft p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">{task.title}{task.mine ? <span className="ml-2 text-xs font-normal text-brand">for you</span> : null}</p>
          {task.detail && <p className="text-sm text-ink-muted">{task.detail}</p>}
          {task.status === "needs_more" && task.statusNote && <p className="mt-1 text-sm text-danger">We need a bit more: {task.statusNote}</p>}
        </div>
        <span className="whitespace-nowrap text-xs text-ink-muted">{dueText(task.dueOn)}</span>
      </div>
      {asking ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input aria-label={`How you sent ${task.title}`} className="w-full border border-line bg-white px-2 py-1.5 text-sm" placeholder={task.kind === "data_request" ? "How you sent it, e.g. on WhatsApp (optional)" : "Anything we should know (optional)"} value={note} maxLength={500} onChange={event => setNote(event.target.value)} />
          <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={respond.isPending} onClick={() => respond.mutate({ taskId: task.id, note })}>Confirm</Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="mt-2 rounded-none text-xs" onClick={() => setAsking(true)}>{task.kind === "data_request" ? "I have sent this" : "Mark as done"}</Button>
      )}
    </li>
  );
}

function DeliverableItem({ item, isOwner }: { item: Deliverable; isOwner: boolean }) {
  const refresh = useRoomRefresh();
  const [comment, setComment] = useState("");
  const accept = trpc.engagement.client.accept.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); toast.success("Signed off. Thank you."); } });
  const addComment = trpc.engagement.client.comment.useMutation({ ...refresh, onSuccess: () => { refresh.onSuccess(); setComment(""); } });
  return (
    <li className="border border-line-soft p-3">
      <p className={KICKER}>{item.kindLabel}</p>
      <h3 className="font-semibold">{item.title}</h3>
      <p className="text-xs text-ink-muted">Shared {lagos(item.sharedAt, false)}{isOwner && item.audience === "owner" ? " · only you can see this" : ""}</p>
      {item.summary && <p className="mt-2 whitespace-pre-line text-sm">{item.summary}</p>}
      {item.comments.length > 0 && <ul className="mt-3 space-y-1 border-t border-line-soft pt-2">{item.comments.map((entry, index) => <li key={index} className="text-sm"><span className="font-medium">{entry.authorName}</span>: {entry.body}</li>)}</ul>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input aria-label={`Your comment on ${item.title}`} className="w-full border border-line bg-white px-2 py-1.5 text-sm" placeholder="Ask a question or add a comment" value={comment} maxLength={4000} onChange={event => setComment(event.target.value)} />
        <Button type="button" size="sm" variant="outline" className="rounded-none text-xs" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ deliverableId: item.id, body: comment })}>Send</Button>
      </div>
      {isOwner && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {item.accepted ? <span className="text-sm font-semibold text-brand">Signed off</span> : <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={accept.isPending} onClick={() => accept.mutate({ deliverableId: item.id })}>Sign this off</Button>}
          <AudienceToggle item="deliverable" id={item.id} audience={item.audience} />
        </div>
      )}
    </li>
  );
}

/** Only the owner decides whether their staff see an item. */
function AudienceToggle({ item, id, audience }: { item: "notes" | "deliverable"; id: number; audience: "owner" | "business" | "team" }) {
  const refresh = useRoomRefresh();
  const set = trpc.engagement.client.setAudience.useMutation(refresh);
  const shared = audience === "business";
  return (
    <button type="button" className="text-xs font-semibold text-brand underline underline-offset-2" disabled={set.isPending} onClick={() => set.mutate({ item, id, audience: shared ? "owner" : "business" })}>
      {shared ? "Keep this to myself" : "Share with my team"}
    </button>
  );
}
