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
  held: "Did it happen?",
  files: "Files",
  approval: "To approve",
  fee: "Fee",
  mention: "Mentioned",
  review: "To review",
  due: "Due",
};

/** How long is left on a clock, or how late it is, in hours. */
function hoursText(at: Date, now: number) {
  const hours = Math.round((at.getTime() - now) / 3_600_000);
  if (hours < 0) return `${-hours} ${hours === -1 ? "hour" : "hours"} late`;
  return hours < 1 ? "under an hour left" : `${hours} ${hours === 1 ? "hour" : "hours"} left`;
}

/** One row per thing that needs the person: an item with every reason it does, or a Session, a file, an approval or a fee. */
export type TodayRow = { key: string; engagementId: number; businessName: string; taskId: number | null; kinds: Item["kind"][]; title: string; details: string[]; at: Date | null; late: boolean; whenKind: Item["kind"] };

/**
 * The same item can need someone for several reasons at once (the client wrote, and sent it for checking): one row each,
 * with the reasons together, late first as the server ordered them (ET, 14 November 2026).
 */
export function groupToday(items: readonly Item[]): TodayRow[] {
  const rows = new Map<string, TodayRow>();
  for (const item of items) {
    const id = item.taskId !== null && item.taskId !== undefined ? `${item.engagementId}:task:${item.taskId}` : item.key;
    const row = rows.get(id);
    if (!row) { rows.set(id, { key: id, engagementId: item.engagementId, businessName: item.businessName, taskId: item.taskId ?? null, kinds: [item.kind], title: item.title, details: [item.detail], at: item.at ? new Date(item.at) : null, late: item.late, whenKind: item.kind }); continue; }
    if (!row.kinds.includes(item.kind)) row.kinds.push(item.kind);
    row.details.push(item.detail);
    row.late ||= item.late;
  }
  return Array.from(rows.values());
}

/**
 * Today (R52): one list of what needs this person across the engagements they are on, late first. Each row opens the
 * item in its engagement's Work Plan, or the engagement. The server decides what is theirs; this only shows it.
 */
export default function Today({ onOpen, now = Date.now() }: { onOpen: (engagementId: number, taskId: number | null, kind: Item["kind"]) => void; now?: number }) {
  const today = trpc.engagement.staff.today.useQuery(undefined);
  if (!today.data) return null;
  const rows = groupToday(today.data);
  return (
    <section aria-labelledby="today" className="space-y-2">
      <h2 id="today" className="text-sm font-semibold text-ink">Today <span className="font-normal text-ink-muted">({rows.length})</span></h2>
      {rows.length === 0
        ? <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-muted">Nothing needs you right now across your projects.</p>
        : <TodayList rows={rows} now={now} onOpen={onOpen} showBusiness />}
    </section>
  );
}

/** The rows as one compact list: the reasons, the item, the latest word on it, and the time; a tap opens the item. */
export function TodayList({ rows, now, onOpen, showBusiness = false }: { rows: readonly TodayRow[]; now: number; onOpen?: (engagementId: number, taskId: number | null, kind: Item["kind"]) => void; showBusiness?: boolean }) {
  return (
    <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line-soft bg-white" aria-label="What needs you">
      {rows.map(row => {
        const when = row.whenKind === "clock" && row.at ? hoursText(row.at, now) : (row.whenKind === "meeting" || row.whenKind === "held") && row.at ? formatDateTime(row.at) : null;
        const reasons = row.kinds.map(kind => KIND_LABELS[kind]).join(" · ");
        const body = (
          <>
            <span className="min-w-0 flex-1">
              <span className={`block text-[11px] font-semibold uppercase tracking-wide ${row.late ? "text-danger" : "text-brand"}`}>{reasons}</span>
              <span className="block truncate font-medium text-ink">{row.title}</span>
              <span className="block truncate text-xs text-ink-muted">{showBusiness ? `${row.businessName} · ` : ""}{row.details[0]}</span>
            </span>
            {when && <span className={`shrink-0 text-xs ${row.late ? "text-danger" : "text-ink-muted"}`}>{when}</span>}
          </>
        );
        const label = `${reasons}: ${row.title}${showBusiness ? `, ${row.businessName}` : ""}`;
        return (
          <li key={row.key}>
            {onOpen
              ? <button type="button" onClick={() => onOpen(row.engagementId, row.taskId, row.whenKind)} aria-label={label} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-paper-sunken">{body}</button>
              : <div role="group" aria-label={label} className="flex items-center gap-3 px-4 py-3 text-sm">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
