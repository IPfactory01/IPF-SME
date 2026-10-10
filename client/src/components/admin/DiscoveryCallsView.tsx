import { Input } from "@/components/ui/input";
import type { AdminSectionId } from "@/lib/adminSections";
import { trpc } from "@/lib/trpc";
import { FUNNEL_STATUS_LABELS, funnelStatus } from "@shared/businessCheck/funnelStatus";
import React, { useMemo, useState } from "react";
import { AdminMetricCard, ClickableRow, ProspectCell, RecordDrawer, RowButton, StatusBadge, TD, TH } from "./AdminPrimitives";
import DiscoveryCallDetail from "./DiscoveryCallDetail";
import { formatDate, formatTime } from "./format";

const STATUS_FILTERS = ["call_requested", "call_scheduled", "fit", "referred", "declined"] as const;

/**
 * People who asked for the free discovery call, as a compact list. Scheduling the call and recording its outcome happen
 * in the record drawer, so the table stays readable.
 */
export default function DiscoveryCallsView({ onOpenSection }: { onOpenSection: (section: AdminSectionId) => void }) {
  const calls = trpc.businessSupport.discoveryCalls.useQuery(undefined, { retry: false });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => (calls.data ?? []).map(row => ({ ...row, status: funnelStatus(row) })), [calls.data]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      return [row.fullName, row.businessName, row.email, row.whatsapp].some(value => value?.toLowerCase().includes(needle));
    });
  }, [rows, search, status]);
  const opened = rows.find(row => row.id === openId) ?? null;

  if (calls.error) return <p role="alert" className="p-6 text-sm text-rose-900">{calls.error.message}</p>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
        <AdminMetricCard label="Debrief requests" value={rows.length} />
        <AdminMetricCard label="No time yet" value={rows.filter(row => row.status === "call_requested").length} />
        <AdminMetricCard label="Booked" value={rows.filter(row => row.callScheduledFor).length} />
        <AdminMetricCard label="Opportunity" value={rows.filter(row => row.status === "fit").length} />
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input aria-label="Search Debriefs" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, business, email or WhatsApp" className="h-9 rounded-none sm:max-w-xs" />
        <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)} className="h-9 border border-line bg-white px-2 text-sm">
          <option value="all">All</option>
          {STATUS_FILTERS.map(item => <option key={item} value={item}>{FUNNEL_STATUS_LABELS[item].label}</option>)}
        </select>
        <span className="text-xs text-ink-muted sm:ml-auto">{visible.length} of {rows.length}</span>
      </div>

      {calls.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <div className="max-h-[68vh] overflow-y-auto border border-line bg-white">
          <table className="w-full table-fixed border-collapse">
            <thead className="sticky top-0 z-10 border-b border-line bg-paper">
              <tr>
                <th scope="col" className={`${TH} w-[56%] sm:w-[36%] md:w-[28%]`}>Prospect</th>
                <th scope="col" className={`${TH} hidden w-[20%] md:table-cell`}>Business</th>
                <th scope="col" className={`${TH} hidden w-[16%] md:table-cell`}>Requested</th>
                <th scope="col" className={`${TH} hidden w-[22%] sm:table-cell md:w-[18%]`}>Scheduled For</th>
                <th scope="col" className={`${TH} w-[44%] sm:w-[42%] md:w-[18%]`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => (
                <ClickableRow key={row.id} onOpen={() => setOpenId(row.id)} selected={row.id === openId}>
                  <td className={TD}>
                    <RowButton label={`Open the Debrief for ${row.fullName}`}>
                      <ProspectCell fullName={row.fullName} email={row.email} whatsapp={row.whatsapp} businessName={row.businessName} />
                    </RowButton>
                  </td>
                  <td className={`${TD} hidden truncate md:table-cell`}>{row.businessName ?? <span className="text-ink-muted">-</span>}</td>
                  <td className={`${TD} hidden md:table-cell`}>{formatDate(row.callRequestedAt)}</td>
                  <td className={`${TD} hidden sm:table-cell`}>
                    {row.callScheduledFor ? (<><span className="block">{formatDate(row.callScheduledFor)}</span><span className="block text-xs text-ink-muted">{formatTime(row.callScheduledFor)}</span></>) : <span className="text-ink-muted">No time yet</span>}
                  </td>
                  <td className={TD}><StatusBadge status={row.status} /></td>
                </ClickableRow>
              ))}
              {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-sm text-ink-muted">{rows.length === 0 ? "No one has asked for a Debrief yet." : "No Debriefs match."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <RecordDrawer
        open={opened !== null}
        onOpenChange={open => !open && setOpenId(null)}
        title={opened?.fullName ?? "Debrief"}
        description={opened?.businessName ?? "No business name given"}
      >
        {opened && <DiscoveryCallDetail row={opened} onOpenSection={onOpenSection} onClose={() => setOpenId(null)} />}
      </RecordDrawer>
    </div>
  );
}
