import { adminAccessAuditEvents } from "../drizzle/schema";
import type { Database } from "./accountAuth";

/**
 * Every action the audit log records. test/docs/productDocs.test.ts fails if the server records one that is not listed
 * here, or if one listed here is missing from the audit table in docs/product/05-backend-schema.md.
 */
export const AUDIT_ACTIONS = [
  "account_signed_in",
  "account_signed_out",
  "account_sign_in_failed",
  "account_sign_in_locked",
  "admin_sign_in_refused",
  "owner_password_enrolled",
  "admin_password_reset_requested",
  "admin_password_reset_completed",
  "business_check_call_scheduled",
  "business_check_call_booked",
  "business_check_call_outcome",
  "debrief_saved",
  "debrief_shared",
  "business_check_stage_changed",
  "payment_details_sent",
  // Retired: proof uploads were replaced by Paystack (kept so older log rows still read).
  "payment_proof_received",
  "payment_confirmed",
  "payment_confirmation_sent",
  "payment_online_refused",
  "full_report_link_sent",
  "full_report_delivered",
  "client_onboarding_invitation_created",
  "client_onboarding_invitation_revoked",
  "owner_credential_bootstrapped",
  "owner_credential_reset",
  "workspace_switched",
  "business_profile_updated",
  "account_profile_updated",
  "account_password_changed",
  "account_password_reset_issued",
  "account_password_reset_requested",
  "account_password_reset_completed",
  "account_suspended",
  "account_reinstated",
  "platform_role_granted",
  "platform_role_revoked",
  "staff_level_set",
  "staff_whatsapp_set",
  "engagement_started",
  "engagement_team_assigned",
  "engagement_team_removed",
  "engagement_stage_changed",
  "engagement_notes_shared",
  "engagement_session_held",
  "engagement_session_booked",
  "engagement_deliverable_approved",
  "engagement_deliverable_shared",
  "engagement_deliverable_accepted",
  "engagement_task_answered",
  "engagement_request_sent",
  "engagement_task_handed_in",
  "engagement_items_assigned",
  "engagement_task_owners_set",
  "engagement_task_reviewed",
  "engagement_task_reviewer_set",
  "engagement_follow_up_shared",
  "reminders_run",
  "engagement_meeting_booked",
  "engagement_audience_changed",
  "engagement_room_previewed",
  "engagement_content_saved",
  "engagement_content_deleted",
  "engagement_content_approved",
  "engagement_content_changes_requested",
  "service_requested",
  "service_request_handled",
  "engagement_fees_saved",
  "engagement_fee_paid_online",
  "engagement_fee_online_refused",
  "engagement_fee_link_sent",
  "engagement_fees_dated_on_delivery",
  "engagement_room_opened",
  "engagement_plan_updated",
  "engagement_fee_timing_set",
  "team_view_previewed",
  // The payments ledger (batch F): money recorded by hand by Finance or the Super Admin, cancelled when recorded by
  // mistake, and a Paystack payment that needed a look accepted.
  "fee_payment_recorded",
  "fee_payment_cancelled",
  "payment_accepted",
  // Refunds and write-offs (batch F2): a refund recorded against its payment, or cancelled when recorded by mistake;
  // what is left of a fee written off by a Partner or the Super Admin, and a write-off reversed.
  "payment_refund_recorded",
  "payment_refund_cancelled",
  "fee_written_off",
  "fee_write_off_reversed",
  // Alerts (batch G3, R42): a Paystack notification the server could not process, told to the office once per
  // reference; an email that did not arrive, marked dealt with in Pipeline.
  "paystack_webhook_failed",
  "email_failure_dealt_with",
  // Retired with the ledger (batch F): the Paid tick. No longer written, kept so older log rows still read.
  "engagement_fee_paid",
  // Retired with proposals (ET, 6 November 2026): no longer written, kept so older log rows still read.
  "engagement_agreement_saved",
  "engagement_agreement_sent",
  "engagement_agreement_revised",
  "engagement_agreement_accepted",
  "engagement_data_request_loaded",
  "account_invitation_created",
  "account_invitation_revoked",
  "account_invitation_accepted",
  "business_member_removed",
  "engagement_file_uploaded",
  "engagement_file_shared",
  "engagement_file_matched",
  "engagement_file_dropped",
  "engagement_file_removed",
  "engagement_measure_saved",
  "engagement_checkin_recorded",
  "two_step_setup_started",
  "two_step_challenge_issued",
  "two_step_failed",
  "two_step_enabled",
  "two_step_recovery_code_used",
  "two_step_reset",
  "access_removed",
  "security_alert",
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
