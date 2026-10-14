import { trpc } from "@/lib/trpc";
import { BUSINESS_ROLE_LABELS } from "@shared/businessCapabilities";
import React from "react";
import { formatDate } from "./format";

/** Onboarded clients only: businesses and the people who belong to them. A business check is never listed here. */
export default function ClientsView() {
  const clients = trpc.businessSupport.clients.useQuery(undefined, { retry: false });
  if (clients.error) return <p role="alert" className="p-6 text-sm text-danger-strong">{clients.error.message}</p>;
  const businessCount = new Set(clients.data?.map(row => row.businessId)).size;
  return (
    <div className="space-y-4 p-6">
      <p className="text-sm text-ink-muted">Businesses that have been onboarded, with the people who belong to them. {clients.data ? `${businessCount} business${businessCount === 1 ? "" : "es"}, ${clients.data.length} membership${clients.data.length === 1 ? "" : "s"}.` : ""}</p>
      {clients.isLoading ? <p className="text-sm text-ink-muted">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-line text-xs uppercase tracking-wider text-ink-muted"><th className="py-2 pr-3">Business</th><th className="pr-3">Person</th><th className="pr-3">Email</th><th className="pr-3">Role</th><th className="pr-3">Onboarded</th></tr></thead>
            <tbody>
              {clients.data?.map(row => (
                <tr key={row.membershipId} className="border-b border-line-soft">
                  <td className="py-2 pr-3">{row.businessName}</td>
                  <td className="pr-3">{row.userName ?? "-"}</td>
                  <td className="pr-3">{row.email ?? "-"}</td>
                  <td className="pr-3">{BUSINESS_ROLE_LABELS[row.role]}{row.membershipStatus !== "active" ? ` (${row.membershipStatus})` : ""}</td>
                  <td className="pr-3">{formatDate(row.businessCreatedAt)}</td>
                </tr>
              ))}
              {clients.data?.length === 0 && <tr><td colSpan={5} className="py-4 text-ink-muted">No clients have been onboarded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
