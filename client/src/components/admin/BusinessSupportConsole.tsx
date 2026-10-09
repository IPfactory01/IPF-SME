import ClientOnboardingPanel from "@/components/ClientOnboardingPanel";
import { ADMIN_SECTIONS, visibleAdminSections, type AdminAccessView, type AdminSectionId } from "@/lib/adminSections";
import React, { useState } from "react";
import BusinessChecksView from "./BusinessChecksView";
import ClientsView from "./ClientsView";
import DiscoveryCallsView from "./DiscoveryCallsView";
import EngagementsView from "./EngagementsView";
import { roleDisplay } from "./format";

type Access = AdminAccessView & { email?: string | null; name?: string | null; platformRoles?: readonly string[] };

const TITLES: Record<AdminSectionId, string> = {
  checks: "Business Checks",
  calls: "Discovery Calls",
  onboarding: "Client Onboarding",
  engagements: "Engagements",
  clients: "Clients",
  team: "Administration Team",
  jump: "JUMP Programme (Legacy)",
};

/**
 * The IPF Business Support admin console: the funnel in order (Free Business Check, discovery call, onboarding, clients),
 * then the admin team, with the earlier JUMP programme desk kept in its own legacy section. Sections come from the
 * permissions the server resolved; the server still decides every action.
 */
export default function BusinessSupportConsole({ access, team, jump }: { access: Access; team: React.ReactNode; jump: React.ReactNode }) {
  const sections = visibleAdminSections(access);
  const [chosen, setChosen] = useState<AdminSectionId | null>(null);
  const active = sections.find(section => section.id === chosen) ?? sections[0];
  const roles = roleDisplay(access.platformRoles);
  // Show the person, not their address, first; the address stays visible underneath.
  const who = access.name?.trim() || access.email || "";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-xs uppercase tracking-[0.22em] text-brand">IPF Business Support / Admin</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">{active ? TITLES[active.id] : "Admin"}</h1>
        </div>
        {who && (
          <div className="text-left sm:text-right" aria-label="Signed in">
            <p className="text-sm font-medium text-ink">{who}</p>
            {roles && <p className="text-xs text-ink-muted">{roles}</p>}
            {access.name?.trim() && access.email && <p className="text-xs text-ink-muted">{access.email}</p>}
          </div>
        )}
      </div>

      {sections.length === 0 ? (
        <p role="note" className="border border-line bg-white p-6 text-sm text-ink-muted">Your account is signed in, but no admin responsibilities have been assigned to it yet. Ask the Super Admin to grant them.</p>
      ) : (
        <>
          <nav aria-label="Admin sections" className="flex flex-wrap gap-x-1 gap-y-1 border-b border-line">
            {sections.map(section => {
              const isActive = active?.id === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setChosen(section.id)}
                  className={`-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors focus:outline-none focus-visible:bg-brand-tint ${isActive ? "border-brand font-semibold text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {ADMIN_SECTIONS.find(item => item.id === section.id)?.label}
                </button>
              );
            })}
          </nav>
          <div className="border border-line bg-paper shadow-sm">
            {active?.id === "checks" && <BusinessChecksView onOpenSection={setChosen} />}
            {active?.id === "calls" && <DiscoveryCallsView onOpenSection={setChosen} />}
            {active?.id === "onboarding" && <ClientOnboardingPanel />}
            {active?.id === "engagements" && <EngagementsView />}
            {active?.id === "clients" && <ClientsView />}
            {active?.id === "team" && team}
            {active?.id === "jump" && <div className="p-4">{jump}</div>}
          </div>
        </>
      )}
    </div>
  );
}
