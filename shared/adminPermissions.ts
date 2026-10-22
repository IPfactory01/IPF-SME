import { BRAND } from "./brand";
export const ADMIN_PERMISSION_DEFINITIONS = [
  {
    id: "view_participants",
    label: "Review participant records",
    description: "View applications, contact details, business context, and programme pathway.",
  },
  {
    id: "view_assessments",
    label: "Review Business Reviews",
    description: "View saved diagnostic progress, answers, and available working-report context.",
  },
  {
    id: "decide_applications",
    label: "Make application decisions",
    description: "Accept, reject, or waitlist applications. Archiving remains a Super Admin safeguard.",
  },
  {
    id: "manage_payments",
    label: "Update payment milestones",
    description: "Record verified deposits and instalment status. This does not process or move money.",
  },
  {
    id: "manage_cohorts",
    label: "Manage cohort placement",
    description: "Assign participants to the appropriate programme group after review.",
  },
  {
    id: "view_documents",
    label: "Review supporting documents",
    description: "View participant uploads and engagement materials already held in the portal.",
  },
  {
    id: "manage_documents",
    label: "Manage participant materials",
    description: "Upload or maintain briefs and programme materials for participants. This does not remove participant-uploaded evidence.",
  },
  {
    id: "manage_scheduling",
    label: "Manage scheduling",
    description: "Review availability and manage programme session slots. Booking safeguards remain enforced.",
  },
  {
    id: "view_communications",
    label: "Review communication history",
    description: `Read the recorded email history for participant context. ${BRAND.facilitatorFirstName} retains approval and sending authority.`,
  },
  {
    id: "manage_client_onboarding",
    label: "Invite clients to onboard",
    description: "Send a client the secure onboarding link that creates their account and business workspace, and revoke unused links. Only for clients who have reached onboarding.",
  },
  {
    id: "manage_portal_access",
    label: "Manage portal access",
    description: "Replace a participant’s private portal link when access needs to be reset.",
  },
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSION_DEFINITIONS)[number]["id"];

export const ADMIN_PERMISSION_IDS = ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.id) as AdminPermission[];

export function isAdminPermission(value: string): value is AdminPermission {
  return ADMIN_PERMISSION_IDS.includes(value as AdminPermission);
}

export function parseAdminPermissions(value: string | null | undefined): AdminPermission[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((entry): entry is string => typeof entry === "string").filter(isAdminPermission)));
  } catch {
    return [];
  }
}

export function serializeAdminPermissions(permissions: readonly AdminPermission[]): string {
  return JSON.stringify(Array.from(new Set(permissions)).filter(isAdminPermission));
}
