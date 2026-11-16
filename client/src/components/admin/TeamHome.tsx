import { useAuth } from "@/_core/hooks/useAuth";
import { BRAND } from "@shared/brand";
import { METHOD } from "@shared/method";
import { firstNameOf } from "@shared/whatsapp";
import { taskFromLink } from "@shared/links";
import { groupToday } from "./Today";
import { ADMIN_SECTIONS, PIPELINE_STAGES, visibleAdminSections, type AdminAccessView, type AdminSectionId, type ConsoleTarget, type PipelineStage } from "@/lib/adminSections";
import { trpc } from "@/lib/trpc";
import { avatarColour, initials } from "@/components/EngagementRoom";
import { FolderKanban, House, LayoutGrid, ListChecks } from "lucide-react";
import React, { useState } from "react";
import BottomBar from "@/components/room/BottomBar";
import { useAppManifest } from "@/lib/appManifest";
import { ConsoleSection } from "./BusinessSupportConsole";
import DatabaseBehind from "./DatabaseBehind";
import { EngagementWorkspace } from "./EngagementDetail";
import EngagementsView from "./EngagementsView";

type Access = AdminAccessView & { email?: string | null; name?: string | null; level?: string | null };
/** Where the person is: their home, one engagement, or one of the desk's sections. */
type View = { kind: "home" } | { kind: "engagement"; id: number } | { kind: "section"; id: AdminSectionId };

/** Good morning, afternoon or evening by the time in Lagos. */
export function greetingAt(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const RAIL_LINK = "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-600 transition-colors hover:bg-paper-sunken hover:text-ink";
const RAIL_ACTIVE = "bg-brand-tint font-medium text-ink";
/** The tabs of an open engagement, as the rail lists them (the workspace keeps the tab in the address). */
const ENGAGEMENT_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "progress", label: "Progress" },
  { id: "plan", label: METHOD.workPlan },
  { id: "meetings", label: `${METHOD.session}s` },
  { id: "deliverables", label: METHOD.deliverables },
] as const;

/**
 * The team's home (R83): everyone, the Super Admins included, works in the client's room's frame (ET, 13 November 2026). The
 * room's left rail (Home, My tasks, their projects with the open one's tabs, the desk's sections where their role has
 * them, and who is signed in), then Today and My projects, or one engagement as its workspace (R82). The server decides
 * every read and action, as in the console.
 */
export default function TeamHome({ access, now = new Date() }: { access: Access; now?: Date }) {
  const { logout } = useAuth();
  // Add to Home Screen opens the team's app (ET, 16 November 2026).
  useAppManifest("team");
  const list = trpc.engagement.staff.list.useQuery(undefined);
  const today = trpc.engagement.staff.today.useQuery(undefined);
  // A link from an email (R89) opens its engagement on the item: /admin?engagement=…&task=….
  const [arrival] = useState(() => (typeof window === "undefined" ? null : taskFromLink(window.location.search)));
  const [view, setView] = useState<View>(() => (arrival ? { kind: "engagement", id: arrival.engagementId } : { kind: "home" }));
  const [stage, setStage] = useState<PipelineStage>("checks");
  // A row in Today opens its item in the engagement's Work Plan (ET, 14 November 2026).
  const [picked, setPicked] = useState<{ engagementId: number; taskId: number } | null>(null);
  const waiting = today.data ? groupToday(today.data).length : 0;
  // The desk's sections other than delivery, for those whose role has them (Pipeline, Clients, Finance).
  // The desk's sections other than delivery, for those whose role has them: Pipeline, Clients, Finance, and Team for a
  // Super Admin. The console is retired: these are its screens, in the room's frame (ET, 13 November 2026).
  const sections = visibleAdminSections(access);
  const desk = sections.filter(section => section.id !== "engagements");
  const projects = (list.data?.items ?? []).filter(item => item.myRole);
  const open = view.kind === "engagement" ? list.data?.items.find(item => item.id === view.id) ?? null : null;
  const first = firstNameOf(access.name ?? "");
  const who = access.name?.trim() || access.email || "";
  const go = (next: View) => {
    setView(next);
    // Moving on clears a tab in the address and an email's link, so a reload starts where the person is.
    if (typeof window !== "undefined" && (window.location.hash || window.location.search)) window.history.replaceState(window.history.state, "", window.location.pathname);
  };
  const openTarget = (target: ConsoleTarget) => {
    if (PIPELINE_STAGES.some(item => item.id === target)) { setStage(target as PipelineStage); go({ kind: "section", id: "pipeline" }); return; }
    go(target === "engagements" ? { kind: "home" } : { kind: "section", id: target as AdminSectionId });
  };
  // Home's sections (Today, My projects) from the bottom bar: home first, then scroll to it once it is drawn.
  const toSection = (id: string) => {
    go({ kind: "home" });
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })));
  };
  const signOut = () => void logout().then(() => window.location.assign("/admin/login"));
  const greeting = (
    <div>
      <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">{greetingAt(now)}{first ? `, ${first}` : ""}</h1>
      {access.level && <p className="mt-0.5 text-sm text-ink-muted">{access.level}</p>}
    </div>
  );
  const sectionLabel = (id: AdminSectionId) => ADMIN_SECTIONS.find(item => item.id === id)?.label ?? id;

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <nav aria-label="Your work" className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line-soft bg-white px-3 py-5 text-sm lg:flex">
        <a href="/admin" className="flex items-center gap-2.5 px-2" aria-label={BRAND.productEndorsement}>
          <img src={BRAND.markUrl} alt="" className="h-8 w-auto" />
          <span className="leading-tight"><span className="block font-semibold text-ink">{BRAND.productName}</span><span className="block text-xs text-ink-muted">by {BRAND.organisationName}</span></span>
        </a>
        <ul className="space-y-0.5">
          <li><button type="button" className={`${RAIL_LINK} ${view.kind === "home" ? RAIL_ACTIVE : ""}`} onClick={() => go({ kind: "home" })}>Home</button></li>
          <li><button type="button" className={RAIL_LINK} onClick={() => go({ kind: "home" })}><span>My tasks</span>{waiting > 0 && <span className="rounded-full bg-brand-plum px-2 text-xs font-medium text-white tabular-nums" aria-label={`${waiting} for you today`}>{waiting}</span>}</button></li>
        </ul>
        <div>
          <p className="px-3 text-xs text-ink-muted">Your projects</p>
          <ul className="mt-2 space-y-0.5" aria-label="Your projects">
            {projects.map(item => (
              <li key={item.id}>
                <button type="button" className={`${RAIL_LINK} ${open?.id === item.id ? RAIL_ACTIVE : ""}`} onClick={() => go({ kind: "engagement", id: item.id })}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-plum to-brand text-xs font-semibold text-white">{item.businessName.trim().charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 truncate">{item.businessName}</span>
                  </span>
                </button>
                {open?.id === item.id && (
                  <ul className="ml-6 mt-1 space-y-0.5 border-l border-line-soft pl-3" aria-label={`${item.businessName} tabs`}>
                    {ENGAGEMENT_LINKS.map(link => <li key={link.id}><a href={`#${link.id}`} className={RAIL_LINK}>{link.label}</a></li>)}
                  </ul>
                )}
              </li>
            ))}
            {list.data && projects.length === 0 && <li className="px-3 text-xs text-ink-muted">None yet.</li>}
          </ul>
        </div>
        {desk.length > 0 && (
          <div>
            <p className="px-3 text-xs text-ink-muted">The desk</p>
            <ul className="mt-2 space-y-0.5" aria-label="The desk">
              {desk.map(section => <li key={section.id}><button type="button" className={`${RAIL_LINK} ${view.kind === "section" && view.id === section.id ? RAIL_ACTIVE : ""}`} onClick={() => go({ kind: "section", id: section.id })}>{sectionLabel(section.id)}</button></li>)}
            </ul>
          </div>
        )}
        <div className="mt-auto space-y-1 border-t border-line-soft pt-4">
          <div className="flex items-center gap-2.5 px-3 pb-2">
            <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white ${avatarColour(who)}`}>{initials(who)}</span>
            <span className="min-w-0"><span className="block truncate font-medium text-ink">{who}</span>{access.level && <span className="block text-xs text-ink-muted">{access.level}</span>}</span>
          </div>
          <button type="button" className={RAIL_LINK} onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <div className="min-w-0 flex-1 pb-20 lg:pb-0">
        <div aria-hidden className="h-[3px] bg-gradient-to-r from-brand-plum via-highlight-ink to-highlight" />
        {/* On a phone: a one-line bar at the top; the places the rail holds on a laptop are in the bottom bar. */}
        <div className="border-b border-line-soft bg-white lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-1">
            <a href="/admin" className="flex min-h-11 items-center gap-2" aria-label={BRAND.productEndorsement}><img src={BRAND.markUrl} alt="" className="h-7 w-auto" /><span className="text-sm font-semibold">{BRAND.productName}</span></a>
          </div>
        </div>
        {view.kind === "engagement" ? (
          <EngagementWorkspace engagementId={view.id} myRole={open?.myRole ?? null} onBack={() => go({ kind: "home" })} openTaskId={picked && picked.engagementId === view.id ? picked.taskId : arrival && arrival.engagementId === view.id ? arrival.taskId : null} />
        ) : (
          <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-7">
            <DatabaseBehind />
            {sections.length === 0 ? (
              <p role="note" className="rounded-xl border border-line-soft bg-white p-4 text-sm text-ink-muted">Your account is signed in, but it has no level yet, so there is nothing to open here. A Super Admin sets your level in Team.</p>
            ) : view.kind === "section" ? (
              <>
                <h1 className="font-sans text-2xl font-semibold tracking-tight text-ink">{sectionLabel(view.id)}</h1>
                <div className="overflow-hidden rounded-xl border border-line-soft bg-white"><ConsoleSection id={view.id} access={access} stage={stage} onStage={setStage} onOpen={openTarget} /></div>
              </>
            ) : <EngagementsView home header={greeting} onOpenProject={(id, taskId) => { setPicked(taskId ? { engagementId: id, taskId } : null); go({ kind: "engagement", id }); }} />}
          </main>
        )}
      </div>
      {/* On a phone, the places used most within thumb's reach, as ClickUp has them (ET, 16 November 2026). */}
      <BottomBar label="Your work on a phone" items={[
        { id: "home", label: "Home", icon: <House className="h-5 w-5" aria-hidden />, onSelect: () => { go({ kind: "home" }); window.scrollTo({ top: 0 }); }, active: view.kind === "home" },
        { id: "tasks", label: "My tasks", icon: <ListChecks className="h-5 w-5" aria-hidden />, onSelect: () => toSection("today"), badge: waiting || undefined },
        { id: "projects", label: "Projects", icon: <FolderKanban className="h-5 w-5" aria-hidden />, onSelect: () => (projects.length === 1 ? go({ kind: "engagement", id: projects[0]!.id }) : toSection("my-projects")), active: view.kind === "engagement" },
      ]} more={desk.map(section => ({ id: section.id, label: sectionLabel(section.id), icon: <LayoutGrid className="h-5 w-5" aria-hidden />, onSelect: () => go({ kind: "section", id: section.id }), active: view.kind === "section" && view.id === section.id }))}
        footer={<div className="mt-2 border-t border-line-soft pt-2"><p className="py-1 text-xs text-ink-muted">{who}{access.level ? ` · ${access.level}` : ""}</p><button type="button" onClick={signOut} className="flex min-h-12 w-full items-center text-sm text-ink">Sign out</button></div>} />
    </div>
  );
}
