import { adminAccessAuditEvents } from "../drizzle/schema";
import type { Database } from "./accountAuth";

export const AUDIT_ACTIONS = [
  "account_signed_in",
  "account_signed_out",
  "account_sign_in_failed",
  "account_sign_in_locked",
  "admin_sign_in_refused",
  "business_check_call_scheduled",
  "business_check_call_booked",
  "business_check_call_outcome",
  "business_check_stage_changed",
  "payment_details_sent",
  "payment_proof_received",
  "payment_confirmed",
  "full_report_link_sent",
  "full_report_delivered",
  "owner_credential_bootstrapped",
  "owner_credential_reset",
  "workspace_switched",
  "business_profile_updated",
  "account_profile_updated",
  "account_password_changed",
  "platform_role_granted",
  "platform_role_revoked",
  "engagement_started",
  "engagement_team_assigned",
  "engagement_team_removed",
  "engagement_stage_changed",
  "engagement_notes_shared",
  "engagement_deliverable_approved",
  "engagement_deliverable_shared",
  "engagement_deliverable_accepted",
  "engagement_task_answered",
  "engagement_audience_changed",
  "account_invitation_created",
  "account_invitation_revoked",
  "account_invitation_accepted",
  "business_member_removed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Appends to the existing administrative audit log (`admin_access_audit_events`). Details are small, structured and
 * never contain passwords, tokens, hashes or invitation links: callers pass identifiers and field names only.
 */
export async function recordAudit(
  db: Pick<Database, "insert">,
  event: { action: AuditAction | (string & {}); actorUserId?: number | null; targetEmail?: string | null; details?: Record<string, unknown> },
) {
  await db.insert(adminAccessAuditEvents).values({
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    targetEmail: event.targetEmail ? event.targetEmail.slice(0, 320) : null,
    details: event.details ? JSON.stringify(event.details) : null,
  });
}
