import React, { useState } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { lagosDay } from "@shared/agreement";
import { TURNAROUND_HOURS, TURNAROUND_LABELS, UPLOAD_ACCEPT, type EngagementTaskTurnaround } from "@shared/engagement";
import { clockText, dayInWords, earliestRequestDue, followUpOf, REQUEST_BRIEF_MAX, REQUEST_TITLE_MAX, requestDueOn, TASK_COMMENT_MAX } from "@shared/requests";
import { firstNameOf } from "@shared/whatsapp";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../../server/routers";
import { formatDateTime } from "./format";

type Detail = inferRouterOutputs<AppRouter>["engagement"]["staff"]["detail"];
type Task = Detail["tasks"][number];

const FIELD = "w-full border border-line bg-white px-2 py-1.5 text-sm text-ink";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SMALL_BUTTON = "rounded-none text-xs";

function useRefresh(engagementId: number) {
  const utils = trpc.useUtils();
  return () => {
    void utils.engagement.staff.detail.invalidate({ engagementId });
    void utils.engagement.staff.list.invalidate();
  };
}

/**
 * Ask {business} (R78): what you need, a brief with a document if there is one, and the day it is due. The day follows
 * the agreed rhythm (the next Thursday at least two days away, never sooner than two days). One request a week each,
 * unless you approve on the engagement. The server checks all of it again.
 */
export function AskClient({ data, engagementId, onDone }: { data: Detail; engagementId: number; onDone: () => void }) {
  const refresh = useRefresh(engagementId);
  const today = lagosDay();
  const earliest = earliestRequestDue(today);
  const business = data.businessName || "the client";
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [dueOn, setDueOn] = useState(requestDueOn(today));
  const [turnaround, setTurnaround] = useState<EngagementTaskTurnaround | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = trpc.engagement.staff.askClient.useMutation();
  const request = trpc.engagement.staff.requestUpload.useMutation();
  const confirm = trpc.engagement.staff.confirmUpload.useMutation();
  const limited = !data.ask.unlimited && data.ask.thisWeek !== null;
  const send = async () => {
    setBusy(true);
    try {
      const result = await ask.mutateAsync({ engagementId, title, brief: brief.trim() || null, dueOn, turnaround: turnaround || null });
      if (file) {
        try {
          const target = { kind: "task" as const, id: result.taskId };
          const meta = { fileName: file.name, contentType: file.type, sizeBytes: file.size };
          const ticket = await request.mutateAsync({ engagementId, target, ...meta });
          const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
          if (!put.ok) throw new Error("The upload did not finish.");
          await confirm.mutateAsync({ engagementId, target, storageKey: ticket.storageKey, audience: "business", ...meta });
        } catch (error) {
          toast.error(`The request is sent, but the document did not attach: ${error instanceof Error ? error.message : "try again"}. Attach it on the item.`);
        }
      }
      toast.success(result.emailed ? `Sent. ${business} is emailed.` : `Saved. ${business} has no account yet, so nobody was emailed; it shows in their room once they have one.`);
      refresh();
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The request was not sent.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 border border-brand-line bg-paper-raised p-3" role="group" aria-label={`Ask ${business}`}>
      <p className="text-sm font-semibold text-ink">Ask {business}</p>
      <p className="text-xs text-ink-muted">{business} is emailed and sees it in their room, with your name. Their messages about it, and what they send, come to you.</p>
      <label className={LABEL} htmlFor="ask-title">What you need</label>
      <input id="ask-title" className={FIELD} maxLength={REQUEST_TITLE_MAX} placeholder="A video of the new menu being made" value={title} onChange={event => setTitle(event.target.value)} />
      <label className={LABEL} htmlFor="ask-brief">The brief</label>
      <textarea id="ask-brief" className={FIELD} rows={3} maxLength={REQUEST_BRIEF_MAX} placeholder="What, why and how: what to film or send, how long, what to avoid." value={brief} onChange={event => setBrief(event.target.value)} />
      {data.uploadsEnabled && (
        <div>
          <label className={LABEL} htmlFor="ask-file">A document with it (optional)</label>
          <input id="ask-file" type="file" accept={UPLOAD_ACCEPT} className="text-xs" onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="ask-due">Due</label>
          <input id="ask-due" type="date" className={FIELD} min={earliest} value={dueOn} onChange={event => setDueOn(event.target.value)} />
          <p className="mt-1 text-xs text-ink-muted">The next Thursday at least two days away, unless you choose a later day. Never sooner than {dayInWords(earliest)}.</p>
        </div>
        {data.engagement.type === "digital_marketing" && (
          <div>
            <label className={LABEL} htmlFor="ask-turnaround">When it arrives</label>
            <select id="ask-turnaround" className={FIELD} value={turnaround} onChange={event => setTurnaround(event.target.value as EngagementTaskTurnaround | "")}>
              <option value="">Nothing to send back</option>
              <option value="first_edit">{TURNAROUND_LABELS.first_edit} within {TURNAROUND_HOURS.first_edit} hours (footage)</option>
              <option value="first_draft">{TURNAROUND_LABELS.first_draft} within {TURNAROUND_HOURS.first_draft} hours (a carousel or text)</option>
            </select>
          </div>
        )}
      </div>
      {!data.ask.unlimited && (
        <p className={`text-xs ${limited ? "text-danger" : "text-ink-muted"}`}>
          {limited ? `You have asked ${business} once this week already ("${data.ask.thisWeek!.title}"). Add anything more to its conversation, or ask the engagement's lead to send it.` : "One request a week each: put everything you need this week into it."}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={busy || limited || !title.trim() || !dueOn || dueOn < earliest} onClick={() => void send()}>{busy ? "Sending…" : `Send to ${business}`}</Button>
        <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** Where an item's clock stands, for the team: due when and how long is left, late, or shared. */
function Clock({ task, now, onShare, sharing }: { task: Task; now: number; onShare: (() => void) | null; sharing: boolean }) {
  const clock = followUpOf(task, now);
  if (!clock) return null;
  if (clock.state === "shared") return <p className="text-xs text-health-clear-strong">{clock.label} shared {formatDateTime(clock.doneAt)}</p>;
  if (clock.state === "waiting") return <p className="text-xs text-ink-muted">{clock.label} within {clock.hours} hours of it arriving</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={`text-xs font-semibold ${clock.state === "late" ? "text-danger" : "text-ink"}`} role="status">
        {clock.label} due {formatDateTime(clock.dueAt)} · {clockText(clock.hoursLeft!)}
      </p>
      {onShare && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={sharing} onClick={onShare}>{sharing ? "Saving…" : `${clock.label} shared`}</Button>}
    </div>
  );
}

/**
 * On each of the client's items (R78): who asked and whom it goes to, its clock, and its conversation with the client,
 * where the person it goes to, or anyone who works on the engagement, writes back. The client is emailed each message.
 */
/**
 * A message box that offers the engagement's people when "@" is typed (R86): picking one writes "@Full Name", which
 * the server reads to email them and put the item on their Today.
 */
export function MentionBox({ id, value, onChange, people, placeholder, label }: { id: string; value: string; onChange: (text: string) => void; people: { name: string }[]; placeholder: string; label: string }) {
  const typed = /(^|\s)@([^\s@]*)$/.exec(value);
  const query = typed ? typed[2]!.toLowerCase() : null;
  // A name is offered from the start of any of its words: "@le" offers Lewis, not Miracle.
  const offered = query === null ? [] : people.filter(person => person.name && person.name.toLowerCase().split(/\s+/).some(word => word.startsWith(query))).slice(0, 6);
  return (
    <div className="space-y-1">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <textarea id={id} className={FIELD} rows={2} maxLength={TASK_COMMENT_MAX} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />
      {offered.length > 0 && (
        <ul aria-label="Tag someone" className="flex flex-wrap gap-1">
          {offered.map(person => <li key={person.name}><button type="button" className="rounded-full border border-line-soft bg-white px-2 py-0.5 text-xs text-ink" onClick={() => onChange(`${value.replace(/@[^\s@]*$/, "")}@${person.name} `)}>@{person.name}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * A team item's own panel (R86): its messages inside IP Factory (tag a colleague with @), a link, and Ready for review
 * for the person it is for. Files are attached above it, in the item's form.
 */
function TeamItemConversation({ task, engagementId, people }: { task: Task; engagementId: number; people: { name: string }[] }) {
  const refresh = useRefresh(engagementId);
  const [body, setBody] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const write = trpc.engagement.staff.taskComment.useMutation({ onSuccess: result => { setBody(""); setLink(null); refresh(); toast.success(result.mentioned ? `Sent. ${result.mentioned === 1 ? "The person you tagged is" : "The people you tagged are"} emailed.` : "Sent."); }, onError: error => toast.error(error.message) });
  const handIn = trpc.engagement.staff.handIn.useMutation({ onSuccess: () => { refresh(); toast.success("Handed in. The lead is emailed to review it."); }, onError: error => toast.error(error.message) });
  const validLink = link !== null && /^https:\/\/\S+$/i.test(link.trim());
  return (
    <div className="space-y-2 border-t border-line-soft pt-2">
      <p className="text-xs font-semibold text-ink">Messages ({task.comments.length}) <span className="font-normal text-ink-muted">· inside IP Factory; the client never sees them</span></p>
      <ul className="space-y-1.5">
        {task.comments.map(comment => (
          <li key={comment.id} className="border-l-2 border-line pl-2 text-sm">
            <p className="text-xs text-ink-muted">{comment.authorName || "IP Factory"} · {formatDateTime(comment.createdAt)}</p>
            <p className="whitespace-pre-line break-words text-ink">{comment.body}</p>
          </li>
        ))}
      </ul>
      {task.canAnswer && (
        <>
          <MentionBox id={`note-${task.id}`} value={body} onChange={setBody} people={people} label={`Write on ${task.title}`} placeholder="Write a note. Type @ to tag a colleague." />
          {link !== null && (
            <div className="space-y-1">
              <label className={LABEL} htmlFor={`link-${task.id}`}>Link to the work</label>
              <input id={`link-${task.id}`} className={FIELD} placeholder="https://…" value={link} onChange={event => setLink(event.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={write.isPending || (!body.trim() && !validLink)}
              onClick={() => write.mutate({ taskId: task.id, body: [validLink ? `Link: ${link!.trim()}` : "", body.trim()].filter(Boolean).join("\n") })}>{write.isPending ? "Sending…" : "Send"}</Button>
            {link === null && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} onClick={() => setLink("")}>Send a link</Button>}
            {task.canHandIn && <Button type="button" size="sm" variant="outline" className={SMALL_BUTTON} disabled={handIn.isPending} onClick={() => handIn.mutate({ taskId: task.id })}>{handIn.isPending ? "Handing in…" : "Ready for review"}</Button>}
          </div>
        </>
      )}
      {task.side === "ipf" && task.status === "received" && <p className="text-xs text-brand">Handed in: waiting for the lead to review it.</p>}
    </div>
  );
}

export function ItemConversation({ task, engagementId, people = [], now = Date.now() }: { task: Task; engagementId: number; people?: { name: string }[]; now?: number }) {
  const refresh = useRefresh(engagementId);
  const [open, setOpen] = useState(task.comments.length > 0 && task.comments[task.comments.length - 1]!.fromClient);
  const [body, setBody] = useState("");
  const write = trpc.engagement.staff.taskComment.useMutation({ onSuccess: result => { setBody(""); refresh(); toast.success(result.emailed ? "Sent. The client is emailed." : "Saved."); }, onError: error => toast.error(error.message) });
  const share = trpc.engagement.staff.followUpShared.useMutation({ onSuccess: result => { refresh(); toast.success(result.emailed ? "Shared. The client is emailed that it is ready for their approval." : "Recorded as shared."); }, onError: error => toast.error(error.message) });
  if (task.side !== "client") return <TeamItemConversation task={task} engagementId={engagementId} people={people} />;
  const goesTo = task.goesTo?.name ? firstNameOf(task.goesTo.name) : null;
  return (
    <div className="space-y-2 border-t border-line-soft pt-2">
      <p className="text-xs text-ink-muted">
        {task.askedByName !== null ? `Asked by ${task.askedByName || "a team member"}. ` : ""}
        {goesTo ? `The client's messages and what they send go to ${goesTo}.` : "The client's messages go to the office until someone is on the engagement."}
      </p>
      <Clock task={task} now={now} sharing={share.isPending} onShare={task.canAnswer ? () => share.mutate({ taskId: task.id }) : null} />
      <button type="button" className="text-xs font-semibold text-brand underline underline-offset-2" aria-expanded={open} onClick={() => setOpen(!open)}>
        Conversation with the client ({task.comments.length})
      </button>
      {open && (
        <div className="space-y-2">
          {task.comments.length === 0 && <p className="text-xs text-ink-muted">No messages yet. The client sees what you write here.</p>}
          <ul className="space-y-1.5">
            {task.comments.map(comment => (
              <li key={comment.id} className={`border-l-2 pl-2 text-sm ${comment.fromClient ? "border-brand" : "border-line"}`}>
                <p className="text-xs text-ink-muted">{comment.authorName || (comment.fromClient ? "The client" : "IP Factory")}{comment.fromClient ? " (client)" : ""} · {formatDateTime(comment.createdAt)}</p>
                <p className="whitespace-pre-line text-ink">{comment.body}</p>
              </li>
            ))}
          </ul>
          {task.canAnswer ? (
            <div className="space-y-1">
              <MentionBox id={`reply-${task.id}`} value={body} onChange={setBody} people={people} label={`Write to the client about ${task.title}`} placeholder="Write to the client. They are emailed. Type @ to tag a colleague." />
              <Button type="button" size="sm" className={`${SMALL_BUTTON} bg-brand text-white`} disabled={write.isPending || !body.trim()} onClick={() => write.mutate({ taskId: task.id, body })}>{write.isPending ? "Sending…" : "Send"}</Button>
            </div>
          ) : <p className="text-xs text-ink-muted">{goesTo ? `${goesTo} or the lead answers here.` : "The lead answers here."}</p>}
        </div>
      )}
    </div>
  );
}
