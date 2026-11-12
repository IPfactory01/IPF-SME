import { useAuth } from "@/_core/hooks/useAuth";
import { BRAND } from "@shared/brand";
import { firstNameOf } from "@shared/whatsapp";
import { visibleAdminSections, type AdminAccessView } from "@/lib/adminSections";
import React, { useState } from "react";
import DatabaseBehind from "./DatabaseBehind";
import EngagementsView from "./EngagementsView";
import FinanceView from "./FinanceView";

type Access = AdminAccessView & { email?: string | null; name?: string | null; level?: string | null };

/** Good morning, afternoon or evening by the time in Lagos. */
export function greetingAt(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The team's home (R83): someone who works only on their own projects signs in to a page built like the client's room,
 * not the console. Today and My projects first; each project opens as their workspace (R82); a Partner also has
 * Finance. The server decides every read and action, as in the console.
 */
export default function TeamHome({ access, now = new Date() }: { access: Access; now?: Date }) {
  const { logout } = useAuth();
  const finance = visibleAdminSections(access).some(section => section.id === "finance");
  const [tab, setTab] = useState<"work" | "finance">("work");
  const first = firstNameOf(access.name ?? "");
  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">{greetingAt(now)}{first ? `, ${first}` : ""}</h1>
        {access.level && <p className="mt-0.5 text-sm text-ink-muted">{access.level}</p>}
      </div>
      {finance && (
        <div role="tablist" aria-label="Your home" className="inline-flex rounded-full border border-line-soft bg-white p-1 text-sm">
          {(["work", "finance"] as const).map(id => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-h-9 rounded-full px-4 ${tab === id ? "bg-brand text-white" : "text-ink-600"}`}>{id === "work" ? "My work" : "Finance"}</button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
      <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-white px-4 py-1 sm:px-7">
        <a href="/admin" className="flex min-h-11 items-center gap-2" aria-label={BRAND.productEndorsement}><img src={BRAND.markUrl} alt="" className="h-7 w-auto" /><span className="text-sm font-semibold">{BRAND.productName}</span></a>
        <div className="flex items-center gap-2 text-sm">
          {access.name?.trim() && <span className="hidden text-ink-600 sm:inline">{access.name}</span>}
          <button type="button" onClick={() => void logout().then(() => window.location.assign("/admin/login"))} className="inline-flex min-h-11 items-center px-2 text-ink-600">Sign out</button>
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-7">
        <DatabaseBehind />
        {tab === "finance" && finance ? <>{header}<div className="rounded-xl border border-line-soft bg-white"><FinanceView /></div></> : <EngagementsView home header={header} />}
      </main>
    </div>
  );
}
