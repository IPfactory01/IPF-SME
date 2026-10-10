import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, date, index, integer, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { PIPELINE_STAGES } from "../shared/businessCheck/pipeline";
import { PAYMENT_ITEMS, PAYMENT_STATUSES } from "../shared/payments";
import {
  CLIENT_ACCESS_LEVELS,
  ENGAGEMENT_AUDIENCES,
  ENGAGEMENT_DELIVERABLE_KINDS,
  ENGAGEMENT_DELIVERABLE_STATUSES,
  ENGAGEMENT_SESSION_KINDS,
  ENGAGEMENT_SESSION_STATUSES,
  ENGAGEMENT_STAGES,
  ENGAGEMENT_TASK_KINDS,
  ENGAGEMENT_TASK_SIDES,
  ENGAGEMENT_TASK_FACTORS,
  ENGAGEMENT_TASK_STATUSES,
  ENGAGEMENT_TEAM_ROLES,
} from "../shared/engagement";

/**
 * Users provisioned through Manus OAuth. The live database is authoritative;
 * this model mirrors it exactly so role-gated admin access remains reliable.
 */
export const usersRoleEnum = pgEnum("users_role", ["user", "admin"]);
export const usersStatusEnum = pgEnum("users_status", ["active", "suspended", "disabled"]);

/**
 * The universal human identity. Historically this held platform OAuth users; password accounts (shared/auth.ts)
 * live in the same table so there is one identity per person. `openId` is the external-identity key: for a
 * password account it is a generated `local:<uuid>`. `role` stays the legacy user/admin flag that gates the
 * existing admin area; it is NOT a business role and not the future platform-role system.
 * Email is unique case-insensitively. Business data never lives here.
 */
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: usersRoleEnum("role").default("user").notNull(),
  status: usersStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`)]);

/** Password credential for a universal account: one row per user. */
export const userCredentials = pgTable("user_credentials", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  failedAttempts: integer("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

/** Server-side sessions. Only the SHA-256 of the cookie token is stored. */
export const userSessions = pgTable("user_sessions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  /** The workspace chosen for this session. Always re-verified against an active membership; never trusted as proof of access. */
  activeBusinessId: integer("activeBusinessId").references((): AnyPgColumn => businesses.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const userPlatformRolesRoleEnum = pgEnum("user_platform_roles_role", ["super_admin", "admin", "desk_lead", "analyst", "partner", "subject_matter_expert", "finance"]);

/**
 * Internal IPF responsibilities, separate from business membership. A person may hold several roles, with or without
 * any business membership. What a role grants is defined in shared/platformPermissions.ts, not here. The legacy
 * `users.role` flag and the owner-email Super Admin bridge are folded in when authority is resolved, so these rows are
 * the long-term source of role identity without removing the legacy ones.
 */
export const userPlatformRoles = pgTable("user_platform_roles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: userPlatformRolesRoleEnum("role").notNull(),
  grantedByUserId: integer("grantedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [unique("user_platform_roles_user_role_unique").on(table.userId, table.role), index("user_platform_roles_role_idx").on(table.role)]);

export const businessesStatusEnum = pgEnum("businesses_status", ["active", "suspended", "archived"]);

/**
 * A business is a workspace, separate from any person. It will own client-facing engagement data
 * (User -> membership -> Business -> Engagement -> diagnostics, measures, check-ins, files).
 * Signup requires only `name`; the nullable profile fields are completed later.
 */
export const businesses = pgTable("businesses", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  status: businessesStatusEnum("status").default("active").notNull(),
  createdByUserId: integer("createdByUserId").notNull().references(() => users.id),
  description: text("description"),
  yearFounded: integer("yearFounded"),
  logoUrl: varchar("logoUrl", { length: 1024 }),
  sector: varchar("sector", { length: 128 }),
  website: varchar("website", { length: 512 }),
  staffBand: varchar("staffBand", { length: 64 }),
  revenueBand: varchar("revenueBand", { length: 64 }),
  country: varchar("country", { length: 64 }),
  state: varchar("state", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export const businessMembershipsRoleEnum = pgEnum("business_memberships_role", ["owner", "business_admin", "member"]);
export const businessMembershipsStatusEnum = pgEnum("business_memberships_status", ["active", "invited", "suspended", "removed"]);

/** Many-to-many link between users and businesses. Business roles are independent of platform roles. */
export const businessMemberships = pgTable("business_memberships", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessId: integer("businessId").notNull().references(() => businesses.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: businessMembershipsRoleEnum("role").default("member").notNull(),
  status: businessMembershipsStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [unique("business_memberships_business_user_unique").on(table.businessId, table.userId), index("business_memberships_user_idx").on(table.userId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** A second, JUMP-specific password factor for an already verified administrator identity. */
export const adminCredentials = pgTable("admin_credentials", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  failedAttempts: integer("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type AdminCredential = typeof adminCredentials.$inferSelect;

/** Owner-selected capabilities for a verified administrator. The Super Admin is intentionally not represented here. */
export const adminPermissionProfiles = pgTable("admin_permission_profiles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull().unique(),
  permissionsJson: text("permissionsJson").notNull(),
  updatedByUserId: integer("updatedByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type AdminPermissionProfile = typeof adminPermissionProfiles.$inferSelect;

/** Short-lived, revocable server-side sessions created after the JUMP admin password is verified. */
export const adminAccessSessions = pgTable("admin_access_sessions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminAccessSession = typeof adminAccessSessions.$inferSelect;

/** Single-use password-reset credentials. Only a token hash is retained; reset links themselves are never stored. */
export const adminPasswordResetTokensDeliveryStatusEnum = pgEnum("admin_password_reset_tokens_delivery_status", ["Sent", "Failed", "Simulated"]);

export const adminPasswordResetTokens = pgTable("admin_password_reset_tokens", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  deliveryStatus: adminPasswordResetTokensDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  deliveryMessageId: varchar("deliveryMessageId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminPasswordResetToken = typeof adminPasswordResetTokens.$inferSelect;

/** Email-bound, expiring invitations for additional JUMP administrators. */
export const adminInvitationsStatusEnum = pgEnum("admin_invitations_status", ["Pending", "Accepted", "Revoked", "Expired"]);
export const adminInvitationsDeliveryStatusEnum = pgEnum("admin_invitations_delivery_status", ["Sent", "Failed", "Simulated"]);

export const adminInvitations = pgTable("admin_invitations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: varchar("email", { length: 320 }).notNull(),
  inviteeName: varchar("inviteeName", { length: 255 }),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  status: adminInvitationsStatusEnum("status").default("Pending").notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  acceptedByUserId: integer("acceptedByUserId"),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
  deliveryStatus: adminInvitationsDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  deliveryMessageId: varchar("deliveryMessageId", { length: 255 }),
  /** Immutable proposed capability set selected by Emmanuel when the invitation is issued. */
  proposedPermissionsJson: text("proposedPermissionsJson"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type AdminInvitation = typeof adminInvitations.$inferSelect;

/** Append-only access-management audit events for invitations, role changes, and password enrolment. */
export const adminAccessAuditEvents = pgTable("admin_access_audit_events", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  actorUserId: integer("actorUserId"),
  action: varchar("action", { length: 128 }).notNull(),
  targetEmail: varchar("targetEmail", { length: 320 }),
  details: text("details"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type AdminAccessAuditEvent = typeof adminAccessAuditEvents.$inferSelect;

/** Email audit log for automated and manually triggered communications. */
export const emailLogsStatusEnum = pgEnum("email_logs_status", ["Sent", "Failed", "Simulated"]);

export const emailLogs = pgTable("email_logs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: emailLogsStatusEnum("status").default("Sent").notNull(),
  sentAt: timestamp("sentAt", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

/** Participant replies retrieved from the dedicated JUMP mailbox; never exposed outside authorised administration. */
export const inboundEmailRepliesStatusEnum = pgEnum("inbound_email_replies_status", ["New", "Reviewed", "Follow-up", "Closed"]);

export const inboundEmailReplies = pgTable("inbound_email_replies", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  mailboxMessageId: varchar("mailboxMessageId", { length: 255 }).notNull().unique(),
  mailboxThreadId: varchar("mailboxThreadId", { length: 255 }),
  senderEmail: varchar("senderEmail", { length: 320 }).notNull(),
  senderName: varchar("senderName", { length: 255 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  preview: text("preview").notNull(),
  body: text("body").notNull(),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).notNull(),
  status: inboundEmailRepliesStatusEnum("status").default("New").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type InboundEmailReply = typeof inboundEmailReplies.$inferSelect;

/** Pricing enquiries requested from public sign-up or an authenticated participant portal. */
export const pricingRequestsSourceEnum = pgEnum("pricing_requests_source", ["Public", "ParticipantPortal"]);
export const pricingRequestsNotificationStatusEnum = pgEnum("pricing_requests_notification_status", ["Sent", "Failed", "Simulated"]);

export const pricingRequests = pgTable("pricing_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId"),
  source: pricingRequestsSourceEnum("source").notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  businessName: varchar("businessName", { length: 255 }),
  preferredPackage: varchar("preferredPackage", { length: 64 }),
  note: text("note"),
  notificationStatus: pricingRequestsNotificationStatusEnum("notificationStatus").default("Sent").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type PricingRequest = typeof pricingRequests.$inferSelect;

/** Applicant registrations and their onboarding, payment, and diagnostic state. */
export const registrationsBusinessModelEnum = pgEnum("registrations_business_model", ["Maker", "Trader", "Expert"]);
export const registrationsPackageEnum = pgEnum("registrations_package", ["Foundation", "Engine Room", "Boardroom"]);
export const registrationsStatusEnum = pgEnum("registrations_status", ["Pending", "Accepted", "Rejected", "Waitlisted"]);
export const registrationsCohortGroupEnum = pgEnum("registrations_cohort_group", ["Unassigned", "Makers", "Traders", "Experts"]);
export const registrationsDepositPaidEnum = pgEnum("registrations_deposit_paid", ["Pending", "Paid"]);
export const registrationsInstalment1Enum = pgEnum("registrations_instalment1", ["Pending", "Paid"]);
export const registrationsInstalment2Enum = pgEnum("registrations_instalment2", ["Pending", "Paid"]);

export const registrations = pgTable("registrations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  businessDescription: text("businessDescription").notNull(),
  businessModel: registrationsBusinessModelEnum("businessModel").notNull(),
  package: registrationsPackageEnum("package").notNull(),
  question: text("question"),
  status: registrationsStatusEnum("status").default("Pending").notNull(),
  cohortGroup: registrationsCohortGroupEnum("cohortGroup").default("Unassigned").notNull(),
  depositPaid: registrationsDepositPaidEnum("depositPaid").default("Pending").notNull(),
  instalment1: registrationsInstalment1Enum("instalment1").default("Pending").notNull(),
  instalment2: registrationsInstalment2Enum("instalment2").default("Pending").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
  bookingToken: varchar("bookingToken", { length: 64 }),
  diagnosticData: text("diagnosticData"),
  diagnosticStage: varchar("diagnosticStage", { length: 64 }),
  diagnosticEngineRoom: varchar("diagnosticEngineRoom", { length: 128 }),
  diagnosticClasses: varchar("diagnosticClasses", { length: 255 }),
  /** Points to the retained highest-pathway registration when an earlier pathway entry is superseded. */
  supersededByRegistrationId: integer("supersededByRegistrationId"),
  /** Non-destructive removal from the active owner desk; the original engagement record remains intact. */
  archivedAt: timestamp("archivedAt", { withTimezone: true }),
  archivedByUserId: integer("archivedByUserId"),
});

export type Registration = typeof registrations.$inferSelect;
export type InsertRegistration = typeof registrations.$inferInsert;

/** One private, non-guessable share code per canonical JUMP participant. */
export const participantReferralProfiles = pgTable("participant_referral_profiles", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull().unique(),
  referralCode: varchar("referralCode", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantReferralProfile = typeof participantReferralProfiles.$inferSelect;

/** A referral attribution and owner-reviewed credit decision; programme balances are never changed automatically. */
export const participantReferralsStatusEnum = pgEnum("participant_referrals_status", ["Registered", "Qualified", "Approved", "Declined"]);

export const participantReferrals = pgTable("participant_referrals", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  referrerRegistrationId: integer("referrerRegistrationId").notNull(),
  referredRegistrationId: integer("referredRegistrationId").notNull().unique(),
  referralCode: varchar("referralCode", { length: 64 }).notNull(),
  status: participantReferralsStatusEnum("status").default("Registered").notNull(),
  creditPercentage: integer("creditPercentage").default(0).notNull(),
  reviewedByUserId: integer("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ParticipantReferral = typeof participantReferrals.$inferSelect;

/**
 * Programme-level record derived from a registration. The original registration is preserved
 * as a JSON snapshot so future diagnostic phases can pre-fill rather than re-ask it.
 */
export const participantProgrammeRecordsPaymentStructureEnum = pgEnum("participant_programme_records_payment_structure", ["instalments_40_30_30", "full_upfront_10pc_discount"]);
export const participantProgrammeRecordsPaymentMethodEnum = pgEnum("participant_programme_records_payment_method", ["bank_transfer", "paystack", "wants_to_discuss"]);
export const participantProgrammeRecordsPaymentStatusEnum = pgEnum("participant_programme_records_payment_status", ["awaiting", "partial", "complete"]);

export const participantProgrammeRecords = pgTable("participant_programme_records", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull().unique(),
  registrationSnapshot: text("registrationSnapshot").notNull(),
  paymentStructure: participantProgrammeRecordsPaymentStructureEnum("paymentStructure"),
  paymentMethod: participantProgrammeRecordsPaymentMethodEnum("paymentMethod"),
  paymentStatus: participantProgrammeRecordsPaymentStatusEnum("paymentStatus").default("awaiting").notNull(),
  currentPhase: integer("currentPhase").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ParticipantProgrammeRecord = typeof participantProgrammeRecords.$inferSelect;
export type InsertParticipantProgrammeRecord = typeof participantProgrammeRecords.$inferInsert;

/** Immutable audit history for participant tracker states; records are appended, never replaced. */
export const participantProgrammeMilestoneEventsStatusEnum = pgEnum("participant_programme_milestone_events_status", ["locked", "available", "in_progress", "complete"]);
export const participantProgrammeMilestoneEventsSourceEnum = pgEnum("participant_programme_milestone_events_source", ["system", "participant", "admin"]);

export const participantProgrammeMilestoneEvents = pgTable("participant_programme_milestone_events", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  programmeRecordId: integer("programmeRecordId").notNull(),
  phase: integer("phase").notNull(),
  milestone: varchar("milestone", { length: 128 }).notNull(),
  status: participantProgrammeMilestoneEventsStatusEnum("status").notNull(),
  source: participantProgrammeMilestoneEventsSourceEnum("source").default("system").notNull(),
  recordedAt: timestamp("recordedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantProgrammeMilestoneEvent = typeof participantProgrammeMilestoneEvents.$inferSelect;
export type InsertParticipantProgrammeMilestoneEvent = typeof participantProgrammeMilestoneEvents.$inferInsert;

/** Bookable programme session slots. */
export const scheduleSlotsKindEnum = pgEnum("schedule_slots_kind", ["Decide", "Learn", "Apply"]);
export const scheduleSlotsStatusEnum = pgEnum("schedule_slots_status", ["Open", "Booked", "Blocked"]);

export const scheduleSlots = pgTable("schedule_slots", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  kind: scheduleSlotsKindEnum("kind").notNull(),
  sessionNumber: integer("sessionNumber").default(1).notNull(),
  startAt: timestamp("startAt", { withTimezone: true }).notNull(),
  endAt: timestamp("endAt", { withTimezone: true }).notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Africa/Lagos").notNull(),
  capacity: integer("capacity").default(1).notNull(),
  bookedCount: integer("bookedCount").default(0).notNull(),
  status: scheduleSlotsStatusEnum("status").default("Open").notNull(),
  googleCalendarEventId: varchar("googleCalendarEventId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type InsertScheduleSlot = typeof scheduleSlots.$inferInsert;

/** Participant reservations against programme session slots. */
export const scheduleBookingsKindEnum = pgEnum("schedule_bookings_kind", ["Decide", "Learn", "Apply"]);
export const scheduleBookingsStatusEnum = pgEnum("schedule_bookings_status", ["Confirmed", "Cancelled"]);
export const scheduleBookingsCalendarStatusEnum = pgEnum("schedule_bookings_calendar_status", ["Created", "Pending", "Failed", "NotConfigured"]);

export const scheduleBookings = pgTable("schedule_bookings", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  slotId: integer("slotId").notNull(),
  kind: scheduleBookingsKindEnum("kind").notNull(),
  status: scheduleBookingsStatusEnum("status").default("Confirmed").notNull(),
  calendarStatus: scheduleBookingsCalendarStatusEnum("calendarStatus").default("NotConfigured").notNull(),
  googleCalendarEventId: varchar("googleCalendarEventId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ScheduleBooking = typeof scheduleBookings.$inferSelect;
export type InsertScheduleBooking = typeof scheduleBookings.$inferInsert;

/** Durable audit and deduplication record for automated session reminders. */
export const scheduledReminderDeliveriesReminderTypeEnum = pgEnum("scheduled_reminder_deliveries_reminder_type", ["24h"]);
export const scheduledReminderDeliveriesStatusEnum = pgEnum("scheduled_reminder_deliveries_status", ["Pending", "Sent", "Failed"]);

export const scheduledReminderDeliveries = pgTable("scheduled_reminder_deliveries", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  bookingId: integer("bookingId").notNull(),
  reminderType: scheduledReminderDeliveriesReminderTypeEnum("reminderType").notNull(),
  deliveryKey: varchar("deliveryKey", { length: 255 }).notNull().unique(),
  status: scheduledReminderDeliveriesStatusEnum("status").default("Pending").notNull(),
  emailLogId: integer("emailLogId"),
  attemptedAt: timestamp("attemptedAt", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sentAt", { withTimezone: true }),
  errorMessage: text("errorMessage"),
});

export type ScheduledReminderDelivery = typeof scheduledReminderDeliveries.$inferSelect;
export type InsertScheduledReminderDelivery = typeof scheduledReminderDeliveries.$inferInsert;

/** Engagement briefs uploaded by an administrator for an individual participant. */
export const participantBriefs = pgTable("participant_briefs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 64 }).default("pdf").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ParticipantBrief = typeof participantBriefs.$inferSelect;
export type InsertParticipantBrief = typeof participantBriefs.$inferInsert;

/** Immutable participant acknowledgements of a versioned personalised portal brief. */
export const participantEngagementConsentsPackageNameEnum = pgEnum("participant_engagement_consents_package_name", ["Foundation", "Engine Room", "Boardroom"]);
export const participantEngagementConsentsConfirmationEmailStatusEnum = pgEnum("participant_engagement_consents_confirmation_email_status", ["Sent", "Failed", "Simulated"]);

export const participantEngagementConsents = pgTable("participant_engagement_consents", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  briefVersion: varchar("briefVersion", { length: 32 }).notNull(),
  packageName: participantEngagementConsentsPackageNameEnum("packageName").notNull(),
  consentStatement: text("consentStatement").notNull(),
  acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }).notNull(),
  confirmationEmailStatus: participantEngagementConsentsConfirmationEmailStatusEnum("confirmationEmailStatus").default("Simulated").notNull(),
  confirmationEmailMessageId: varchar("confirmationEmailMessageId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantEngagementConsent = typeof participantEngagementConsents.$inferSelect;
export type InsertParticipantEngagementConsent = typeof participantEngagementConsents.$inferInsert;

/** Hashed single-use email-authentication tokens and participant browser sessions. */
export const participantAuthTokensPurposeEnum = pgEnum("participant_auth_tokens_purpose", ["magic_link", "session"]);

export const participantAuthTokens = pgTable("participant_auth_tokens", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  purpose: participantAuthTokensPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantAuthToken = typeof participantAuthTokens.$inferSelect;
export type InsertParticipantAuthToken = typeof participantAuthTokens.$inferInsert;

/** Password credentials for a JUMP participant. Plaintext passwords are never retained. */
export const participantCredentials = pgTable("participant_credentials", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  failedAttempts: integer("failedAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ParticipantCredential = typeof participantCredentials.$inferSelect;

/** Short-lived, single-use links used only to set or reset a participant password. */
export const participantPasswordTokensPurposeEnum = pgEnum("participant_password_tokens_purpose", ["setup", "reset"]);
export const participantPasswordTokensDeliveryStatusEnum = pgEnum("participant_password_tokens_delivery_status", ["Sent", "Failed", "Simulated"]);

export const participantPasswordTokens = pgTable("participant_password_tokens", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  purpose: participantPasswordTokensPurposeEnum("purpose").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  deliveryStatus: participantPasswordTokensDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  deliveryMessageId: varchar("deliveryMessageId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantPasswordToken = typeof participantPasswordTokens.$inferSelect;

/**
 * Durable personal portal URLs. Only a SHA-256 token hash is stored; replacing a
 * link revokes the previous bearer link and the participant's browser sessions.
 */
export const participantPortalLinks = pgTable("participant_portal_links", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull().unique(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantPortalLink = typeof participantPortalLinks.$inferSelect;
export type InsertParticipantPortalLink = typeof participantPortalLinks.$inferInsert;

/** Participant-uploaded assignments and completed work. */
export const participantAssignments = pgTable("participant_assignments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ParticipantAssignment = typeof participantAssignments.$inferSelect;
export type InsertParticipantAssignment = typeof participantAssignments.$inferInsert;

/** Participant-submitted proof of bank transfer. An owner decision is always required before payment is confirmed. */
export const participantPaymentReceiptsPaymentMilestoneEnum = pgEnum("participant_payment_receipts_payment_milestone", ["deposit", "instalment_1", "instalment_2", "full_upfront"]);
export const participantPaymentReceiptsStatusEnum = pgEnum("participant_payment_receipts_status", ["Submitted", "Confirmed", "Declined"]);

export const participantPaymentReceipts = pgTable("participant_payment_receipts", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  paymentMilestone: participantPaymentReceiptsPaymentMilestoneEnum("paymentMilestone").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 255 }).notNull(),
  participantNote: text("participantNote"),
  status: participantPaymentReceiptsStatusEnum("status").default("Submitted").notNull(),
  reviewedByUserId: integer("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true }),
  reviewNote: text("reviewNote"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ParticipantPaymentReceipt = typeof participantPaymentReceipts.$inferSelect;
export type InsertParticipantPaymentReceipt = typeof participantPaymentReceipts.$inferInsert;
/** Current State Assessment responses retained for each participant. */
export const currentStatusAssessmentsStatusEnum = pgEnum("current_status_assessments_status", ["Draft", "Submitted"]);

export const currentStatusAssessments = pgTable("current_status_assessments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  businessModelSummary: text("businessModelSummary"),
  currentRevenueStage: varchar("currentRevenueStage", { length: 100 }),
  primaryBottleNeck: text("primaryBottleNeck"),
  teamAndOperations: text("teamAndOperations"),
  financialVisibility: text("financialVisibility"),
  desiredSixMonthOutcome: text("desiredSixMonthOutcome"),
  additionalNotes: text("additionalNotes"),
  /** Versioned JSON state for the staged, tap-first diagnostic. Legacy fields remain intact for existing records. */
  structuredDiagnostic: text("structuredDiagnostic"),
  diagnosticVersion: integer("diagnosticVersion").default(1).notNull(),
  activeSection: varchar("activeSection", { length: 32 }),
  status: currentStatusAssessmentsStatusEnum("status").default("Draft").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type CurrentStatusAssessment = typeof currentStatusAssessments.$inferSelect;
export type InsertCurrentStatusAssessment = typeof currentStatusAssessments.$inferInsert;

/** AI-guided assessment conversation history. */
export const consultingChatMessagesSenderEnum = pgEnum("consulting_chat_messages_sender", ["ai", "participant"]);

export const consultingChatMessages = pgTable("consulting_chat_messages", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  sender: consultingChatMessagesSenderEnum("sender").notNull(),
  content: text("content").notNull(),
  topicTag: varchar("topicTag", { length: 100 }),
  structuredData: text("structuredData"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type ConsultingChatMessage = typeof consultingChatMessages.$inferSelect;
export type InsertConsultingChatMessage = typeof consultingChatMessages.$inferInsert;

/** AI-generated current-state assessment reports. */
export const consultingReportsStatusEnum = pgEnum("consulting_reports_status", ["Draft", "Ready"]);

export const consultingReports = pgTable("consulting_reports", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  registrationId: integer("registrationId").notNull(),
  summaryJson: text("summaryJson").notNull(),
  status: consultingReportsStatusEnum("status").default("Ready").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type ConsultingReport = typeof consultingReports.$inferSelect;
export type InsertConsultingReport = typeof consultingReports.$inferInsert;

/**
 * Completed business checks from the public site. Answers are stored as given (after cleaning);
 * the result is recomputed on the server so the outline can never be set by the browser.
 * publicToken lets the owner ask for the call or the full report without signing in.
 */
export const businessChecksRouteEnum = pgEnum("business_checks_route", ["advisory", "programme", "foundation", "idea"]);
export const businessChecksReadinessEnum = pgEnum("business_checks_readiness", ["advanced", "intermediate", "nascent"]);
export const businessChecksSummarySourceEnum = pgEnum("business_checks_summary_source", ["AI", "Rules"]);
export const businessChecksNotificationStatusEnum = pgEnum("business_checks_notification_status", ["Sent", "Failed", "Simulated"]);
export const businessChecksPipelineStageEnum = pgEnum("business_checks_pipeline_stage", PIPELINE_STAGES);

export const businessChecks = pgTable("business_checks", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  publicToken: varchar("publicToken", { length: 64 }).notNull().unique(),
  /** Commercial stage: lead (details given) → qualified_lead (check finished) → call_booked → … */
  pipelineStage: businessChecksPipelineStageEnum("pipelineStage").default("lead").notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 32 }),
  heardFrom: varchar("heardFrom", { length: 64 }),
  businessName: varchar("businessName", { length: 255 }),
  description: varchar("description", { length: 500 }),
  /** idea, side or operating; "unknown" until the owner answers the stage question. */
  stage: varchar("stage", { length: 16 }).notNull(),
  route: businessChecksRouteEnum("route"),
  readiness: businessChecksReadinessEnum("readiness"),
  primaryArea: integer("primaryArea"),
  /** Saved as the owner answers, so an unfinished check is still a lead with context. */
  answersJson: text("answersJson").notNull(),
  resultJson: text("resultJson"),
  summaryJson: text("summaryJson"),
  summarySource: businessChecksSummarySourceEnum("summarySource"),
  notificationStatus: businessChecksNotificationStatusEnum("notificationStatus").default("Simulated").notNull(),
  callRequestedAt: timestamp("callRequestedAt", { withTimezone: true }),
  /** When the team and the owner agreed the discovery call for (set by an administrator; callRequestedAt is the owner's request). */
  callScheduledFor: timestamp("callScheduledFor", { withTimezone: true }),
  reportRequestedAt: timestamp("reportRequestedAt", { withTimezone: true }),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

/**
 * The Debrief: the free call after the Business Check, written up by the analyst within the hour following the firm's
 * Client Debrief Meeting guide, cut to The Shift. One per business check. It informs the Work Plan and, once shared,
 * opens the owner's room warm: what we heard, the problem in their words, what success looks like, what they tried.
 */
export const debriefs = pgTable("debriefs", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessCheckId: integer("businessCheckId").notNull().unique().references(() => businessChecks.id, { onDelete: "cascade" }),
  heldAt: timestamp("heldAt", { withTimezone: true }),
  heard: text("heard"),
  problemInOwnerWords: text("problemInOwnerWords"),
  successLooksLike: text("successLooksLike"),
  tried: text("tried"),
  nextSteps: text("nextSteps"),
  capturedByUserId: integer("capturedByUserId").references(() => users.id),
  /** Set when the owner may see it in their room; null keeps it internal. */
  sharedAt: timestamp("sharedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type Debrief = typeof debriefs.$inferSelect;

export const clientOnboardingInvitationsStatusEnum = pgEnum("client_onboarding_invitations_status", ["pending", "accepted", "revoked", "expired"]);
export const clientOnboardingInvitationsDeliveryStatusEnum = pgEnum("client_onboarding_invitations_delivery_status", ["Sent", "Failed", "Simulated"]);

/**
 * How a client account is created: an authorised IPF user invites a prospect who already exists as a business check
 * (the front door). Accepting the invitation creates the user, credential, business, owner membership and session
 * in one transaction. Public self-registration does not exist. Only the SHA-256 of the token is stored; an
 * invitation is single-use, expiring, revocable and bound to `email`.
 * A prospect is not a user and not a business until the invitation is accepted.
 */
export const clientOnboardingInvitations = pgTable("client_onboarding_invitations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessCheckId: integer("businessCheckId").notNull().references(() => businessChecks.id),
  /** Normalised (lower-case) address the invitation is bound to. */
  email: varchar("email", { length: 320 }).notNull(),
  fullNameSnapshot: varchar("fullNameSnapshot", { length: 255 }).notNull(),
  businessNameSnapshot: varchar("businessNameSnapshot", { length: 255 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  status: clientOnboardingInvitationsStatusEnum("status").default("pending").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdByUserId: integer("createdByUserId").notNull().references(() => users.id),
  acceptedByUserId: integer("acceptedByUserId").references(() => users.id),
  /** The business created when the invitation was accepted. */
  businessId: integer("businessId").references(() => businesses.id),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  deliveryStatus: clientOnboardingInvitationsDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  deliveryMessageId: varchar("deliveryMessageId", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [
  // At most one live invitation per business check: issuing a new one revokes the previous.
  uniqueIndex("client_onboarding_invitations_one_pending_per_check").on(table.businessCheckId).where(sql`${table.status} = 'pending'`),
]);

export type ClientOnboardingInvitation = typeof clientOnboardingInvitations.$inferSelect;

export type BusinessCheck = typeof businessChecks.$inferSelect;
export type InsertBusinessCheck = typeof businessChecks.$inferInsert;

export const paymentRequestsItemEnum = pgEnum("payment_requests_item", PAYMENT_ITEMS);
export const paymentRequestsStatusEnum = pgEnum("payment_requests_status", PAYMENT_STATUSES);
export const paymentRequestsDeliveryStatusEnum = pgEnum("payment_requests_delivery_status", ["Sent", "Failed", "Simulated"]);

/**
 * A payment asked of a business check's owner, until online payment exists: payment details are emailed, the owner
 * pays by bank transfer and replies with proof, and the team confirms the money arrived (shared/payments.ts).
 * One row per business check and item; sending the details again updates it. A confirmed payment is never reopened.
 */
export const paymentRequests = pgTable("payment_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessCheckId: integer("businessCheckId").notNull().references(() => businessChecks.id),
  item: paymentRequestsItemEnum("item").notNull(),
  /** Whole naira, from shared/businessSupport.ts PRICES when the details were sent. */
  amountNaira: integer("amountNaira").notNull(),
  /** What the owner puts on the transfer (paymentReference). */
  reference: varchar("reference", { length: 32 }).notNull().unique(),
  status: paymentRequestsStatusEnum("status").default("requested").notNull(),
  /** Null when the details went out automatically (the owner asked for the full report). */
  requestedByUserId: integer("requestedByUserId").references(() => users.id),
  requestedAt: timestamp("requestedAt", { withTimezone: true }).defaultNow().notNull(),
  deliveryStatus: paymentRequestsDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  proofReceivedAt: timestamp("proofReceivedAt", { withTimezone: true }),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true }),
  confirmedByUserId: integer("confirmedByUserId").references(() => users.id),
  /** The team's note when confirming, e.g. the bank's transaction reference. */
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [
  uniqueIndex("payment_requests_one_per_check_item").on(table.businessCheckId, table.item),
]);

export type PaymentRequest = typeof paymentRequests.$inferSelect;

export const fullReportsStatusEnum = pgEnum("full_reports_status", ["awaiting_intake", "delivered"]);
export const fullReportsDeliveryStatusEnum = pgEnum("full_reports_delivery_status", ["Sent", "Failed", "Simulated"]);

/**
 * The paid full business check report (server/fullReport/service.ts). Created when the report payment is confirmed,
 * with a single link for the Report Intake; only the SHA-256 of its token is stored. Once the owner submits the intake,
 * the report is built by fixed rules and emailed at once; the stored answers let it be rebuilt word for word.
 */
export const fullReports = pgTable("full_reports", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessCheckId: integer("businessCheckId").notNull().unique().references(() => businessChecks.id),
  paymentRequestId: integer("paymentRequestId").notNull().references(() => paymentRequests.id),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  status: fullReportsStatusEnum("status").default("awaiting_intake").notNull(),
  /** The Report Intake answers, as validated by shared/fullReport/intake.ts. */
  intakeJson: text("intakeJson"),
  intakeSubmittedAt: timestamp("intakeSubmittedAt", { withTimezone: true }),
  /** The report builder version that produced it (REPORT_VERSION). */
  reportVersion: integer("reportVersion"),
  deliveredAt: timestamp("deliveredAt", { withTimezone: true }),
  deliveryStatus: fullReportsDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export type FullReportRecord = typeof fullReports.$inferSelect;

// ---- The engagement room (migration 0008). Additive only: no existing table changes, so sign-in, onboarding and
// payments keep working on a database that does not have these tables yet. Vocabulary: shared/engagement.ts.

export const engagementsStageEnum = pgEnum("engagements_stage", ENGAGEMENT_STAGES);
export const engagementAudienceEnum = pgEnum("engagement_audience", ENGAGEMENT_AUDIENCES);
export const engagementTeamRoleEnum = pgEnum("engagement_team_role", ENGAGEMENT_TEAM_ROLES);
export const engagementSessionsKindEnum = pgEnum("engagement_sessions_kind", ENGAGEMENT_SESSION_KINDS);
export const engagementSessionsStatusEnum = pgEnum("engagement_sessions_status", ENGAGEMENT_SESSION_STATUSES);
export const engagementTasksKindEnum = pgEnum("engagement_tasks_kind", ENGAGEMENT_TASK_KINDS);
export const engagementTasksSideEnum = pgEnum("engagement_tasks_side", ENGAGEMENT_TASK_SIDES);
export const engagementTasksStatusEnum = pgEnum("engagement_tasks_status", ENGAGEMENT_TASK_STATUSES);
export const engagementTasksFactorEnum = pgEnum("engagement_tasks_factor", ENGAGEMENT_TASK_FACTORS);
export const engagementDeliverablesKindEnum = pgEnum("engagement_deliverables_kind", ENGAGEMENT_DELIVERABLE_KINDS);
export const engagementDeliverablesStatusEnum = pgEnum("engagement_deliverables_status", ENGAGEMENT_DELIVERABLE_STATUSES);
export const clientAccessLevelEnum = pgEnum("client_access_level", CLIENT_ACCESS_LEVELS);

/**
 * One engagement per paying client: created when the Current State Assessment payment is confirmed, linked to the
 * client's business when the owner accepts the account invitation (whichever happens second does the linking).
 */
export const engagements = pgTable("engagements", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  businessCheckId: integer("businessCheckId").notNull().unique().references(() => businessChecks.id),
  businessId: integer("businessId").references(() => businesses.id),
  /** The confirmed Current State Assessment payment that started it. */
  paymentRequestId: integer("paymentRequestId").references(() => paymentRequests.id),
  stage: engagementsStageEnum("stage").default("setting_up").notNull(),
  /** The problem area chosen at the end of the assessment (shared/businessSupport.ts PROBLEM_AREAS number). */
  problemArea: integer("problemArea"),
  subProblem: varchar("subProblem", { length: 255 }),
  /** In the owner's words: exactly one problem per fix. */
  problemStatement: text("problemStatement"),
  assessmentStartedAt: timestamp("assessmentStartedAt", { withTimezone: true }),
  fixStartedAt: timestamp("fixStartedAt", { withTimezone: true }),
  closedAt: timestamp("closedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [index("engagements_business_idx").on(table.businessId), index("engagements_stage_idx").on(table.stage)]);

export type Engagement = typeof engagements.$inferSelect;

/** Who from IP Factory works on an engagement. Analysts, partners and specialists see only engagements they are on. */
export const engagementTeam = pgTable("engagement_team", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id),
  role: engagementTeamRoleEnum("role").notNull(),
  assignedByUserId: integer("assignedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [unique("engagement_team_engagement_user_unique").on(table.engagementId, table.userId), index("engagement_team_user_idx").on(table.userId)]);

/** Calls, booked on Calendly or by hand and recorded here, with the notes: a client version and an internal one. */
export const engagementSessions = pgTable("engagement_sessions", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  kind: engagementSessionsKindEnum("kind").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  scheduledFor: timestamp("scheduledFor", { withTimezone: true }),
  durationMinutes: integer("durationMinutes"),
  meetingLink: varchar("meetingLink", { length: 512 }),
  agenda: text("agenda"),
  status: engagementSessionsStatusEnum("status").default("planned").notNull(),
  /** Where the session sits in the Work Plan: the week of the assessment or the fix, and its place in that week. */
  weekNumber: integer("weekNumber"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  /** The notes the client may see once shared; `internalNotes` never leave IP Factory. */
  clientNotes: text("clientNotes"),
  internalNotes: text("internalNotes"),
  notesAudience: engagementAudienceEnum("notesAudience").default("owner").notNull(),
  notesSharedAt: timestamp("notesSharedAt", { withTimezone: true }),
  notesSharedByUserId: integer("notesSharedByUserId").references(() => users.id),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [index("engagement_sessions_engagement_idx").on(table.engagementId)]);

/** Data requests (what we need from the client) and actions (who does what by when), in one list. */
export const engagementTasks = pgTable("engagement_tasks", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  kind: engagementTasksKindEnum("kind").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  detail: text("detail"),
  side: engagementTasksSideEnum("side").notNull(),
  /** A named person, or null for "the business" (client side) or "the team" (IP Factory side). */
  assigneeUserId: integer("assigneeUserId").references(() => users.id),
  dueOn: date("dueOn"),
  status: engagementTasksStatusEnum("status").default("open").notNull(),
  /** Where the task sits in the Work Plan (week and place in the week), and whether it tests an internal or external factor. */
  weekNumber: integer("weekNumber"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  factor: engagementTasksFactorEnum("factor"),
  /** Why more is needed, or how the client sent it ("by WhatsApp"). */
  statusNote: varchar("statusNote", { length: 500 }),
  /** The session the action came out of. */
  sessionId: integer("sessionId").references(() => engagementSessions.id, { onDelete: "set null" }),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [index("engagement_tasks_engagement_idx").on(table.engagementId)]);

/** What IP Factory hands over: findings, the problem statement, the prescription, tools and the plan. */
export const engagementDeliverables = pgTable("engagement_deliverables", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  kind: engagementDeliverablesKindEnum("kind").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  summary: text("summary"),
  status: engagementDeliverablesStatusEnum("status").default("draft").notNull(),
  audience: engagementAudienceEnum("audience").default("owner").notNull(),
  approvedByUserId: integer("approvedByUserId").references(() => users.id),
  approvedAt: timestamp("approvedAt", { withTimezone: true }),
  sharedByUserId: integer("sharedByUserId").references(() => users.id),
  sharedAt: timestamp("sharedAt", { withTimezone: true }),
  /** The client's sign-off. */
  clientAcceptedByUserId: integer("clientAcceptedByUserId").references(() => users.id),
  clientAcceptedAt: timestamp("clientAcceptedAt", { withTimezone: true }),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [index("engagement_deliverables_engagement_idx").on(table.engagementId)]);

/** Files in private storage, served only through short-lived links after the same access check as the record. */
export const engagementFiles = pgTable("engagement_files", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  /** The data request it answers, or the deliverable it belongs to. */
  taskId: integer("taskId").references(() => engagementTasks.id, { onDelete: "set null" }),
  deliverableId: integer("deliverableId").references(() => engagementDeliverables.id, { onDelete: "set null" }),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 128 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  audience: engagementAudienceEnum("audience").default("owner").notNull(),
  uploadedByUserId: integer("uploadedByUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("engagement_files_engagement_idx").on(table.engagementId)]);

/** Feedback on a deliverable, from the client or the team. */
export const engagementComments = pgTable("engagement_comments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  deliverableId: integer("deliverableId").notNull().references(() => engagementDeliverables.id, { onDelete: "cascade" }),
  authorUserId: integer("authorUserId").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("engagement_comments_deliverable_idx").on(table.deliverableId)]);

/** The fix's one number (D3): recorded in fix week 1. */
export const engagementMeasures = pgTable("engagement_measures", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().unique().references(() => engagements.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  definition: text("definition"),
  unit: varchar("unit", { length: 32 }),
  baselineValue: numeric("baselineValue", { precision: 18, scale: 4 }),
  targetValue: numeric("targetValue", { precision: 18, scale: 4 }),
  createdByUserId: integer("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

/** One row per fix week: the five-question check-in, the reading, the questions asked and the hours by role (concept note §17). */
export const engagementCheckins = pgTable("engagement_checkins", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  engagementId: integer("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
  weekNumber: integer("weekNumber").notNull(),
  heldOn: date("heldOn"),
  progress: text("progress"),
  blockers: text("blockers"),
  nextStep: text("nextStep"),
  measureReading: numeric("measureReading", { precision: 18, scale: 4 }),
  questionsAsked: text("questionsAsked"),
  hoursLead: numeric("hoursLead", { precision: 5, scale: 2 }),
  hoursAnalyst: numeric("hoursAnalyst", { precision: 5, scale: 2 }),
  hoursPartner: numeric("hoursPartner", { precision: 5, scale: 2 }),
  aiUsed: boolean("aiUsed"),
  recordedByUserId: integer("recordedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [unique("engagement_checkins_engagement_week_unique").on(table.engagementId, table.weekNumber)]);

/**
 * What the owner's staff may see. Kept beside the membership rather than on it, so this migration changes no existing
 * table. No row means full access (the owner and business admins never have one).
 */
export const businessMemberAccess = pgTable("business_member_access", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  membershipId: integer("membershipId").notNull().unique().references(() => businessMemberships.id, { onDelete: "cascade" }),
  access: clientAccessLevelEnum("access").notNull(),
  grantedByUserId: integer("grantedByUserId").references(() => users.id),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
});

export const accountInvitationsKindEnum = pgEnum("account_invitations_kind", ["staff", "business_member"]);
export const accountInvitationsStatusEnum = pgEnum("account_invitations_status", ["pending", "accepted", "revoked", "expired"]);
export const accountInvitationsDeliveryStatusEnum = pgEnum("account_invitations_delivery_status", ["Sent", "Failed", "Simulated"]);

/**
 * Invitations that create an email-and-password account: IP Factory staff (with a platform role) and the owner's
 * staff (with a membership and an access level). Same rules as the client invitation: only the SHA-256 of the token
 * is stored; single use, expiring, revocable, bound to the email.
 */
export const accountInvitations = pgTable("account_invitations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  kind: accountInvitationsKindEnum("kind").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  /** staff only */
  platformRole: userPlatformRolesRoleEnum("platformRole"),
  /** business_member only */
  businessId: integer("businessId").references(() => businesses.id),
  access: clientAccessLevelEnum("access"),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  status: accountInvitationsStatusEnum("status").default("pending").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdByUserId: integer("createdByUserId").notNull().references(() => users.id),
  acceptedByUserId: integer("acceptedByUserId").references(() => users.id),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
  revokedAt: timestamp("revokedAt", { withTimezone: true }),
  deliveryStatus: accountInvitationsDeliveryStatusEnum("deliveryStatus").default("Simulated").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => sql`now()`).notNull(),
}, table => [uniqueIndex("account_invitations_one_pending_per_email").on(sql`lower(${table.email})`).where(sql`${table.status} = 'pending'`)]);

export type AccountInvitation = typeof accountInvitations.$inferSelect;
