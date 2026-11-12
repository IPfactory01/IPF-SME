import { describe, expect, it } from "vitest";
import { isTeamHome } from "@/lib/adminSections";
import { PLATFORM_ROLE_PERMISSIONS } from "@shared/platformPermissions";

const as = (role: keyof typeof PLATFORM_ROLE_PERMISSIONS) => ({ permissions: [], platformPermissions: PLATFORM_ROLE_PERMISSIONS[role] });

/** Who signs in to the team's home rather than the console (R83). Presentation only: the server decides access. */
describe("the team's home", () => {
  it("is for those who work only on their own projects: Analysts, Specialists and Partners", () => {
    expect(isTeamHome(as("analyst"))).toBe(true);
    expect(isTeamHome(as("subject_matter_expert"))).toBe(true);
    // A Partner also sees Finance, which the home holds as a second tab.
    expect(isTeamHome(as("partner"))).toBe(true);
  });

  it("is not for the desk, Finance alone, an admin with other work, or the Super Admin", () => {
    expect(isTeamHome(as("desk_lead"))).toBe(false);
    expect(isTeamHome(as("finance"))).toBe(false);
    expect(isTeamHome({ permissions: ["manage_client_onboarding"], platformPermissions: ["manage_client_onboarding", "view_assigned_businesses"] })).toBe(false);
    expect(isTeamHome({ isSuperAdmin: true, permissions: [] })).toBe(false);
    expect(isTeamHome({ permissions: [], platformPermissions: [] })).toBe(false);
    expect(isTeamHome(undefined)).toBe(false);
  });
});
