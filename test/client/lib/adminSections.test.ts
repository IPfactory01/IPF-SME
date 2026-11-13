import { describe, expect, it } from "vitest";
import { isTeamHome, visibleAdminSections } from "@/lib/adminSections";
import { PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";

const as = (role: keyof typeof PLATFORM_ROLE_PERMISSIONS) => ({ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS[role] });

/**
 * Everyone works in the team's home, in the client's room's frame: the console is retired, the Super Admins included
 * (ET, 13 November 2026). What differs by role is which places the home holds. Presentation only.
 */
describe("the team's home", () => {
  it("is everyone's /admin, the Super Admins and the desk included", () => {
    for (const role of ["analyst", "subject_matter_expert", "partner", "desk_lead", "finance"] as const) expect(isTeamHome(as(role))).toBe(true);
    expect(isTeamHome({ isSuperAdmin: true, permissions: [] })).toBe(true);
    expect(isTeamHome(undefined)).toBe(false);
  });

  it("holds the places each role has: a Specialist their projects, the desk Clients and Finance, a Super Admin everything", () => {
    const places = (access: Parameters<typeof visibleAdminSections>[0]) => visibleAdminSections(access).map(section => section.id);
    expect(places(as("subject_matter_expert"))).toEqual(["engagements"]);
    expect(places(as("partner"))).toEqual(["engagements", "finance"]);
    expect(places(as("desk_lead"))).toEqual(["engagements", "clients", "finance"]);
    expect(places({ isSuperAdmin: true, permissions: [] })).toEqual(["pipeline", "engagements", "clients", "finance", "team"]);
  });
});
