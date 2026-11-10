import ClientOnboardingPanel from "@/components/ClientOnboardingPanel";
import { ADMIN_SECTIONS, PIPELINE_STAGES, visibleAdminSections, type AdminAccessView, type AdminSectionId, type ConsoleTarget, type PipelineStage } from "@/lib/adminSections";
import React, { useState } from "react";
import BusinessChecksView from "./BusinessChecksView";
import ClientsView from "./ClientsView";
import DatabaseBehind from "./DatabaseBehind";
import DiscoveryCallsView from "./DiscoveryCallsView";
import EngagementsView from "./EngagementsView";
import FailedEmails from "./FailedEmails";
import FinanceView from "./FinanceView";
import PeoplePanel from "./PeoplePanel";
import StaffPanel from "./StaffPanel";
import SystemStatus from "./SystemStatus";

type Access = AdminAccessView & { email?: string | null; name?: string | null; level?: string | null };

/**
 * The IPF Business Support admin console, in five sections with one job each, in the order work flows: Pipeline
 * (prospects: the Business Health Check, the Discovery Call, onboarding), Engagements (delivery), Clients (businesses,
 * people and their accounts), Finance (money across every client) and Team (IP Factory people and the system status).
 * Sections come from the permissions the server resolved; the server still decides every action.
 */
export default function BusinessSupportConsole({ access }: { access: Access }) {
  const sections = visibleAdminSections(access);
  const [chosen, setChosen] = useState<AdminSectionId | null>(null);
  const [stage, setStage] = useState<PipelineStage>("checks");
  const active = sections.find(section => section.id === chosen) ?? sections[0];
  const open = (target: ConsoleTarget) => {
    if (PIPELINE_STAGES.some(item => item.id === target)) { setStage(target as PipelineStage); setChosen("pipeline"); return; }
    setChosen(target as AdminSectionId);
  };
  // Show the person and their level, never the roles behind it.
  const who = access.name?.trim() || access.email || "";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1.5 text-sm text-brand">IPF Business Support / Admin</p>
          <h1 className="font-serif text-3xl font-normal tracking-tight sm:text-4xl">{active ? ADMIN_SECTIONS.find(item => item.id === active.id)?.label : "Admin"}</h1>
        </div>
        {who && (
          <div className="text-left sm:text-right" aria-label="Signed in">
            <p className="text-sm font-medium text-ink">{who}</p>
            {access.level && <p className="text-xs text-ink-muted">{access.level}</p>}
            {access.name?.trim() && access.email && <p className="text-xs text-ink-muted">{access.email}</p>}
          </div>
        )}
      </div>

      <DatabaseBehind />

      {sections.length === 0 ? (
        <p role="note" className="border border-line bg-white p-6 text-sm text-ink-muted">Your account is signed in, but it has no level yet, so there is nothing to open here. A Super Admin sets your level in Admin › Team.</p>
      ) : (
        <>
          <nav aria-label="Admin sections" className="flex flex-wrap gap-x-1 gap-y-1 border-b border-line">
            {sections.map(section => {
              const isActive = active?.id === section.id;
              return (
                <button key={section.id} type="button" aria-current={isActive ? "page" : undefined} onClick={() => setChosen(section.id)}
                  className={`-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors focus:outline-none focus-visible:bg-brand-tint ${isActive ? "border-brand font-semibold text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}>
                  {ADMIN_SECTIONS.find(item => item.id === section.id)?.label}
                </button>
              );
            })}
          </nav>
          <div className="border border-line bg-paper shadow-sm">
            {active?.id === "pipeline" && (
              <>
                <FailedEmails />
                <div role="group" aria-label="Pipeline stage" className="flex flex-wrap gap-1 border-b border-line bg-white px-4 py-2">
                  {PIPELINE_STAGES.map(item => (
                    <button key={item.id} type="button" aria-pressed={stage === item.id} onClick={() => setStage(item.id)}
                      className={`rounded-full px-3 py-1 text-xs ${stage === item.id ? "bg-brand text-white" : "text-ink-600 hover:bg-paper-sunken"}`}>{item.label}</button>
                  ))}
                </div>
                {stage === "checks" && <BusinessChecksView onOpenSection={open} />}
                {stage === "calls" && <DiscoveryCallsView onOpenSection={open} />}
                {stage === "onboarding" && <ClientOnboardingPanel />}
              </>
            )}
            {active?.id === "engagements" && <EngagementsView />}
            {active?.id === "clients" && <><ClientsView /><PeoplePanel scope="clients" /></>}
            {active?.id === "finance" && <FinanceView />}
            {active?.id === "team" && <><PeoplePanel scope="team" /><StaffPanel /><SystemStatus /></>}
          </div>
        </>
      )}
    </div>
  );
}
