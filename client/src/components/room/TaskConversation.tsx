import React, { useState } from "react";
import Linked from "./Linked";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import { UploadCloud } from "lucide-react";
import { UPLOAD_ACCEPT } from "@shared/engagement";
import { followUpOf, TASK_COMMENT_MAX, type FollowUp } from "@shared/requests";
import { firstNameOf } from "@shared/whatsapp";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useRoomPreview } from "./RoomPreview";
import type { AppRouter } from "../../../../server/routers";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Task = Room["tasks"][number];

const lagos = (value: Date | string | null) =>
  value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)) : "";

/** When what comes back follows, as the client reads it. */
function clockLine(clock: FollowUp) {
  const what = clock.label.toLowerCase();
  if (clock.state === "shared") return `Your ${what} was shared on ${lagos(clock.doneAt)}. It waits for your approval in Content.`;
  if (clock.state === "waiting") return `Once it arrives, we send you the ${what} within ${clock.hours} hours.`;
  return `We have it. Your ${what} by ${lagos(clock.dueAt)}.`;
}

/** Who asked for an item (R78), and when the First edit follows once it arrives. */
export function RequestFacts({ task, now }: { task: Task; now: number }) {
  const clock = followUpOf(task, now);
  if (!task.askedBy && !clock) return null;
  return (
    <div className="mt-2 space-y-1 text-sm">
      {task.askedBy && <p className="text-ink-600"><span className="text-ink-muted">Asked by </span>{firstNameOf(task.askedBy) || "your team"} at IP Factory</p>}
      {clock && <p className={clock.state === "shared" ? "text-health-clear-strong" : "text-ink-600"}>{clockLine(clock)}</p>}
    </div>
  );
}

/** A file sent straight onto a request (R78): photos, documents, voice notes. Videos come as a link. */
export function ItemUpload({ task }: { task: Task }) {
  const utils = trpc.useUtils();
  const request = trpc.engagement.client.requestUpload.useMutation();
  const confirm = trpc.engagement.client.confirmUpload.useMutation();
  const [busy, setBusy] = useState(false);
  if (useRoomPreview()) return null;
  const send = async (file: File) => {
    setBusy(true);
    try {
      const meta = { fileName: file.name, contentType: file.type, sizeBytes: file.size };
      const ticket = await request.mutateAsync({ taskId: task.id, ...meta });
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
      if (!put.ok) throw new Error("The upload did not finish. Check your connection and try again.");
      await confirm.mutateAsync({ taskId: task.id, storageKey: ticket.storageKey, note: null, ...meta });
      void utils.engagement.client.room.invalidate();
      toast.success(`${file.name} sent.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The upload did not finish.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs font-medium text-brand underline underline-offset-2 ${busy ? "opacity-60" : ""}`}>
      <UploadCloud className="h-3.5 w-3.5" aria-hidden />{busy ? "Uploading…" : "Upload files"}
      <input type="file" className="sr-only" accept={UPLOAD_ACCEPT} disabled={busy} aria-label={`Upload files for ${task.title}`} multiple onChange={event => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; void (async () => { for (const file of picked) await send(file); })(); }} />
    </label>
  );
}

/**
 * The conversation on an item the client is asked for (R78), both ways: what the client writes reaches the person who
 * asked (the Content Producer for footage, else the main contact), by email; what the team writes reaches the owner.
 */
export function TaskConversation({ task }: { task: Task }) {
  const preview = useRoomPreview();
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const who = task.writeTo ? firstNameOf(task.writeTo) || "your team" : "your team";
  const write = trpc.engagement.client.taskComment.useMutation({
    onSuccess: () => { setBody(""); void utils.engagement.client.room.invalidate(); toast.success(`Sent to ${who}.`); },
    onError: error => toast.error(error.message),
  });
  if (task.side !== "client") return null;
  return (
    <section aria-label={`Messages about ${task.title}`} className="mt-3 space-y-2 border-t border-line-soft pt-3">
      <h4 className="font-sans text-xs font-semibold text-ink-muted">Messages{task.comments.length ? ` (${task.comments.length})` : ""}</h4>
      {task.comments.length > 0 && (
        <ul className="space-y-2">
          {task.comments.map(comment => (
            <li key={comment.id} className={`rounded-lg px-3 py-2 ${comment.fromTeam ? "bg-paper-sunken" : "bg-brand-tint"}`}>
              <p className="text-xs text-ink-muted">{comment.mine ? "You" : comment.fromTeam ? `${firstNameOf(comment.authorName) || "Your team"} at IP Factory` : comment.authorName || "Your business"} · {lagos(comment.createdAt)}</p>
              <p className="whitespace-pre-line break-words text-sm text-ink"><Linked text={comment.body} /></p>
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        task.comments.length === 0 && <p className="text-xs text-ink-muted">The client writes to {who} here. Switched off in the preview.</p>
      ) : (
        <div className="space-y-2">
          <label className="sr-only" htmlFor={`message-${task.id}`}>Write to {who} about {task.title}</label>
          <textarea id={`message-${task.id}`} rows={2} maxLength={TASK_COMMENT_MAX} className="min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" placeholder={`Write to ${who}: a question, or a note on what you sent`} value={body} onChange={event => setBody(event.target.value)} />
          <Button type="button" size="sm" className="min-h-11 rounded-lg bg-brand text-xs text-white" disabled={write.isPending || !body.trim()} onClick={() => write.mutate({ taskId: task.id, body })}>{write.isPending ? "Sending…" : `Send to ${who}`}</Button>
        </div>
      )}
    </section>
  );
}
