import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import React from "react";
import type { AppRouter } from "../../../../server/routers";
import { formatDateTime } from "./format";

type Item = inferRouterOutputs<AppRouter>["engagement"]["staff"]["today"][number];

const KIND_LABELS: Record<Item["kind"], string> = {
  reply: "Client wrote",
  clock: "Clock",
  check: "To check",
  request: "Your request",
  meeting: "Meeting",
  files: "Files",
  approval: "To approve",
  fee: "Fee",
};

/** How long is left on a clock, or how late it is, in hours. */
function hoursText(at: Date, now: number) {
  const hours = Math.round((at.getTime() - now) / 3_600_000);
  if (hours < 0) return `${-hours} ${hours === -1 ? "hour" : "hours"} late`;
  return hours < 1 ? "under an hour left" : `${hours} ${hours === 1 ? "hour" : "hours"} left`;
}

/**
 * Today (R52): one list of what needs this person across the engagements they are on, late first. Each card opens the
 * engagement. The server decides what is theirs; this only shows it.
 */
export default function Today({ onOpen, now = Date.now() }: { onOpen: (engagementId: number) => void; now?: number }) {
  const today = trpc.engagement.staff.today.useQuery(undefined);
  if (!today.data) return null;
  const items = today.data;
  return (
    <section aria-labelledby="today" className="space-y-2">
      <h2 id="today" className="text-sm font-semibold text-ink">Today <span className="font-normal text-ink-muted">({items.length})</span></h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-muted">Nothing needs you right now across your projects.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="What needs you">
          {items.map(item => <li key={item.key}><TodayCard item={item} now={now} onOpen={onOpen} /></li>)}
        </ul>
      )}
    </section>
  );
}

/** One thing that needs the person: its kind, the item, the business, and the time where it has one. Opens the engagement when given onOpen. */
export function TodayCard({ item, now, onOpen }: { item: Item; now: number; onOpen?: (engagementId: number) => void }) {
  const at = item.at ? new Date(item.at) : null;
  const when = item.kind === "clock" && at ? hoursText(at, now) : item.kind === "meeting" && at ? formatDateTime(at) : null;
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`font-semibold uppercase tracking-wide ${item.late ? "text-danger" : "text-brand"}`}>{KIND_LABELS[item.kind]}</span>
        {when && <span className={item.late ? "text-danger" : "text-ink-muted"}>{when}</span>}
      </span>
      <span className="mt-1 block font-medium text-ink">{item.title}</span>
      <span className="block text-xs text-ink-muted">{item.businessName}</span>
      <span className="mt-2 block border-t border-line-soft pt-2 text-xs text-ink-600">{item.detail}</span>
    </>
  );
  const frame = `block w-full rounded-xl border bg-white p-3 text-left ${item.late ? "border-danger-line" : "border-line"}`;
  if (!onOpen) return <div className={frame} aria-label={`${KIND_LABELS[item.kind]}: ${item.title}`} role="group">{body}</div>;
  return <button type="button" onClick={() => onOpen(item.engagementId)} aria-label={`${KIND_LABELS[item.kind]}: ${item.title}, ${item.businessName}`} className={`${frame} transition-colors hover:border-brand`}>{body}</button>;
}
