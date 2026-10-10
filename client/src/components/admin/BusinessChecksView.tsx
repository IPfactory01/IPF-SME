import { Input } from "@/components/ui/input";
import type { AdminSectionId } from "@/lib/adminSections";
import { trpc } from "@/lib/trpc";
import { funnelStatus, isReadyToOnboard, stageDisplayName } from "@shared/businessCheck/funnelStatus";
import { PIPELINE_LABELS, PIPELINE_STAGES, type PipelineStage } from "@shared/businessCheck/pipeline";
import { AREA_NAMES } from "@shared/businessCheck/questions";
import React, { useMemo, useState } from "react";
import { AdminMetricCard, ClickableRow, ProspectCell, RecordDrawer, RowButton, StatusBadge, TD, TH } from "./AdminPrimitives";
import { PaymentChips } from "./Payments";
import BusinessCheckDetail from "./BusinessCheckDetail";
import { formatDate, readinessShort } from "./format";

/**
 * Every Free Business Check, as a compact list: who they are, where they are in the funnel, and whether they need
 * attention. The full record opens in a drawer. These are prospects: nothing here creates a user or a business.
 */
export default function BusinessChecksView({ onOpenSection }: { onOpenSection: (section: AdminSectionId) => void }) {
  const checks = trpc.businessSupport.checks.useQuery(undefined, { retry: false });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<PipelineStage | "all">("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => (checks.data ?? []).map(row => ({ ...row, status: funnelStatus(row) })), [checks.data]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      if (stage !== "all" && row.pipelineStage !== stage) return false;
      if (!needle) return true;
      return [row.fullName, row.businessName, row.email, row.whatsapp].some(value => value?.toLowerCase().includes(needle));
    });
  }, [rows, search, stage]);
  const opened = rows.find(row => row.id === openId) ?? null;
  /** How many checks sit in each stored pipeline stage: the whole funnel at a glance. */
  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(PIPELINE_STAGES.map(item => [item, 0])) as Record<PipelineStage, number>;
    for (const row of rows) counts[row.pipelineStage] += 1;
    return counts;
  }, [rows]);

  if (checks.error) return <p role="alert" className="p-6 text-sm text-rose-900">{checks.error.message}</p>;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Summary">
        <AdminMetricCard label="Business Checks" value={rows.length} />
        <AdminMetricCard label="Completed" value={rows.filter(row => row.completedAt).length} />
        <AdminMetricCard label="Debriefs requested" value={rows.filter(row => row.callRequestedAt).length} />
        <AdminMetricCard label="Ready to onboard" value={rows.filter(row => isReadyToOnboard(row.status)).length} />
        <AdminMetricCard label="Full Reports requested" value={rows.filter(row => row.reportRequestedAt).length} />
      </dl>

      <div role="tablist" aria-label="Pipeline stage" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {(["all", ...PIPELINE_STAGES] as const).map(item => {
          const active = stage === item;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={active}
              title={item === "all" ? undefined : PIPELINE_LABELS[item].meaning}
              onClick={() => setStage(item)}
              className={`shrink-0 border px-3 py-1.5 text-xs font-medium ${active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:border-brand-line-strong"}`}
            >
              {item === "all" ? "All" : stageDisplayName(item)} <span className={active ? "text-white/80" : "text-ink-muted"}>{item === "all" ? rows.length : stageCounts[item]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input aria-label="Search Business Checks" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, business, email or WhatsApp" className="h-9 rounded-none sm:max-w-xs" />
        <span className="text-xs text-ink-muted sm:ml-auto">{visible.length} of {rows.length}</span>
      </div>

      {checks.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <div className="max-h-[68vh] overflow-y-auto border border-line bg-white">
          <table className="w-full table-fixed border-collapse">
            <thead className="sticky top-0 z-10 border-b border-line bg-paper">
              <tr>
                <th scope="col" className={`${TH} w-[44%] sm:w-[34%] md:w-[28%]`}>Prospect</th>
                <th scope="col" className={`${TH} hidden w-[22%] sm:table-cell`}>Business</th>
                <th scope="col" className={`${TH} hidden w-[18%] md:table-cell`}>Business Check</th>
                <th scope="col" className={`${TH} hidden w-[18%] md:table-cell`}>Main Finding</th>
                <th scope="col" className={`${TH} w-[56%] sm:w-[44%] md:w-[14%]`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => (
                <ClickableRow key={row.id} onOpen={() => setOpenId(row.id)} selected={row.id === openId}>
                  <td className={TD}>
                    <RowButton label={`Open record for ${row.fullName}`}>
                      <ProspectCell fullName={row.fullName} email={row.email} whatsapp={row.whatsapp} businessName={row.businessName} />
                    </RowButton>
                  </td>
                  <td className={`${TD} hidden truncate sm:table-cell`}>{row.businessName ?? <span className="text-ink-muted">-</span>}</td>
                  <td className={`${TD} hidden md:table-cell`}>
                    <span className={`inline-block border px-1.5 py-0.5 text-[11px] font-medium ${row.completedAt ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-line bg-paper-sunken text-ink-muted"}`}>{row.completedAt ? "Completed" : "Not finished"}</span>
                    <span className="mt-1 block text-xs text-ink-muted">{row.completedAt ? formatDate(row.completedAt) : `Started ${formatDate(row.createdAt)}`}</span>
                  </td>
                  <td className={`${TD} hidden md:table-cell`}>
                    {row.completedAt && row.primaryArea !== null ? (
                      <>
                        <span className="block truncate">{AREA_NAMES[row.primaryArea] ?? `Area ${row.primaryArea}`}</span>
                        {row.readiness && <span className="block truncate text-xs text-ink-muted">{readinessShort(row.readiness)}</span>}
                      </>
                    ) : <span className="text-ink-muted">-</span>}
                  </td>
                  <td className={TD}>
                    <StatusBadge status={row.status} />
                    {/* The ₦100,000 full report is independent of the call, so it is shown beside the stage. */}
                    <PaymentChips payments={row.payments} reportRequestedAt={row.reportRequestedAt} />
                  </td>
                </ClickableRow>
              ))}
              {visible.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-sm text-ink-muted">No Business Checks match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <RecordDrawer
        open={opened !== null}
        onOpenChange={open => !open && setOpenId(null)}
        title={opened?.fullName ?? "Business Check"}
        description={opened?.businessName ?? "No business name given"}
      >
        {opened && <BusinessCheckDetail businessCheckId={opened.id} onOpenSection={onOpenSection} onClose={() => setOpenId(null)} />}
      </RecordDrawer>
    </div>
  );
}
