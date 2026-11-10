import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSION_IDS } from "@shared/adminPermissions";
import { PLATFORM_ROLES } from "@shared/auth";
import { BUSINESS_MEMBERSHIP_ROLES } from "@shared/businessMemberships";
import {
  BUSINESS_CAPABILITIES,
  BUSINESS_ROLE_CAPABILITIES,
  businessRoleCan,
  canEditBusiness,
  canManageBusinessMembers,
  canViewBusiness,
} from "@shared/businessCapabilities";
import {
  LEGACY_CAPABILITY_TO_PLATFORM,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  PLATFORM_TO_LEGACY_CAPABILITIES,
  PLATFORM_ROLE_RANK,
  ROLES_REQUIRING_END_DATE,
  authorityAllows,
  canGrantRole,
  requiresTwoStep,
  isPlatformPermission,
  isPlatformRole,
  LEVEL_ROLES,
  resolveAuthority,
} from "@shared/platformPermissions";

const none = { storedRoles: [], legacyAdmin: false, ownerBridge: false, legacyProfile: [], active: true } as const;

describe("platform roles are separate from business roles", () => {
  it("shares no name with the business membership roles, and never uses 'founder'", () => {
    expect(PLATFORM_ROLES.filter(role => (BUSINESS_MEMBERSHIP_ROLES as readonly string[]).includes(role))).toEqual([]);
    expect([...PLATFORM_ROLES, ...BUSINESS_MEMBERSHIP_ROLES]).not.toContain("founder");
    expect(isPlatformRole("owner")).toBe(false);
    expect(isPlatformRole("analyst")).toBe(true);
  });

  it("defines a permission set for every platform role and only known permissions", () => {
    expect(Object.keys(PLATFORM_ROLE_PERMISSIONS).sort()).toEqual([...PLATFORM_ROLES].sort());
    for (const permissions of Object.values(PLATFORM_ROLE_PERMISSIONS)) for (const permission of permissions) expect(isPlatformPermission(permission)).toBe(true);
  });

  it("never gives a business role a platform permission or the other way round", () => {
    for (const permission of PLATFORM_PERMISSIONS) expect((BUSINESS_CAPABILITIES as readonly string[]).includes(permission)).toBe(false);
  });
});

describe("writing off a fee (ET, 10 November 2026, batch F2)", () => {
  it("is a Partner's decision or the Super Admin's, never Finance's or the desk's", () => {
    const holders = PLATFORM_ROLES.filter((role) => PLATFORM_ROLE_PERMISSIONS[role].includes("write_off_fees"));
    expect(holders).toEqual(["super_admin", "partner"]);
    expect(PLATFORM_ROLE_PERMISSIONS.finance).not.toContain("write_off_fees");
    expect(PLATFORM_ROLE_PERMISSIONS.partner).not.toContain("manage_payments");
  });
});

describe("work before the first payment (ET, 10 November 2026)", () => {
  it("is a Partner's decision or the Super Admin's: no other level or role grants it", () => {
    const holders = PLATFORM_ROLES.filter((role) => PLATFORM_ROLE_PERMISSIONS[role].includes("approve_work_before_payment"));
    expect(holders).toEqual(["super_admin", "partner"]);
    // A Partner is invited with the desk-lead bundle and the partner one; a Vice President or Senior Associate with the first only.
    expect(LEVEL_ROLES.Partner).toContain("partner");
    expect(LEVEL_ROLES["Vice President"]).not.toContain("partner");
    expect(LEVEL_ROLES["Senior Associate"]).not.toContain("partner");
  });
});

describe("authority resolution", () => {
  it("gives a person with no role and no profile no authority", () => {
    expect(resolveAuthority(none)).toEqual({ roles: [], permissions: [], legacyCapabilities: [], isSuperAdmin: false });
  });

  it("gives the Super Admin every platform permission and every legacy capability", () => {
    const owner = resolveAuthority({ ...none, ownerBridge: true, legacyAdmin: true });
    expect(owner.isSuperAdmin).toBe(true);
    expect(owner.roles).toEqual(["super_admin", "admin"]);
    expect(owner.permissions).toEqual([...PLATFORM_PERMISSIONS]);
    expect(owner.legacyCapabilities).toEqual([...ADMIN_PERMISSION_IDS]);
    const stored = resolveAuthority({ ...none, storedRoles: ["super_admin"] });
    expect(stored.isSuperAdmin).toBe(true);
    for (const permission of [...PLATFORM_PERMISSIONS, ...ADMIN_PERMISSION_IDS]) expect(authorityAllows(stored, permission)).toBe(true);
  });

  it("treats the legacy admin flag as the admin role, which grants nothing by itself", () => {
    const admin = resolveAuthority({ ...none, legacyAdmin: true });
    expect(admin.roles).toEqual(["admin"]);
    expect(admin.permissions).toEqual([]);
    expect(admin.legacyCapabilities).toEqual([]);
    expect(admin.isSuperAdmin).toBe(false);
  });

  it("lets a person hold several platform roles and unions what they grant", () => {
    const both = resolveAuthority({ ...none, storedRoles: ["partner", "finance"], legacyAdmin: true });
    expect(both.roles).toEqual(["admin", "partner", "finance"]);
    expect(both.permissions).toEqual(expect.arrayContaining(["view_assigned_businesses", "review_engagements", "manage_payments", "view_financials"]));
    expect(both.permissions).not.toContain("manage_roles");
  });

  it("grants only the matrix for each internal role", () => {
    for (const role of PLATFORM_ROLES) {
      const authority = resolveAuthority({ ...none, storedRoles: [role] });
      expect(authority.permissions, role).toEqual([...PLATFORM_PERMISSIONS].filter(permission => PLATFORM_ROLE_PERMISSIONS[role].includes(permission)));
    }
    expect(authorityAllows(resolveAuthority({ ...none, storedRoles: ["analyst"] }), "manage_roles")).toBe(false);
    expect(authorityAllows(resolveAuthority({ ...none, storedRoles: ["analyst"] }), "view_assigned_businesses")).toBe(true);
    expect(authorityAllows(resolveAuthority({ ...none, storedRoles: ["finance"] }), "manage_payments")).toBe(true);
  });

  it("gives a disabled or suspended person no authority at all, whatever they hold", () => {
    expect(resolveAuthority({ ...none, storedRoles: ["super_admin", "finance"], legacyAdmin: true, ownerBridge: true, legacyProfile: ["manage_payments"], active: false }))
      .toEqual({ roles: [], permissions: [], legacyCapabilities: [], isSuperAdmin: false });
  });
});

describe("legacy admin permission compatibility: one responsibility, one answer", () => {
  it("maps each legacy capability with a platform equivalent in both directions", () => {
    for (const [legacy, platform] of Object.entries(LEGACY_CAPABILITY_TO_PLATFORM)) {
      const fromProfile = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: [legacy as never] });
      expect(fromProfile.permissions).toContain(platform);
      expect(fromProfile.legacyCapabilities).toContain(legacy);
      expect(PLATFORM_TO_LEGACY_CAPABILITIES[platform!]).toContain(legacy);
    }
  });

  it("answers the same whether the responsibility comes from the legacy profile or from a platform role", () => {
    const viaProfile = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: ["manage_payments"] });
    const viaRole = resolveAuthority({ ...none, storedRoles: ["finance"] });
    for (const name of ["manage_payments"] as const) {
      expect(authorityAllows(viaProfile, name)).toBe(true);
      expect(authorityAllows(viaRole, name)).toBe(true);
    }
    // The platform communications permission grants the legacy "view communications" capability, not the reverse.
    const desk = resolveAuthority({ ...none, storedRoles: ["desk_lead"] });
    expect(authorityAllows(desk, "view_communications")).toBe(true);
    const legacyOnly = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: ["view_communications"] });
    expect(authorityAllows(legacyOnly, "manage_communications")).toBe(false);
  });

  it("keeps legacy participant capabilities governed by the legacy profile and the Super Admin only", () => {
    const participantOnly = ["view_participants", "view_assessments", "decide_applications", "manage_cohorts", "view_documents", "manage_documents", "manage_portal_access"] as const;
    const everyRole = PLATFORM_ROLES.filter(role => role !== "super_admin");
    for (const role of everyRole) {
      const authority = resolveAuthority({ ...none, storedRoles: [role], legacyAdmin: true });
      for (const capability of participantOnly) expect(authorityAllows(authority, capability), `${role} ${capability}`).toBe(false);
    }
    const granted = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: ["view_participants"] });
    expect(authorityAllows(granted, "view_participants")).toBe(true);
    expect(authorityAllows(granted, "view_assessments")).toBe(false);
  });

  it("never lets one source remove what another grants: authority only grows when a source is added", () => {
    const base = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: ["manage_scheduling"] });
    const more = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: ["manage_scheduling"], storedRoles: ["analyst"] });
    for (const permission of base.permissions) expect(more.permissions).toContain(permission);
    for (const capability of base.legacyCapabilities) expect(more.legacyCapabilities).toContain(capability);
  });

  it("only admin identity from the profile is not enough on its own to be Super Admin", () => {
    const everything = resolveAuthority({ ...none, legacyAdmin: true, legacyProfile: [...ADMIN_PERMISSION_IDS] });
    expect(everything.isSuperAdmin).toBe(false);
    expect(authorityAllows(everything, "manage_roles")).toBe(false);
    expect(authorityAllows(everything, "manage_admins")).toBe(false);
  });
});

describe("business capabilities", () => {
  it("lets owners do everything, business admins edit and manage members, and members only view", () => {
    expect([...BUSINESS_ROLE_CAPABILITIES.owner]).toEqual([...BUSINESS_CAPABILITIES]);
    expect(canViewBusiness("owner") && canViewBusiness("business_admin") && canViewBusiness("member")).toBe(true);
    expect(canEditBusiness("owner")).toBe(true);
    expect(canEditBusiness("business_admin")).toBe(true);
    expect(canEditBusiness("member")).toBe(false);
    expect(canManageBusinessMembers("owner")).toBe(true);
    expect(canManageBusinessMembers("business_admin")).toBe(true);
    expect(canManageBusinessMembers("member")).toBe(false);
    expect(businessRoleCan("business_admin", "invite_team_members")).toBe(false);
    expect(businessRoleCan("business_admin", "manage_billing")).toBe(false);
    expect(businessRoleCan("member", "view_business_dashboard")).toBe(true);
  });

  it("defines capabilities for every business role", () => {
    expect(Object.keys(BUSINESS_ROLE_CAPABILITIES).sort()).toEqual([...BUSINESS_MEMBERSHIP_ROLES].sort());
  });
});

describe("granting by seniority", () => {
  const authority = (roles: Array<(typeof PLATFORM_ROLES)[number]>, isSuperAdmin = false) => ({ roles, isSuperAdmin });

  it("lets a Super Admin give any role, and everyone else only roles below their own", () => {
    for (const role of PLATFORM_ROLES) expect(canGrantRole(authority(["super_admin"], true), role)).toBe(true);
    expect(canGrantRole(authority(["admin"]), "admin")).toBe(false);
    expect(canGrantRole(authority(["admin"]), "super_admin")).toBe(false);
    expect(canGrantRole(authority(["admin"]), "desk_lead")).toBe(true);
    expect(canGrantRole(authority(["admin"]), "subject_matter_expert")).toBe(true);
    expect(canGrantRole(authority(["desk_lead"]), "partner")).toBe(false);
    expect(canGrantRole(authority(["desk_lead"]), "analyst")).toBe(true);
    expect(canGrantRole(authority(["analyst", "desk_lead"]), "finance")).toBe(true);
    expect(canGrantRole(authority(["subject_matter_expert"]), "subject_matter_expert")).toBe(false);
    expect(canGrantRole(authority([]), "subject_matter_expert")).toBe(false);
  });

  it("ranks every role, with Super Admin above Admin above everyone else", () => {
    expect(Object.keys(PLATFORM_ROLE_RANK).sort()).toEqual([...PLATFORM_ROLES].sort());
    const others = PLATFORM_ROLES.filter(role => role !== "super_admin" && role !== "admin");
    for (const role of others) expect(PLATFORM_ROLE_RANK[role]).toBeLessThan(PLATFORM_ROLE_RANK.admin);
    expect(PLATFORM_ROLE_RANK.admin).toBeLessThan(PLATFORM_ROLE_RANK.super_admin);
  });

  it("requires two-step sign-in for anyone with an internal role, and an end date for a specialist", () => {
    expect(requiresTwoStep({ roles: [] })).toBe(false);
    for (const role of PLATFORM_ROLES) expect(requiresTwoStep({ roles: [role] })).toBe(true);
    expect(ROLES_REQUIRING_END_DATE).toEqual(["subject_matter_expert"]);
  });
});
