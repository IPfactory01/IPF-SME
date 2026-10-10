import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import React, { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { ClickableRow, RecordDrawer, TD, TH } from "./AdminPrimitives";
import EngagementDetail from "./EngagementDetail";
import { formatDate, formatDateTime } from "./format";

type Row = inferRouterOutputs<AppRouter>["engagement"]["staff"]["list"]["items"][number];

/**
 * Every engagement this person may see: the desk lead and the Super Admin see all; analysts, partners and specialists
 * see the ones they are on. The server decides the list; this only shows it.
 */
export default function EngagementsView() {
  const list = trpc.engagement.staff.list.useQuery(undefined, { retry: false });
  const awaiting = trpc.engagement.staff.awaitingStart.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const start = trpc.engagement.staff.start.useMutation({
    onSuccess: result => {
      void utils.engagement.staff.list.invalidate();
      void utils.engagement.staff.awaitingStart.invalidate();
      toast.success("Engagement started.");
      setOpenId(result.engagementId);
    },
    onError: error => toast.error(error.message),
  });
  const [openId, setOpenId] = useState<number | null>(null);
  const open = list.data?.items.find(item => item.id === openId) ?? null;

  if (list.error) return <p role="alert" className="p-6 text-sm text-danger">{list.error.message}</p>;
  if (list.data && !list.data.setUp) {
    return <p role="note" className="m-6 border border-line bg-white p-4 text-sm text-ink-muted">The engagement room is not set up in the database yet. It starts working once migration 0008 is applied.</p>;
  }
  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-ink-muted">An engagement starts when the Current State Assessment is paid. Open one to name the team, book the calls, send what you need from the client and share what you found.</p>
      {awaiting.data && awaiting.data.length > 0 && (
        <section aria-labelledby="awaiting-start" className="space-y-2 border border-danger-line bg-danger-tint p-4">
          <h2 id="awaiting-start" className="text-sm font-semibold text-danger">Paid, but no engagement yet</h2>
          <p className="text-xs text-ink">These Current State Assessments were paid before the room was set up, or the start failed. Start each one: it gets the usual requests and calls, and joins the client's account if they have one.</p>
          <ul className="space-y-1">
            {awaiting.data.map(item => (
              <li key={item.businessCheckId} className="flex flex-wrap items-center justify-between gap-2 border-t border-danger-line pt-2 text-sm">
                <span><span className="font-medium">{item.businessName || item.fullName}</span> <span className="text-ink-muted">· {item.fullName} · paid {formatDate(item.confirmedAt)}</span></span>
                <Button type="button" size="sm" className="rounded-none bg-brand text-xs text-white" disabled={start.isPending} onClick={() => start.mutate({ businessCheckId: item.businessCheckId })}>Start engagement</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {list.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <div className="overflow-x-auto border border-line bg-white">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className={TH}>Business</th><th className={TH}>Stage</th><th className={TH}>Team</th><th className={TH}>From the client</th><th className={TH}>Next call</th></tr></thead>
            <tbody>
              {list.data?.items.map(row => (
                <ClickableRow key={row.id} onOpen={() => setOpenId(row.id)} selected={row.id === openId}>
                  <td className={TD}><span className="block font-medium">{row.businessName}</span><span className="block text-xs text-ink-muted">{row.ownerName}{row.hasAccount ? "" : " · no account yet"}</span></td>
                  <td className={TD}>{row.stageLabel}</td>
                  <td className={TD}>{row.team.length ? row.team.map(member => `${member.name} (${member.roleLabel})`).join(", ") : <span className="text-danger">No one yet</span>}</td>
                  <td className={TD}>{waitingOn(row)}</td>
                  <td className={TD}>{row.nextSession ? <><span className="block">{row.nextSession.title}</span><span className="block text-xs text-ink-muted">{formatDateTime(row.nextSession.scheduledFor)}</span></> : row.unscheduledSessions ? <span className="text-danger">{row.unscheduledSessions} not booked</span> : "-"}</td>
                </ClickableRow>
              ))}
              {list.data?.items.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-sm text-ink-muted">No engagements yet. One starts when a Current State Assessment payment is confirmed.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <RecordDrawer open={open !== null} onOpenChange={value => !value && setOpenId(null)} title={open?.businessName ?? ""} description={open ? `${open.stageLabel} · ${open.ownerName}` : ""}>
        {open && <EngagementDetail engagementId={open.id} />}
      </RecordDrawer>
    </div>
  );
}

function waitingOn(row: Row) {
  if (!row.openClientRequests) return "Nothing outstanding";
  return (
    <>
      <span className="block">{row.openClientRequests} to send</span>
      {row.overdueClientRequests ? <span className="block text-xs text-danger">{row.overdueClientRequests} overdue</span> : null}
    </>
  );
}
