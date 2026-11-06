import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { CONTENT_COUNTED, CONTENT_KIND_LABELS, type ContentKind, type ContentStatus } from "@shared/engagementTypes";
import type { inferRouterOutputs } from "@trpc/server";
import { ExternalLink } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { useRoomPreview } from "./RoomPreview";

type Room = NonNullable<inferRouterOutputs<AppRouter>["engagement"]["client"]["room"]>;
type Item = Room["content"][number];

/** The board's columns, in the order work moves; what waits on the client comes first. */
const COLUMNS: { id: string; name: string; statuses: ContentStatus[] }[] = [
  { id: "approval", name: "For your approval", statuses: ["for_approval"] },
  { id: "progress", name: "In progress", statuses: ["planned", "in_edit", "changes_requested"] },
  { id: "approved", name: "Approved", statuses: ["approved"] },
  { id: "published", name: "Published", statuses: ["published"] },
];

const dateOnly = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00Z`));

/** This month's numbers against the programme: approved or published counts. */
export function contentCounts(items: Item[], targets: Room["contentTargets"], month: number) {
  return targets.map(target => {
    const kind = target.label.toLowerCase().replace(/s$/, "") as ContentKind;
    return { kind, label: target.label, target: target.count, done: items.filter(item => item.kind === kind && item.month === month && CONTENT_COUNTED.includes(item.status)).length };
  });
}

/**
 * The content board of a Digital marketing engagement: the month's reels, posts and stories by where they stand, with
 * the month's numbers on top. The client approves each piece, or asks for changes; nothing goes out without a yes.
 */
export default function ContentBoard({ room, currentMonth, months }: { room: Room; currentMonth: number; months: number }) {
  const [month, setMonth] = useState(currentMonth);
  const items = room.content.filter(item => item.month === month);
  const counts = contentCounts(room.content, room.contentTargets, month);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Month" className="inline-flex rounded-lg border border-line-soft bg-white p-0.5">
          {Array.from({ length: months }, (_, index) => index + 1).map(value => (
            <button key={value} type="button" aria-pressed={value === month} onClick={() => setMonth(value)} className={`rounded-md px-3 py-1 text-sm transition-colors ${value === month ? "bg-brand text-white" : "text-ink-600 hover:text-ink"}`}>Month {value}</button>
          ))}
        </div>
        <p className="text-xs text-ink-muted">Counted once you approve it</p>
      </div>
      <div className="grid grid-cols-3 gap-3" role="group" aria-label={`Month ${month} so far`}>
        {counts.map(count => (
          <div key={count.kind} className="rounded-xl border border-line-soft bg-white p-4">
            <p className="text-xs font-medium text-ink-muted">{count.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{count.done}<span className="text-base font-normal text-ink-muted">/{count.target}</span></p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chart-track"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (count.done / count.target) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
      {items.length === 0 ? <p className="text-sm text-ink-muted">Month {month}'s content appears here as your team plans it.</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map(column => {
            const list = items.filter(item => column.statuses.includes(item.status));
            return (
              <section key={column.id} aria-label={column.name} className="min-w-0 space-y-2">
                <h3 className="flex items-center justify-between font-sans text-xs font-semibold text-ink">{column.name}<span className="font-normal tabular-nums text-ink-muted">{list.length}</span></h3>
                {list.length ? list.map(item => <ContentCard key={item.id} item={item} />) : <p className="rounded-lg border border-dashed border-line-soft p-3 text-xs text-ink-muted">Nothing here</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContentCard({ item }: { item: Item }) {
  const preview = useRoomPreview();
  const utils = trpc.useUtils();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const respond = trpc.engagement.client.respondToContent.useMutation({
    onSuccess: result => { void utils.engagement.client.room.invalidate(); setAsking(false); setNote(""); toast.success(result.status === "approved" ? "Approved." : "Sent to your team."); },
    onError: error => toast.error(error.message),
  });
  return (
    <article aria-label={item.title} className={`space-y-2 rounded-xl border bg-white p-3 ${item.status === "for_approval" ? "border-brand-line" : "border-line-soft"}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="rounded-md bg-paper-sunken px-1.5 py-0.5 font-medium text-ink-600">{CONTENT_KIND_LABELS[item.kind]}</span>
        {item.dueOn && <span className="text-ink-muted">{dateOnly(item.dueOn)}</span>}
      </div>
      <p className="text-sm font-medium text-ink">{item.title}</p>
      {item.status === "changes_requested" && item.clientNote && <p className="text-xs text-ink-600"><span className="text-ink-muted">Your note: </span>{item.clientNote}</p>}
      {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand underline underline-offset-2">View<ExternalLink className="h-3 w-3" aria-hidden /></a>}
      {item.status === "for_approval" && !preview && (asking ? (
        <div className="space-y-2">
          <textarea aria-label={`What to change in ${item.title}`} rows={2} maxLength={1000} className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm" placeholder="What to change" value={note} onChange={event => setNote(event.target.value)} />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="rounded-lg bg-brand text-xs text-white" disabled={respond.isPending || !note.trim()} onClick={() => respond.mutate({ itemId: item.id, approve: false, note })}>Send</Button>
            <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" className="rounded-lg bg-brand text-xs text-white" disabled={respond.isPending} onClick={() => respond.mutate({ itemId: item.id, approve: true, note: null })}>Approve</Button>
          <Button type="button" size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => setAsking(true)}>Request changes</Button>
        </div>
      ))}
    </article>
  );
}
