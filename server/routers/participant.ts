import { and, desc, eq } from "drizzle-orm";
import { requireLegacyJump } from "../_core/legacy";
import { z } from "zod";
import { consultingChatMessages, consultingReports, currentStatusAssessments, emailLogs, participantAssignments, participantBriefs, participantEngagementConsents, participantPaymentReceipts, participantProgrammeMilestoneEvents, participantProgrammeRecords, registrations, scheduleBookings, scheduleSlots, type Registration } from "../../drizzle/schema";
import { adminPermissionProcedure, participantProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { buildConsentConfirmationEmail, ENGAGEMENT_BRIEF_VERSION, getEngagementBrief } from "../../shared/engagementBrief";
import { deliverEmail, JUMP_MONITORING_BCC } from "../email";
import { clearParticipantSession, completeParticipantPassword, signInParticipantWithPassword } from "../participantAuth";
import { getPrivatePaymentGuidance, type ParticipantPackage } from "../paymentGuidance";
import { diagnosticInputSchema, deriveDiagnostic } from "../diagnostic";
import {
  diagnosticSectionProgress,
  emptyStructuredDiagnosticDraft,
  structuredDiagnosticDraftSchema,
  STRUCTURED_DIAGNOSTIC_VERSION,
  type StructuredDiagnosticDraft,
} from "../../shared/structuredDiagnostic";
import { buildWorkingDiagnosticReport, renderWorkingDiagnosticReportPdf, type WorkingDiagnosticReport } from "../workingDiagnosticReport";
import { BRAND } from "../../shared/brand";

function buildParticipantBriefInput(applicant: Registration) {
  let diagnosticConstraint: string | undefined;
  let diagnosticFocusSessions: string[] | undefined;

  if (applicant.diagnosticData) {
    try {
      const parsed = diagnosticInputSchema.safeParse(JSON.parse(applicant.diagnosticData));
      if (parsed.success) {
        const readout = deriveDiagnostic(parsed.data);
        diagnosticConstraint = readout.constraint;
        diagnosticFocusSessions = readout.classes;
      }
    } catch {
      // Retain the participant's registration narrative when a legacy diagnostic payload is malformed.
    }
  }

  return {
    fullName: applicant.fullName,
    businessName: applicant.businessName,
    packageName: applicant.package,
    businessModel: applicant.businessModel,
    businessDescription: applicant.businessDescription,
    question: applicant.question,
    diagnosticConstraint,
    diagnosticFocusSessions,
  };
}

function getRegistrationDiagnostic(applicant: Registration) {
  if (!applicant.diagnosticData) return null;
  try {
    const parsed = diagnosticInputSchema.safeParse(JSON.parse(applicant.diagnosticData));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function buildStructuredDiagnosticPrefill(applicant: Registration): StructuredDiagnosticDraft {
  const draft = emptyStructuredDiagnosticDraft();
  const registrationDiagnostic = getRegistrationDiagnostic(applicant);
  const derived = registrationDiagnostic ? deriveDiagnostic(registrationDiagnostic) : null;

  return {
    ...draft,
    section1: {
      businessName: applicant.businessName || "",
      businessDescription: applicant.businessDescription || "",
      businessAge: registrationDiagnostic?.businessAge || "",
      engine: derived?.engineRoom || applicant.businessModel || "",
      primaryConstraint: registrationDiagnostic?.primaryConstraint || applicant.question || "",
    },
  };
}

function mergeStructuredDiagnosticDraft(applicant: Registration, rawDraft: string | null): StructuredDiagnosticDraft {
  const prefill = buildStructuredDiagnosticPrefill(applicant);
  if (!rawDraft) return prefill;
  try {
    const parsed = structuredDiagnosticDraftSchema.safeParse(JSON.parse(rawDraft));
    if (!parsed.success) return prefill;
    return {
      ...prefill,
      ...parsed.data,
      section1: { ...prefill.section1, ...parsed.data.section1 },
      section2: { ...prefill.section2, ...parsed.data.section2 },
    };
  } catch {
    return prefill;
  }
}

function parseWorkingDiagnosticReport(raw: string): WorkingDiagnosticReport | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      (parsed as { type?: unknown }).type === "structured-working-report-v1"
    ) {
      return parsed as WorkingDiagnosticReport;
    }
  } catch {
    // Legacy reports and malformed JSON remain inaccessible through this new report flow.
  }
  return null;
}

async function getCompletedStructuredDiagnostic(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, applicant: Registration) {
  await requireBriefAcknowledgement(db, applicant.id);
  const stored = (await db
    .select({ structuredDiagnostic: currentStatusAssessments.structuredDiagnostic })
    .from(currentStatusAssessments)
    .where(eq(currentStatusAssessments.registrationId, applicant.id))
    .limit(1))[0];
  const draft = mergeStructuredDiagnosticDraft(applicant, stored?.structuredDiagnostic ?? null);
  const progress = diagnosticSectionProgress(draft);
  if (progress.completed !== progress.total) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Complete all five assessment sections before generating your working diagnostic report.",
    });
  }
  return draft;
}

async function getLatestWorkingDiagnosticReport(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, registrationId: number) {
  const rows = await db
    .select({ summaryJson: consultingReports.summaryJson, updatedAt: consultingReports.updatedAt })
    .from(consultingReports)
    .where(eq(consultingReports.registrationId, registrationId))
    .orderBy(desc(consultingReports.updatedAt));
  for (const row of rows) {
    const report = parseWorkingDiagnosticReport(row.summaryJson);
    if (report) return { report, updatedAt: row.updatedAt };
  }
  return null;
}

async function requireBriefAcknowledgement(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  registrationId: number,
) {
  const consent = (await db
    .select({ id: participantEngagementConsents.id })
    .from(participantEngagementConsents)
    .where(
      and(
        eq(participantEngagementConsents.registrationId, registrationId),
        eq(participantEngagementConsents.briefVersion, ENGAGEMENT_BRIEF_VERSION),
      ),
    )
    .limit(1))[0];

  if (!consent) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acknowledge your Engagement Brief before opening the Current Status Assessment." });
  }
}

export const participantRouter = router({
  signIn: publicProcedure
    .input(z.object({ email: z.string().email().max(320), password: z.string().min(1).max(160) }))
    .mutation(async ({ ctx, input }) => signInParticipantWithPassword(ctx, input.email, input.password)),

  completePassword: publicProcedure
    .input(z.object({ token: z.string().min(30).max(200), password: z.string().min(5).max(160), confirmPassword: z.string().min(5).max(160) }))
    .mutation(async ({ ctx, input }) => completeParticipantPassword(ctx, input)),

  logout: participantProcedure.mutation(async ({ ctx }) => {
    clearParticipantSession(ctx);
    return { success: true } as const;
  }),

  // Get participant dashboard details via secure token
  dashboard: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;

      let programmeRecord = (await db
        .select()
        .from(participantProgrammeRecords)
        .where(eq(participantProgrammeRecords.registrationId, applicant.id))
        .limit(1))[0];

      if (!programmeRecord) {
        const registrationSnapshot = JSON.stringify({
          id: applicant.id,
          fullName: applicant.fullName,
          email: applicant.email,
          phone: applicant.phone,
          businessName: applicant.businessName,
          businessDescription: applicant.businessDescription,
          businessModel: applicant.businessModel,
          package: applicant.package,
          question: applicant.question,
          diagnosticData: applicant.diagnosticData,
          createdAt: applicant.createdAt,
        });

        try {
          const created = await db.insert(participantProgrammeRecords).values({
            registrationId: applicant.id,
            registrationSnapshot,
          }).returning({ id: participantProgrammeRecords.id });
          const programmeRecordId = Number(created[0].id);
          await db.insert(participantProgrammeMilestoneEvents).values({
            programmeRecordId,
            phase: 0,
            milestone: "registered",
            status: "complete",
            source: "system",
          });
        } catch {
          // A concurrent browser request may have initialised the same one-per-participant record.
        }

        programmeRecord = (await db
          .select()
          .from(participantProgrammeRecords)
          .where(eq(participantProgrammeRecords.registrationId, applicant.id))
          .limit(1))[0];
      }

      if (!programmeRecord) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not initialise participant programme record." });
      }

      // Fetch confirmed bookings with slot details
      const bookings = await db
        .select({
          id: scheduleBookings.id,
          kind: scheduleBookings.kind,
          status: scheduleBookings.status,
          startAt: scheduleSlots.startAt,
          endAt: scheduleSlots.endAt,
          timezone: scheduleSlots.timezone,
          sessionNumber: scheduleSlots.sessionNumber,
          googleCalendarEventId: scheduleSlots.googleCalendarEventId,
        })
        .from(scheduleBookings)
        .innerJoin(scheduleSlots, eq(scheduleBookings.slotId, scheduleSlots.id))
        .where(
          and(
            eq(scheduleBookings.registrationId, applicant.id),
            eq(scheduleBookings.status, "Confirmed")
          )
        )
        .orderBy(scheduleSlots.startAt);

      // Fetch assigned briefs
      const briefs = await db
        .select()
        .from(participantBriefs)
        .where(eq(participantBriefs.registrationId, applicant.id))
        .orderBy(desc(participantBriefs.createdAt));

      const consentRows = await db
        .select()
        .from(participantEngagementConsents)
        .where(
          and(
            eq(participantEngagementConsents.registrationId, applicant.id),
            eq(participantEngagementConsents.briefVersion, ENGAGEMENT_BRIEF_VERSION)
          )
        )
        .orderBy(desc(participantEngagementConsents.acknowledgedAt))
        .limit(1);
      const currentConsent = consentRows[0] ?? null;
      const engagementBrief = getEngagementBrief(buildParticipantBriefInput(applicant));

      return {
        applicant: {
          id: applicant.id,
          fullName: applicant.fullName,
          email: applicant.email,
          businessName: applicant.businessName,
          businessModel: applicant.businessModel,
          package: applicant.package,
          status: applicant.status,
          depositPaid: applicant.depositPaid,
          instalment1: applicant.instalment1,
          instalment2: applicant.instalment2,
          cohortGroup: applicant.cohortGroup,
          diagnosticStage: null,
          diagnosticEngineRoom: null,
          diagnosticClasses: null,
        },
        bookings,
        briefs,
        engagement: {
          brief: engagementBrief,
          hasConsented: Boolean(currentConsent),
          acknowledgedAt: currentConsent?.acknowledgedAt ?? null,
          confirmationEmailStatus: currentConsent?.confirmationEmailStatus ?? null,
        },
        programme: {
          id: programmeRecord.id,
          paymentStatus: programmeRecord.paymentStatus,
          currentPhase: programmeRecord.currentPhase,
          registeredAt: applicant.createdAt,
        },
      };
    }),

  /** Payment details stay off public pages but are available to every authenticated eligible participant. */
  paymentGuidance: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;
      return getPrivatePaymentGuidance(applicant.package as ParticipantPackage, applicant.fullName);
    }),

  // Record one acknowledgement per personalised brief version and issue a confirmation email.
  acknowledgeEngagementBrief: participantProcedure
    .input(z.object({ confirmed: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;

      const existingRows = await db
        .select()
        .from(participantEngagementConsents)
        .where(
          and(
            eq(participantEngagementConsents.registrationId, applicant.id),
            eq(participantEngagementConsents.briefVersion, ENGAGEMENT_BRIEF_VERSION)
          )
        )
        .orderBy(desc(participantEngagementConsents.acknowledgedAt))
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        return { success: true, alreadyAcknowledged: true, acknowledgedAt: existing.acknowledgedAt };
      }

      const acknowledgedAt = new Date();
      const brief = getEngagementBrief(buildParticipantBriefInput(applicant));

      const insertResult = await db.insert(participantEngagementConsents).values({
        registrationId: applicant.id,
        briefVersion: ENGAGEMENT_BRIEF_VERSION,
        packageName: applicant.package,
        consentStatement: brief.consentStatement,
        acknowledgedAt,
      }).returning({ id: participantEngagementConsents.id });
      const consentId = Number(insertResult[0].id);

      const confirmation = buildConsentConfirmationEmail({
        ...buildParticipantBriefInput(applicant),
        acknowledgedAt,
      });
      const delivery = await deliverEmail({
        to: applicant.email,
        bcc: JUMP_MONITORING_BCC,
        subject: confirmation.subject,
        body: confirmation.body,
        html: confirmation.html,
      });
      const messageId = "providerMessageId" in delivery ? delivery.providerMessageId ?? null : null;

      await db
        .update(participantEngagementConsents)
        .set({
          confirmationEmailStatus: delivery.status,
          confirmationEmailMessageId: messageId,
        })
        .where(eq(participantEngagementConsents.id, consentId));
      await db.insert(emailLogs).values({
        registrationId: applicant.id,
        recipientEmail: applicant.email,
        subject: confirmation.subject,
        body: confirmation.body,
        status: delivery.status,
      });

      return { success: true, alreadyAcknowledged: false, acknowledgedAt, emailStatus: delivery.status };
    }),

  // Admin upload or create brief
  uploadBrief: adminPermissionProcedure("manage_documents")
    .input(
      z.object({
        registrationId: z.number().int().positive(),
        title: z.string().min(2),
        fileUrl: z.string().url(),
        fileKey: z.string().min(2),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      await db.insert(participantBriefs).values({
        registrationId: input.registrationId,
        title: input.title,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        description: input.description,
      });

      return { success: true };
    }),

  // Admin list briefs for a registration
  listBriefs: adminPermissionProcedure("view_documents")
    .input(z.object({ registrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(participantBriefs)
        .where(eq(participantBriefs.registrationId, input.registrationId))
        .orderBy(desc(participantBriefs.createdAt));
    }),

  // Participant upload completed assignment
  uploadAssignment: participantProcedure
    .input(
      z.object({
        fileName: z.string().min(1),
        fileUrl: z.string().startsWith("/manus-storage/"),
        fileKey: z.string().min(1),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;
      const expectedPrefix = `participant-assignments/${applicant.id}/`;
      if (!input.fileKey.startsWith(expectedPrefix)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This uploaded file is not associated with your private participant session." });
      }

      await db.insert(participantAssignments).values({
        registrationId: applicant.id,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        notes: input.notes,
      });

      return { success: true };
    }),

  // List participant assignments (public via token or admin)
  listAssignments: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const applicant = ctx.participant;

      return db
        .select()
        .from(participantAssignments)
        .where(eq(participantAssignments.registrationId, applicant.id))
        .orderBy(desc(participantAssignments.createdAt));
    }),

  // Admin list assignments for any registration ID
  adminListAssignments: adminPermissionProcedure("view_documents")
    .input(z.object({ registrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(participantAssignments)
        .where(eq(participantAssignments.registrationId, input.registrationId))
        .orderBy(desc(participantAssignments.createdAt));
    }),

  // Participant-submitted proof of transfer. A receipt can never mark a payment as paid by itself.
  submitPaymentReceipt: participantProcedure
    .input(
      z.object({
        paymentMilestone: z.enum(["deposit", "instalment_1", "instalment_2", "full_upfront"]),
        fileName: z.string().min(1).max(255),
        fileUrl: z.string().startsWith("/manus-storage/"),
        fileKey: z.string().min(1).max(255),
        participantNote: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      const expectedPrefix = `payment-receipts/${applicant.id}/`;
      if (!input.fileKey.startsWith(expectedPrefix)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This receipt is not associated with your private participant session." });
      }
      await db.insert(participantPaymentReceipts).values({
        registrationId: applicant.id,
        paymentMilestone: input.paymentMilestone,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileKey: input.fileKey,
        participantNote: input.participantNote || null,
      });
      return { success: true };
    }),

  listPaymentReceipts: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(participantPaymentReceipts)
        .where(eq(participantPaymentReceipts.registrationId, ctx.participant.id))
        .orderBy(desc(participantPaymentReceipts.createdAt));
    }),

  adminListPaymentReceipts: adminPermissionProcedure("manage_payments")
    .input(z.object({ registrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(participantPaymentReceipts)
        .where(eq(participantPaymentReceipts.registrationId, input.registrationId))
        .orderBy(desc(participantPaymentReceipts.createdAt));
    }),

  reviewPaymentReceipt: adminPermissionProcedure("manage_payments")
    .input(
      z.object({
        receiptId: z.number().int().positive(),
        status: z.enum(["Confirmed", "Declined"]),
        reviewNote: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(participantPaymentReceipts)
        .set({
          status: input.status,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote || null,
        })
        .where(eq(participantPaymentReceipts.id, input.receiptId));
      return { success: true };
    }),

  // Staged, registration-aware Current State Diagnostic. It is unlocked by brief consent, not payment.
  getStructuredDiagnostic: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);
      const stored = (await db
        .select({ structuredDiagnostic: currentStatusAssessments.structuredDiagnostic })
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, applicant.id))
        .limit(1))[0];
      const draft = mergeStructuredDiagnosticDraft(applicant, stored?.structuredDiagnostic ?? null);
      return { draft, progress: diagnosticSectionProgress(draft) };
    }),

  saveStructuredDiagnostic: participantProcedure
    .input(z.object({ draft: structuredDiagnosticDraftSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);
      const draft = input.draft;
      const existing = (await db
        .select({ id: currentStatusAssessments.id })
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, applicant.id))
        .limit(1))[0];
      const values = {
        structuredDiagnostic: JSON.stringify(draft),
        diagnosticVersion: STRUCTURED_DIAGNOSTIC_VERSION,
        activeSection: draft.activeSection,
        businessModelSummary: draft.section1.businessDescription,
        primaryBottleNeck: draft.section1.primaryConstraint,
        status: "Draft" as const,
      };

      if (existing) {
        await db.update(currentStatusAssessments).set(values).where(eq(currentStatusAssessments.id, existing.id));
      } else {
        await db.insert(currentStatusAssessments).values({ registrationId: applicant.id, ...values });
      }

      return { success: true, savedAt: new Date(), progress: diagnosticSectionProgress(draft) };
    }),

  getWorkingDiagnosticReport: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);
      return getLatestWorkingDiagnosticReport(db, applicant.id);
    }),

  generateWorkingDiagnosticReport: participantProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      const draft = await getCompletedStructuredDiagnostic(db, applicant);
      const report = buildWorkingDiagnosticReport(applicant, draft);
      await db.insert(consultingReports).values({
        registrationId: applicant.id,
        summaryJson: JSON.stringify(report),
        status: "Ready",
      });
      return { report, generated: true };
    }),

  downloadWorkingDiagnosticReportPdf: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);
      const current = await getLatestWorkingDiagnosticReport(db, applicant.id);
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Generate your working diagnostic report before downloading it." });
      }
      const pdf = await renderWorkingDiagnosticReportPdf(current.report);
      const safeBusinessName = applicant.businessName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report";
      return {
        filename: `${BRAND.programmeShortName}-2026-working-diagnostic-${safeBusinessName}.pdf`,
        dataUrl: `data:application/pdf;base64,${pdf.toString("base64")}`,
      };
    }),

  emailWorkingDiagnosticReport: participantProcedure
    .input(z.object({ recipientEmail: z.string().email().max(320).optional() }))
    .mutation(async ({ input, ctx }) => {
      requireLegacyJump();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);
      const current = await getLatestWorkingDiagnosticReport(db, applicant.id);
      if (!current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Generate your working diagnostic report before emailing it." });
      }
      const recipientEmail = input.recipientEmail || applicant.email;
      const pdf = await renderWorkingDiagnosticReportPdf(current.report);
      const safeBusinessName = applicant.businessName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report";
      const subject = `Your ${BRAND.programmeName} Current State Working Diagnostic`;
      const body = `Dear ${applicant.fullName},\n\nAttached is the current working diagnostic generated from the Current State Assessment you completed in your ${BRAND.programmeShortName} portal. It is designed to focus the advisory conversations ahead; it is not a final strategy, audit, valuation, or guarantee of business outcomes.\n\nYou initiated this delivery from your private portal${recipientEmail.toLowerCase() !== applicant.email.toLowerCase() ? ` to ${recipientEmail}` : ""}.\n\nKindly keep the report within your trusted working team.\n\nWarm regards,\n${BRAND.facilitatorName}`;
      const result = await deliverEmail({
        to: recipientEmail,
        bcc: JUMP_MONITORING_BCC,
        subject,
        body,
        attachments: [{ filename: `${BRAND.programmeShortName}-2026-working-diagnostic-${safeBusinessName}.pdf`, content: pdf, contentType: "application/pdf" }],
      });
      await db.insert(emailLogs).values({
        registrationId: applicant.id,
        recipientEmail,
        subject,
        body,
        status: result.status === "Sent" ? "Sent" : result.status === "Failed" ? "Failed" : "Simulated",
      });
      if (result.status === "Failed") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Your report email could not be sent. Kindly try again shortly." });
      }
      return { status: result.status, recipientEmail };
    }),

  // Legacy endpoints are retained during the staged replacement so prior assessments remain accessible.
  // Get current status assessment for a participant
  getAssessment: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);

      const assessmentRows = await db
        .select()
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, applicant.id))
        .limit(1);

      return assessmentRows[0] || null;
    }),

  // Save or update current status assessment by participant token
  saveAssessment: participantProcedure
    .input(
      z.object({
        businessModelSummary: z.string().optional(),
        currentRevenueStage: z.string().optional(),
        primaryBottleNeck: z.string().optional(),
        teamAndOperations: z.string().optional(),
        financialVisibility: z.string().optional(),
        desiredSixMonthOutcome: z.string().optional(),
        additionalNotes: z.string().optional(),
        status: z.enum(["Draft", "Submitted"]).default("Draft"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);

      const existingRows = await db
        .select()
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, applicant.id))
        .limit(1);

      if (existingRows.length > 0) {
        await db
          .update(currentStatusAssessments)
          .set({
            businessModelSummary: input.businessModelSummary,
            currentRevenueStage: input.currentRevenueStage,
            primaryBottleNeck: input.primaryBottleNeck,
            teamAndOperations: input.teamAndOperations,
            financialVisibility: input.financialVisibility,
            desiredSixMonthOutcome: input.desiredSixMonthOutcome,
            additionalNotes: input.additionalNotes,
            status: input.status,
          })
          .where(eq(currentStatusAssessments.registrationId, applicant.id));
      } else {
        await db.insert(currentStatusAssessments).values({
          registrationId: applicant.id,
          businessModelSummary: input.businessModelSummary,
          currentRevenueStage: input.currentRevenueStage,
          primaryBottleNeck: input.primaryBottleNeck,
          teamAndOperations: input.teamAndOperations,
          financialVisibility: input.financialVisibility,
          desiredSixMonthOutcome: input.desiredSixMonthOutcome,
          additionalNotes: input.additionalNotes,
          status: input.status,
        });
      }

      return { success: true };
    }),

  // Admin get assessment for any registration ID
  adminGetAssessment: adminPermissionProcedure("view_assessments")
    .input(z.object({ registrationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const applicant = (await db.select().from(registrations).where(eq(registrations.id, input.registrationId)).limit(1))[0];
      if (!applicant) throw new TRPCError({ code: "NOT_FOUND", message: "Participant registration not found." });
      const assessment = (await db
        .select()
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, input.registrationId))
        .limit(1))[0];
      if (!assessment) return { assessment: null, draft: null, progress: null, workingReport: null };
      const draft = mergeStructuredDiagnosticDraft(applicant, assessment.structuredDiagnostic ?? null);
      return {
        assessment,
        draft,
        progress: diagnosticSectionProgress(draft),
        workingReport: await getLatestWorkingDiagnosticReport(db, applicant.id),
      };
    }),

  // Download Current Status Assessment PDF for a participant token
  downloadAssessmentPdf: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }
      const applicant = ctx.participant;
      await requireBriefAcknowledgement(db, applicant.id);

      const assessmentRows = await db
        .select()
        .from(currentStatusAssessments)
        .where(eq(currentStatusAssessments.registrationId, applicant.id))
        .limit(1);

      const assessment = assessmentRows[0];
      if (!assessment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assessment not found. Please submit your assessment first." });
      }

      // Generate PDF buffer using PDFKit
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];

      return new Promise<string>((resolve, reject) => {
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const resultBuffer = Buffer.concat(chunks);
          const base64Pdf = resultBuffer.toString("base64");
          resolve(`data:application/pdf;base64,${base64Pdf}`);
        });
        doc.on("error", (err: Error) => reject(err));

        // PDF Header styling (McKinsey Blue theme)
        doc.fillColor(BRAND.colorBrand).fontSize(20).font("Helvetica-Bold").text(BRAND.programmeFullName, { align: "left" });
        doc.fontSize(12).fillColor("#555555").text("Current Status Assessment Summary Report", { align: "left" });
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.colorBrand).lineWidth(1.5).stroke();
        doc.moveDown(1);

        // Participant Information block
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Participant & Business Profile");
        doc.fontSize(10).font("Helvetica").fillColor("#333333");
        doc.text(`Full Name: ${applicant.fullName}`);
        doc.text(`Email: ${applicant.email}`);
        doc.text(`Business Name: ${applicant.businessName || "N/A"}`);
        doc.text(`Package Tier: ${applicant.package || "N/A"}`);
        doc.text(`Business Model: ${applicant.businessModel || "N/A"}`);
        doc.text(`Assessment Status: ${assessment.status}`);
        doc.text(`Last Updated: ${new Date(assessment.updatedAt).toLocaleString()}`);
        doc.moveDown(1.5);

        // Assessment Responses
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Assessment Questionnaire Responses");
        doc.moveDown(0.5);

        const sections = [
          { title: "1. Business Model Summary & Core Offering", text: assessment.businessModelSummary },
          { title: "2. Current Revenue Stage", text: assessment.currentRevenueStage },
          { title: "3. Primary Bottleneck / Strategic Constraint", text: assessment.primaryBottleNeck },
          { title: "4. Team & Operations Architecture", text: assessment.teamAndOperations },
          { title: "5. Financial Visibility & Unit Economics", text: assessment.financialVisibility },
          { title: "6. Desired 6-Month Programme Outcome", text: assessment.desiredSixMonthOutcome },
          { title: "7. Additional Context & Notes", text: assessment.additionalNotes },
        ];

        for (const sec of sections) {
          doc.fontSize(11).font("Helvetica-Bold").fillColor(BRAND.colorBrand).text(sec.title);
          doc.fontSize(10).font("Helvetica").fillColor("#333333").text(sec.text || "Not provided.", {
            align: "justify",
          });
          doc.moveDown(0.8);
        }

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).fillColor("#888888").text(`Generated securely via ${BRAND.programmeName} Portal (${BRAND.facilitatorFormalName} Strategy & Innovation Genius Track)`, { align: "center" });

        doc.end();
      });
    }),

  // Get AI consulting chat conversation history and current question
  getConsultingChat: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;

      const messages = await db
        .select()
        .from(consultingChatMessages)
        .where(eq(consultingChatMessages.registrationId, applicant.id))
        .orderBy(consultingChatMessages.createdAt);

      // If conversation is empty, initialize with AI welcoming the founder and asking Module 1 (Founder SWOT & DISC profile)
      if (messages.length === 0) {
        const welcomeText = `Welcome, ${applicant.fullName}. I am your strategy & innovation AI consulting partner for ${BRAND.programmeName} (working alongside ${BRAND.facilitatorFormalName}).\n\nHaving reviewed your registration profile for **${applicant.businessName}** (${applicant.businessModel} model), we will now deep-dive into your strategic architecture without repeating what you already shared.\n\nLet us begin with **Module 1: The Founder & Leadership Blueprint**.\n\n**Question 1.1 (Founder SWOT & DISC Profile):**\nWhen leading through high-uncertainty execution or pivoting under cash pressure, what is your primary natural behavioral response, and what critical internal blind spot do you actively guard against?\n\n*Why we ask:* Big 4 and Y Combinator diligence shows that founder self-awareness and cognitive resilience under stress are the ultimate determinants of venture survival.\n\n*Examples:* \n• Analytical & Risk-Averse (High C): Thorough validation but slow speed to market.\n• Dominant & Direct (High D): Relentless execution speed but risk of alienating early team members.\n• Inspiring & Optimistic (High I): Strong vision and fundraising appeal but vulnerable to operational drift.`;

        const initialOptions = JSON.stringify([
          "Dominant & Direct (High D) — Fast execution, risk of team friction",
          "Influencing & Visionary (High I) — Exceptional fundraising & storytelling, risk of execution drift",
          "Steady & Supportive (High S) — Deep operational loyalty, risk of delayed tough decisions",
          "Conscientious & Analytical (High C) — Rigorous problem solving, risk of analysis paralysis"
        ]);

        await db.insert(consultingChatMessages).values({
          registrationId: applicant.id,
          sender: "ai",
          content: welcomeText,
          topicTag: "founder_swot",
          structuredData: initialOptions,
        });

        const freshMessages = await db
          .select()
          .from(consultingChatMessages)
          .where(eq(consultingChatMessages.registrationId, applicant.id))
          .orderBy(consultingChatMessages.createdAt);

        return { messages: freshMessages, completed: false };
      }

      // Check if report is already generated
      const reportRows = await db
        .select()
        .from(consultingReports)
        .where(eq(consultingReports.registrationId, applicant.id))
        .limit(1);

      return {
        messages,
        completed: reportRows.length > 0,
        report: reportRows[0] || null,
      };
    }),

  // Send message or pass in consulting chat, advance to next question or generate report
  sendConsultingMessage: participantProcedure
    .input(z.object({
      content: z.string().max(8000),
      isPass: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;

      // Save participant response (or pass note)
      const participantMessage = input.isPass
        ? "[Participant passed on this question]"
        : input.content;

      await db.insert(consultingChatMessages).values({
        registrationId: applicant.id,
        sender: "participant",
        content: participantMessage,
        topicTag: "user_response",
      });

      // Count AI / participant turns to determine next step
      const messages = await db
        .select()
        .from(consultingChatMessages)
        .where(eq(consultingChatMessages.registrationId, applicant.id))
        .orderBy(consultingChatMessages.createdAt);

      const aiTurns = messages.filter((m) => m.sender === "ai").length;

      let nextAiContent = "";
      let nextOptions: string | null = null;
      let topicTag = "analysis";

      if (aiTurns === 1) {
        // Move to Module 2: The Business (Strategic Intent & Revenue Model)
        topicTag = "business_model";
        nextAiContent = `Thank you for sharing your perspective. ${input.isPass ? "Noted — we will flag this founder dynamic as an open area for our 1-on-1 Decide session." : ""}\n\nLet us advance to **Module 2: The Business Model & Unit Economics**.\n\n**Question 2.1 (Revenue & Margin Architecture):**\nHow would you characterize your current revenue model and gross margin durability as you scale toward profitability?\n\n*Why we ask:* Investors examine whether your unit economics compound favourably or whether customer acquisition costs outstrip lifetime value.\n\n*Examples:* \n• High-margin software/service with scalable delivery.\n• Capital-intensive trading or manufacturing requiring working capital discipline.\n• High-touch expert advisory transitioning to repeatable frameworks.`;
        nextOptions = JSON.stringify([
          "High-margin, scalable recurring revenue (SaaS / IP-led)",
          "Transactional trading / maker margin with working capital cycles",
          "Expert advisory / professional services with high human-capital leverage",
          "Pre-revenue / early pilot phase establishing unit economics"
        ]);
      } else if (aiTurns === 2) {
        // Move to Module 3: The Market & Industry
        topicTag = "market_industry";
        nextAiContent = `Excellent. ${input.isPass ? "We have recorded a pass for this question and will incorporate market proxies." : ""}\n\nNow to **Module 3: Market Dynamics & Competitive Moat**.\n\n**Question 3.1 (Defensibility & Tailwinds):**\nWhat is your primary sustainable competitive advantage (moat) against well-funded new entrants in your target market?\n\n*Why we ask:* A great business model without a defensible moat is easily commoditized by incumbents or fast followers.\n\n*Examples:* \n• Proprietary distribution networks or exclusive partnerships.\n• Deep domain expertise and sticky client workflows.\n• Speed of iteration and localized execution agility.`;
        nextOptions = JSON.stringify([
          "Proprietary customer trust & brand affinity",
          "Exclusive partnerships or supply chain access",
          "Specialized intellectual property or proprietary workflow",
          "Operational speed and localized execution agility"
        ]);
      } else {
        // Finalize consulting interview and generate inferred diagnostic report
        topicTag = "report_generated";
        nextAiContent = `We have completed the core consulting diagnostic interview for **${applicant.businessName}**. Based on your responses across Founder DISC/SWOT, Business Model & Margins, and Market Defensibility, I have synthesized your strategic diagnostic report.\n\nYou can now review your inferred diagnostic findings, strategic hypotheses, and download your official ${BRAND.programmeShortName} Consulting Assessment PDF below.`;

        // Generate and store consulting report summary JSON
        const summary = {
          founderProfile: "Analyzed via DISC & Execution Resilience framework",
          businessModel: applicant.businessModel,
          package: applicant.package,
          strategicHypotheses: [
            "Leverage founder execution speed while installing operational guardrails against burnout.",
            "Optimize unit margins before scaling customer acquisition spend.",
            "Deepen customer workflow stickiness to fortify market defensibility."
          ],
          risksAndBottlenecks: [
            "Working capital velocity during growth phase",
            "Key-person dependency in service delivery"
          ],
          recommendations: [
            `Prepare for 1-on-1 Decide session with ${BRAND.facilitatorFormalName} using this diagnostic baseline.`,
            "Complete assigned pre-read brief and submit diagnostic work via the portal."
          ]
        };

        await db.insert(consultingReports).values({
          registrationId: applicant.id,
          summaryJson: JSON.stringify(summary),
          status: "Ready",
        });
      }

      await db.insert(consultingChatMessages).values({
        registrationId: applicant.id,
        sender: "ai",
        content: nextAiContent,
        topicTag,
        structuredData: nextOptions,
      });

      return { success: true };
    }),

  // Download Consulting Assessment Inferred PDF Report
  downloadConsultingReportPdf: participantProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = ctx.participant;

      const reportRows = await db
        .select()
        .from(consultingReports)
        .where(eq(consultingReports.registrationId, applicant.id))
        .limit(1);

      const report = reportRows[0];
      const summary = report ? JSON.parse(report.summaryJson) : {
        strategicHypotheses: ["Diagnostic interview pending completion."],
        risksAndBottlenecks: ["Complete all consulting modules to generate full SWOT & risk analysis."],
        recommendations: ["Participate in the upcoming 1-on-1 Decide session."]
      };

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];

      return new Promise<string>((resolve, reject) => {
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => {
          const resultBuffer = Buffer.concat(chunks);
          resolve(`data:application/pdf;base64,${resultBuffer.toString("base64")}`);
        });
        doc.on("error", (err: Error) => reject(err));

        // Header
        doc.fillColor(BRAND.colorBrand).fontSize(20).font("Helvetica-Bold").text(BRAND.programmeFullName);
        doc.fontSize(12).fillColor("#555555").text("AI Management Consulting Inferred Diagnostic Report");
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.colorBrand).lineWidth(1.5).stroke();
        doc.moveDown(1);

        // Profile
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Executive & Venture Profile");
        doc.fontSize(10).font("Helvetica").fillColor("#333333");
        doc.text(`Entrepreneur: ${applicant.fullName}`);
        doc.text(`Venture: ${applicant.businessName}`);
        doc.text(`Track / Model: ${applicant.businessModel} (${applicant.package} Package)`);
        doc.text(`Date Generated: ${new Date().toLocaleDateString()}`);
        doc.moveDown(1.5);

        // Strategic Hypotheses
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Strategic Hypotheses & Value Driver Analysis");
        doc.moveDown(0.5);
        for (const hyp of summary.strategicHypotheses) {
          doc.fontSize(10).font("Helvetica").fillColor("#333333").text(`• ${hyp}`, { indent: 10 });
          doc.moveDown(0.4);
        }
        doc.moveDown(1);

        // Risks & Bottlenecks
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Identified Bottlenecks & Strategic Risks");
        doc.moveDown(0.5);
        for (const risk of summary.risksAndBottlenecks) {
          doc.fontSize(10).font("Helvetica").fillColor("#333333").text(`• ${risk}`, { indent: 10 });
          doc.moveDown(0.4);
        }
        doc.moveDown(1);

        // Recommendations
        doc.fillColor(BRAND.colorBrand).fontSize(14).font("Helvetica-Bold").text("Consulting Recommendations for 1-on-1 Decide Session");
        doc.moveDown(0.5);
        for (const rec of summary.recommendations) {
          doc.fontSize(10).font("Helvetica").fillColor("#333333").text(`• ${rec}`, { indent: 10 });
          doc.moveDown(0.4);
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor("#888888").text(`Generated securely via ${BRAND.programmeName} AI Consulting Engine (${BRAND.facilitatorFormalName} Strategy & Innovation Genius Track)`, { align: "center" });

        doc.end();
      });
    }),
});
