/**
 * What the admin console shows to whom. This never decides access (the server does, per action); it only avoids
 * showing sections a person cannot use. It reads the permissions the server resolved, so the central authority
 * resolver stays the single source of truth: there is no owner email, and no role name, in the browser.
 */
export type AdminAccessView = {
  isSuperAdmin?: boolean;
  isOwner?: boolean;
  /** Legacy administrator capabilities the server resolved for this person. */
  permissions: readonly string[];
  /** Platform permissions the server resolved for this person. */
  platformPermissions?: readonly string[];
};

export function adminCan(access: AdminAccessView | undefined, permission: string): boolean {
  if (!access) return false;
  if (access.isSuperAdmin === true || access.isOwner === true) return true;
  return access.permissions.includes(permission) || (access.platformPermissions ?? []).includes(permission);
}

/**
 * Five sections, one job each, in the order work flows (ET, 6 November 2026): prospects, delivery, clients, money, our
 * own people. Nothing appears in two of them.
 */
export const ADMIN_SECTIONS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "engagements", label: "Engagements" },
  { id: "clients", label: "Clients" },
  { id: "finance", label: "Finance" },
  { id: "team", label: "Team" },
] as const;
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]["id"];

/** The stages inside Pipeline: the Business Health Check, the Discovery Call, then onboarding the client. */
export const PIPELINE_STAGES = [
  { id: "checks", label: "Business Health Checks" },
  { id: "calls", label: "Discovery Calls" },
  { id: "onboarding", label: "Client Onboarding" },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"];
/** Where a record's "next step" button can send the person: a section, or a stage of Pipeline. */
export type ConsoleTarget = AdminSectionId | PipelineStage;

const REQUIRED: Record<AdminSectionId, (access: AdminAccessView) => boolean> = {
  pipeline: access => adminCan(access, "manage_client_onboarding"),
  engagements: access => adminCan(access, "view_all_businesses") || adminCan(access, "view_assigned_businesses"),
  clients: access => adminCan(access, "view_all_businesses"),
  finance: access => adminCan(access, "view_financials"),
  team: access => access.isSuperAdmin === true || access.isOwner === true,
};

/** The sections this person can use, in display order. The first is where the console opens. */
export function visibleAdminSections(access: AdminAccessView | undefined) {
  if (!access) return [];
  return ADMIN_SECTIONS.filter(section => REQUIRED[section.id](access));
}

/** The sections the team's home holds: their own projects, and Finance for a Partner. */
const HOME_SECTIONS: readonly AdminSectionId[] = ["engagements", "finance"];

/**
 * Whether /admin opens as the team's home (R83) rather than the console: someone who works only on their own projects,
 * with no view of every business and nothing in Pipeline, Clients or Team. Presentation only; the server decides access.
 */
export function isTeamHome(access: AdminAccessView | undefined) {
  if (!access || adminCan(access, "view_all_businesses")) return false;
  const sections = visibleAdminSections(access).map(section => section.id);
  return sections.includes("engagements") && sections.every(id => HOME_SECTIONS.includes(id));
}
