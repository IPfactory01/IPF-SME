import React from "react";
import { formatDate } from "./format";

type Hold = { state: "late" | "paused"; pausesOn: string } | null | undefined;

/** Late, then Paused seven days after a missed fee date (D6): the state for the team, never the amount. */
export default function FeeHoldBadge({ hold }: { hold: Hold }) {
  if (!hold) return null;
  const on = formatDate(`${hold.pausesOn}T12:00:00Z`);
  return hold.state === "paused"
    ? <span title={`Work paused on ${on}, seven days after a missed fee date`} className="ml-1.5 inline-block rounded-full bg-health-stuck-tint px-2 py-0.5 text-xs font-semibold text-health-stuck">Paused</span>
    : <span title={`A fee is late; work pauses on ${on}`} className="ml-1.5 inline-block rounded-full bg-health-watch-tint px-2 py-0.5 text-xs font-semibold text-health-watch-strong">Fee late</span>;
}

/** On the record: what the hold means and what lifts it. */
export function FeeHoldNote({ hold }: { hold: Hold }) {
  if (!hold) return null;
  const on = formatDate(`${hold.pausesOn}T12:00:00Z`);
  return (
    <p role="status" className={`rounded-lg border p-3 text-sm ${hold.state === "paused" ? "border-health-stuck bg-health-stuck-tint" : "border-health-watch bg-health-watch-tint"}`}>
      {hold.state === "paused"
        ? `Work is paused: a fee is more than seven days late (since ${on}). Paying it, or a new date in Fees, lifts the pause. The client's room stays open.`
        : `A fee is late. Work pauses on ${on} unless it is paid or given a new date in Fees.`}
    </p>
  );
}
