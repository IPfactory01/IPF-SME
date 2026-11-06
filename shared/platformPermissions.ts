import { ADMIN_PERMISSION_IDS, type AdminPermission } from "./adminPermissions";
import { PLATFORM_ROLES, type PlatformRole } from "./auth";

/**
 * Platform authority: what a person may do INSIDE IPF. It answers "what responsibility does this person have?" and
 * is separate from business membership ("which business may they act inside?"). One source of truth, code-defined:
 * roles are assigned in the database (`user_platform_roles`); what each role grants is decided here.
 *
 * Resolution rule (the only one; there is no "deny"): a permission is granted if ANY source grants it. Sources are
 *   1. the Super Admin bridge   - the recognised owner email, or a stored `super_admin` role: everything
 *   2. platform roles           - the matrix below (the legacy `users.role = 'admin'` counts as the `admin` role)
 *   3. the legacy admin profile - `admin_permission_profiles`, mapped to platform permissions below
 * so the legacy and the new systems can never contradict each other: adding a source can only add authority.
 */

export const PLATFORM_PERMISSIONS = [
  "view_all_businesses",
  "view_assigned_businesses",
  "manage_businesses",
  "manage_client_onboarding",
  "manage_engagements",
  "assign_engagements",
  "review_engagements",
  "contribute_engagements",
  "manage_payments",
  "view_financials",
  "manage_scheduling",
  "manage_communications",
  "manage_users",
  "manage_roles",
  "manage_admins",
  "manage_platform_settings",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}
export function isPlatformPermission(value: string): value is PlatformPermission {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * What each role grants by default. `admin` deliberately grants nothing on its own: an administrator is capability
 * based and receives responsibilities one at a time (through the admin permission profile). Being an admin is not
 * unrestricted access. Scope ("assigned" businesses) is enforced later through engagement assignments.
 */
export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  super_admin: PLATFORM_PERMISSIONS,
  admin: [],
  // The desk and partners see Finance (ET, 6 November 2026): read only; recording payments stays with manage_payments.
  desk_lead: ["view_all_businesses", "manage_engagements", "assign_engagements", "review_engagements", "manage_scheduling", "manage_communications", "view_financials"],
  analyst: ["view_assigned_businesses", "manage_engagements"],
  partner: ["view_assigned_businesses", "review_engagements", "view_financials"],
  // Specialists hand in work on their own engagements (ET, 6 November 2026): team-side Work Plan items and draft files on
  // a Deliverable, seen by IP Factory only until the lead shares them. They do not see internal notes or the agreement.
  subject_matter_expert: ["view_assigned_businesses", "contribute_engagements"],
  finance: ["manage_payments", "view_financials"],
};

/**
 * Compatibility with the existing administrator capabilities (`admin_permission_profiles`). A legacy capability that
 * has a platform equivalent grants it, and the platform permission grants the legacy capability back, so the same
 * responsibility gives the same answer whichever system is asked. Legacy capabilities with no equivalent
 * (participant review, documents, portal access, ...) stay governed by the legacy profile and the Super Admin only.
 */
export const LEGACY_CAPABILITY_TO_PLATFORM: Partial<Record<AdminPermission, PlatformPermission>> = {
  manage_payments: "manage_payments",
  manage_scheduling: "manage_scheduling",
  manage_client_onboarding: "manage_client_onboarding",
};
export const PLATFORM_TO_LEGACY_CAPABILITIES: Partial<Record<PlatformPermission, readonly AdminPermission[]>> = {
  manage_payments: ["manage_payments"],
  manage_scheduling: ["manage_scheduling"],
  manage_client_onboarding: ["manage_client_onboarding"],
  manage_communications: ["view_communications"],
};

export type Authority = {
  /** Stored roles plus the roles implied by the legacy admin flag and the Super Admin bridge. */
  roles: PlatformRole[];
  permissions: PlatformPermission[];
  /** Legacy administrator capability ids this person holds. */
  legacyCapabilities: AdminPermission[];
  isSuperAdmin: boolean;
};

/** Pure resolution. Inputs come from the database; no I/O here, so it can be tested exhaustively. */
export function resolveAuthority(input: {
  storedRoles: readonly PlatformRole[];
  /** `users.role === "admin"`: the legacy flag counts as the `admin` role. */
  legacyAdmin: boolean;
  /** The recognised owner email (the Super Admin bridge). */
  ownerBridge: boolean;
  /** Capabilities from `admin_permission_profiles`. */
  legacyProfile: readonly AdminPermission[];
  /** A disabled or suspended person has no authority at all. */
  active: boolean;
}): Authority {
  if (!input.active) return { roles: [], permissions: [], legacyCapabilities: [], isSuperAdmin: false };

  const roles = new Set<PlatformRole>(input.storedRoles);
  if (input.legacyAdmin) roles.add("admin");
  if (input.ownerBridge) roles.add("super_admin");
  const isSuperAdmin = roles.has("super_admin");

  const permissions = new Set<PlatformPermission>();
  for (const role of Array.from(roles)) for (const permission of PLATFORM_ROLE_PERMISSIONS[role]) permissions.add(permission);
  for (const capability of input.legacyProfile) {
    const equivalent = LEGACY_CAPABILITY_TO_PLATFORM[capability];
    if (equivalent) permissions.add(equivalent);
  }

  const legacy = new Set<AdminPermission>(isSuperAdmin ? ADMIN_PERMISSION_IDS : input.legacyProfile);
  for (const permission of Array.from(permissions)) for (const capability of PLATFORM_TO_LEGACY_CAPABILITIES[permission] ?? []) legacy.add(capability);

  const order = (list: readonly string[]) => (item: string) => list.indexOf(item);
  return {
    roles: Array.from(roles).sort((a, b) => order(PLATFORM_ROLES)(a) - order(PLATFORM_ROLES)(b)),
    permissions: Array.from(permissions).sort((a, b) => order(PLATFORM_PERMISSIONS)(a) - order(PLATFORM_PERMISSIONS)(b)),
    legacyCapabilities: Array.from(legacy).sort((a, b) => order(ADMIN_PERMISSION_IDS)(a) - order(ADMIN_PERMISSION_IDS)(b)),
    isSuperAdmin,
  };
}

/** A gate may name either a platform permission or a legacy administrator capability. */
export type AnyAuthorityPermission = PlatformPermission | AdminPermission;

export function authorityAllows(authority: Authority, permission: AnyAuthorityPermission): boolean {
  if (authority.isSuperAdmin) return true;
  return (authority.permissions as readonly string[]).includes(permission) || (authority.legacyCapabilities as readonly string[]).includes(permission);
}

/**
 * Seniority, for granting. A person may grant or revoke only roles BELOW their own highest role; only a Super Admin
 * may grant Admin or Super Admin. So an Admin can add a specialist or an analyst, but never another Admin.
 */
export const PLATFORM_ROLE_RANK: Record<PlatformRole, number> = {
  super_admin: 100,
  admin: 80,
  desk_lead: 60,
  partner: 60,
  finance: 50,
  analyst: 40,
  subject_matter_expert: 20,
};

export function canGrantRole(actor: Pick<Authority, "roles" | "isSuperAdmin">, role: PlatformRole): boolean {
  if (actor.isSuperAdmin) return true;
  const highest = Math.max(0, ...actor.roles.map(item => PLATFORM_ROLE_RANK[item]));
  return PLATFORM_ROLE_RANK[role] < highest;
}

/** Contractors' access must end on a date: a specialist role is never granted open-ended. */
export const ROLES_REQUIRING_END_DATE: readonly PlatformRole[] = ["subject_matter_expert"];
/** The furthest ahead an end date may be set, in days. */
export const MAX_ROLE_DURATION_DAYS = 400;

/** Everyone with an internal role signs in with two steps: password, then a code from their phone. */
export function requiresTwoStep(authority: Pick<Authority, "roles">): boolean {
  return authority.roles.length > 0;
}

/**
 * Levels (ET, 5 November 2026): staff are onboarded by their level in the firm, and the level decides their access.
 * Their function on a project (Engagement Manager, Lead Consultant, Analyst, Specialist) is set per engagement. Partner,
 * Vice President and Senior Associate see every engagement, assign people and approve; Associates and Business Analysts
 * see the engagements they are on (an Associate leading one approves there); a Specialist is a contractor with an end
 * date; Finance sees payments only. Super Admin is not a level: it is the platform owner, kept apart.
 */
export const FIRM_LEVELS = ["Partner", "Vice President", "Senior Associate", "Associate", "Senior Business Analyst", "Business Analyst", "Specialist", "Finance"] as const;
export type FirmLevel = (typeof FIRM_LEVELS)[number];
export const LEVEL_ROLES: Record<FirmLevel, readonly PlatformRole[]> = {
  Partner: ["desk_lead", "partner"],
  "Vice President": ["desk_lead"],
  "Senior Associate": ["desk_lead"],
  Associate: ["analyst"],
  "Senior Business Analyst": ["analyst"],
  "Business Analyst": ["analyst"],
  Specialist: ["subject_matter_expert"],
  Finance: ["finance"],
};
/** What a level can do, in one line, for the invite form and People. */
export const LEVEL_ACCESS: Record<FirmLevel, string> = {
  Partner: "Every engagement; assigns people and approves; sees Finance",
  "Vice President": "Every engagement; assigns people and approves; sees Finance",
  "Senior Associate": "Every engagement; assigns people and approves; sees Finance",
  Associate: "Engagements they are on; approves when leading one",
  "Senior Business Analyst": "Engagements they are on",
  "Business Analyst": "Engagements they are on",
  Specialist: "Engagements they are on, until an end date; hands in drafts for the lead",
  Finance: "Payments only",
};
export const isFirmLevel = (value: string | null | undefined): value is FirmLevel => (FIRM_LEVELS as readonly string[]).includes(value ?? "");

