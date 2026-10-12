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

export const ADMIN_SECTIONS = [
  { id: "checks", label: "Business Checks" },
  { id: "calls", label: "Discovery Calls" },
  { id: "onboarding", label: "Client Onboarding" },
  { id: "engagements", label: "Engagements" },
  { id: "clients", label: "Clients" },
  { id: "team", label: "Admin Team" },
  { id: "jump", label: "JUMP Programme (Legacy)" },
] as const;
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]["id"];

const REQUIRED: Record<AdminSectionId, (access: AdminAccessView) => boolean> = {
  checks: access => adminCan(access, "manage_client_onboarding"),
  calls: access => adminCan(access, "manage_client_onboarding"),
  onboarding: access => adminCan(access, "manage_client_onboarding"),
  engagements: access => adminCan(access, "view_all_businesses") || adminCan(access, "view_assigned_businesses"),
  clients: access => adminCan(access, "view_all_businesses"),
  team: access => access.isSuperAdmin === true || access.isOwner === true,
  jump: access => adminCan(access, "view_participants"),
};

/** The sections this person can use, in display order. The first is where the console opens. */
export function visibleAdminSections(access: AdminAccessView | undefined) {
  if (!access) return [];
  return ADMIN_SECTIONS.filter(section => REQUIRED[section.id](access));
}
