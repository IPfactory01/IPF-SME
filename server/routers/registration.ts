import { isOwnerAdmin } from "../adminSecurity";
import { requireLegacyJump } from "../_core/legacy";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { currentStatusAssessments, emailLogs, participantPasswordTokens, participantPaymentReceipts, participantReferralProfiles, participantReferrals, registrations, users } from "../../drizzle/schema";
import { diagnosticInputSchema, deriveDiagnostic } from "../diagnostic";
import { notifyOwner } from "../_core/notification";
import { deliverEmail, JUMP_MONITORING_BCC } from "../email";
import { adminPermissionProcedure, ownerAdminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import { getTrustedApplicationOrigin } from "../security";
import { buildParticipantPasswordLinkEmail, createParticipantPasswordLink, normalizeParticipantEmail, replaceParticipantPortalLink } from "../participantAuth";
import { buildEngagementBriefInvitationEmail, buildRegistrationConfirmationEmail, buildSessionReminderEmail, buildWaitlistEmail } from "../emailTemplates";
import { sameParticipantIdentity, selectHighestPathway, pathwaySupersedes, type JumpPathway } from "../../shared/pathwayReconciliation";
import { archiveApplicationFields, isActiveApplication } from "../../shared/applicationArchive";
import { deriveParticipantJourney } from "../../shared/participantJourney";
import { BRAND } from "../../shared/brand";

export const BOARDROOM_CAPACITY = 8;
const PORTAL_LINK_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PORTAL_LINK_RATE_LIMIT_MAX_REQUESTS = 5;
const portalLinkRequestCounts = new Map<string, { count: number; resetAt: number }>();
const PAYSTACK_COMMITMENT_AMOUNTS: Record<JumpPathway, number> = {
  Foundation: 230_000,
  "Engine Room": 350_000,
  Boardroom: 600_000,
};

function consumePortalLinkRateLimit(email: string, ip: string) {
  const key = `${ip.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
  const now = Date.now();
  const existing = portalLinkRequestCounts.get(key);
  if (!existing || existing.resetAt <= now) {
    portalLinkRequestCounts.set(key, { count: 1, resetAt: now + PORTAL_LINK_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (existing.count >= PORTAL_LINK_RATE_LIMIT_MAX_REQUESTS) return false;
  existing.count += 1;
  return true;
}

export const registrationInputSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email address is required"),
  phone: z.string().min(5, "Phone number is required"),
  businessName: z.string().min(2, "Business name is required"),
  businessDescription: z.string().min(10, "Please provide a brief business description"),
  businessModel: z.enum(["Maker", "Trader", "Expert"]),
  package: z.enum(["Foundation", "Engine Room", "Boardroom"]),
  question: z.string().optional(),
  diagnostic: diagnosticInputSchema.optional(),
  referralCode: z.string().trim().min(8).max(64).optional(),
});

export function registrationStatusForBoardroom(count: number) {
  return count >= BOARDROOM_CAPACITY ? "Waitlisted" as const : "Pending" as const;
}

export function buildRegistrationInsertFields(
  input: z.infer<typeof registrationInputSchema>,
  bookingToken: string,
) {
  const diagnostic = input.diagnostic ? deriveDiagnostic(input.diagnostic) : undefined;
  const diagnosticData = input.diagnostic ? JSON.stringify(input.diagnostic) : undefined;

  return {
    diagnostic,
    registrationFields: {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      businessName: input.businessName,
      businessDescription: input.businessDescription,
      businessModel: input.businessModel,
      package: input.package,
      question: input.question,
      bookingToken,
      diagnosticData,
      diagnosticStage: diagnostic?.stage,
      diagnosticEngineRoom: diagnostic?.engineRoom,
      diagnosticClasses: diagnostic?.classes.join(" | "),
    },
  };
}

async function supersedeDuplicatePathways(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  duplicateRegistrationIds: number[],
  canonicalRegistrationId: number,
) {
  if (duplicateRegistrationIds.length === 0) return;
  await db.update(registrations)
    .set({ supersededByRegistrationId: canonicalRegistrationId })
    .where(inArray(registrations.id, duplicateRegistrationIds));
}

async function recordReferralAttribution(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  referralCode: string | undefined,
  referredRegistrationId: number,
  referredEmail: string,
) {
  if (!referralCode) return;
  const profile = (await db.select().from(participantReferralProfiles)
    .where(eq(participantReferralProfiles.referralCode, referralCode)).limit(1))[0];
  if (!profile) return;
  const referrer = (await db.select({ id: registrations.id, email: registrations.email }).from(registrations)
    .where(eq(registrations.id, profile.registrationId)).limit(1))[0];
  if (!referrer || referrer.email.trim().toLowerCase() === referredEmail.trim().toLowerCase()) return;
  try {
    await db.insert(participantReferrals).values({
      referrerRegistrationId: referrer.id,
      referredRegistrationId,
      referralCode,
      status: "Registered",
    });
  } catch {
    // Attribution is deliberately idempotent. A duplicate browser submit must not create a second referral claim.
  }
}

export const registrationRouter = router({
  // Public stats to check Boardroom capacity
  listUsers: ownerAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(users).orderBy(desc(users.lastSignedIn));
  }),

  setUserRole: ownerAdminProcedure
    .input(z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = (await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, Number(input.userId))).limit(1))[0];
      // The permanent Super Admin cannot be demoted through this legacy switch (including by themselves): the owner
      // bridge would otherwise be undone by one click, locking everyone out of the admin area.
      if (target && isOwnerAdmin(target) && input.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The super administrator keeps permanent access and cannot be demoted." });
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, Number(input.userId)));
      return { success: true };
    }),

  replaceParticipantPortalLink: adminPermissionProcedure("manage_portal_access")
    .input(z.object({ registrationId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => ({
      portalUrl: await replaceParticipantPortalLink(input.registrationId, ctx.req),
    })),

  sendEngagementBriefInvitation: ownerAdminProcedure
    .input(z.object({ registrationId: z.number().int().positive(), testRecipient: z.string().email().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicants = await db.select().from(registrations).where(eq(registrations.id, input.registrationId)).limit(1);
      const applicant = applicants[0];
      if (!applicant || applicant.status === "Rejected") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Eligible participant registration not found." });
      }
      if (applicant.supersededByRegistrationId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This lower-pathway registration has been consolidated into the participant’s highest selected pathway. Kindly send the canonical invitation instead.",
        });
      }
      const packageName = applicant.package as "Foundation" | "Engine Room" | "Boardroom";
      if (!(["Foundation", "Engine Room", "Boardroom"] as const).includes(packageName)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `The participant does not have a recognised ${BRAND.programmeShortName} pathway.` });
      }
      const passwordLink = await createParticipantPasswordLink(applicant.id, ctx.req);
      const message = buildEngagementBriefInvitationEmail({
        fullName: passwordLink.applicant.fullName,
        businessName: passwordLink.applicant.businessName,
        packageName: passwordLink.applicant.package as "Foundation" | "Engine Room" | "Boardroom",
        portalUrl: passwordLink.passwordUrl,
      });
      const recipient = input.testRecipient || applicant.email;
      const delivery = await deliverEmail({
        to: recipient,
        bcc: JUMP_MONITORING_BCC,
        subject: message.subject,
        body: message.body,
        html: message.html,
      });
      await db.update(participantPasswordTokens).set({
        deliveryStatus: delivery.status,
        deliveryMessageId: delivery.status === "Sent" ? delivery.providerMessageId || null : null,
        revokedAt: delivery.status === "Sent" ? null : new Date(),
      }).where(eq(participantPasswordTokens.id, passwordLink.tokenId));
      await db.insert(emailLogs).values({
        registrationId: applicant.id,
        recipientEmail: recipient,
        subject: message.subject,
        body: message.body,
        status: delivery.status,
      });
      if (delivery.status !== "Sent") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The Engagement Brief invitation could not be delivered." });
      }
      return { status: delivery.status, recipient, packageName };
    }),

  capacity: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { boardroomCount: 0, boardroomAvailable: true };

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(registrations)
      .where(
        and(
          eq(registrations.package, "Boardroom"),
          eq(registrations.status, "Accepted")
        )
      );

    const boardroomCount = Number(result[0]?.count ?? 0);
    return {
      boardroomCount,
      boardroomAvailable: boardroomCount < 8,
    };
  }),

  // Submit registration
  submit: publicProcedure
    .input(registrationInputSchema)
    .mutation(async ({ input }) => {
      requireLegacyJump();
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const knownRegistrations = await db.select({
        id: registrations.id,
        email: registrations.email,
        fullName: registrations.fullName,
        businessName: registrations.businessName,
        package: registrations.package,
        supersededByRegistrationId: registrations.supersededByRegistrationId,
      }).from(registrations);
      const relatedActiveRegistrations = knownRegistrations.filter((registration) =>
        !registration.supersededByRegistrationId && sameParticipantIdentity(registration, input),
      );
      const relatedPathways = relatedActiveRegistrations.map((registration) => registration.package as JumpPathway);
      const retainedPathway = relatedPathways.length > 0 ? selectHighestPathway(relatedPathways) : undefined;
      if (retainedPathway && !pathwaySupersedes(input.package, retainedPathway)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Your ${retainedPathway} registration is already active. Kindly use that single participant experience rather than submitting a second pathway entry.`,
        });
      }

      const bookingToken = nanoid(32);
      const { diagnostic, registrationFields } = buildRegistrationInsertFields(input, bookingToken);

      // Check Boardroom capacity if Boardroom selected
      if (input.package === "Boardroom") {
        const capacityCheck = await db
          .select({ count: sql<number>`count(*)` })
          .from(registrations)
          .where(
            and(
              eq(registrations.package, "Boardroom"),
              eq(registrations.status, "Accepted")
            )
          );
        const count = Number(capacityCheck[0]?.count ?? 0);
        if (registrationStatusForBoardroom(count) === "Waitlisted") {
          // Automatically assign as Waitlisted
          const [waitlistInsertResult] = await db.insert(registrations).values({
            ...registrationFields,
            status: "Waitlisted",
            depositPaid: "Pending",
            instalment1: "Pending",
            instalment2: "Pending",
          }).returning({ id: registrations.id });
          await supersedeDuplicatePathways(
            db,
            relatedActiveRegistrations.map((registration) => registration.id),
            Number(waitlistInsertResult.id),
          );
          await recordReferralAttribution(db, input.referralCode, Number(waitlistInsertResult.id), input.email);

          const waitlistEmail = buildWaitlistEmail(input.fullName);
          const waitlistSubject = waitlistEmail.subject;
          const waitlistBody = waitlistEmail.body;
          const waitlistDelivery = await deliverEmail({ to: input.email, subject: waitlistSubject, body: waitlistBody, html: waitlistEmail.html });
          await db.insert(emailLogs).values({
            registrationId: Number(waitlistInsertResult.id),
            recipientEmail: input.email,
            subject: waitlistSubject,
            body: waitlistBody,
            status: waitlistDelivery.status,
          });

          // Notify owner
          await notifyOwner({
            title: `New Boardroom Waitlist: ${input.fullName} (${input.businessName})`,
            content: `${input.fullName} attempted to register for Boardroom but capacity (8) is reached. They have been placed on the Waitlist.\n\nEmail: ${input.email}\nPhone: ${input.phone}\nBusiness Model: ${input.businessModel}`,
          }).catch(() => {});

            return {
              success: true,
              status: "Waitlisted",
              bookingToken,
              diagnostic,
              emailStatus: waitlistDelivery.status,
              message: waitlistDelivery.status === "Sent"
                ? "Boardroom capacity of 8 has been reached. You have been successfully added to the Waitlist, and a confirmation email has been sent."
                : "Boardroom capacity of 8 has been reached. You have been successfully added to the Waitlist. Your email acknowledgement is recorded and will be delivered once email setup is complete.",
            };
        }
      }

      const [insertResult] = await db.insert(registrations).values({
        ...registrationFields,
        status: "Pending",
        depositPaid: "Pending",
        instalment1: "Pending",
        instalment2: "Pending",
      }).returning({ id: registrations.id });

      const newId = insertResult.id;
      await supersedeDuplicatePathways(
        db,
        relatedActiveRegistrations.map((registration) => registration.id),
        Number(newId),
      );
      await recordReferralAttribution(db, input.referralCode, Number(newId), input.email);

      // Deliver and log automated confirmation email
      const confirmationEmail = buildRegistrationConfirmationEmail({
        fullName: input.fullName,
        businessName: input.businessName,
        businessModel: input.businessModel,
        packageName: input.package,
      });
      const confirmationSubject = confirmationEmail.subject;
      const confirmationBody = confirmationEmail.body;
      const confirmationDelivery = await deliverEmail({ to: input.email, subject: confirmationSubject, body: confirmationBody, html: confirmationEmail.html });

      await db.insert(emailLogs).values({
        registrationId: Number(newId),
        recipientEmail: input.email,
        subject: confirmationSubject,
        body: confirmationBody,
        status: confirmationDelivery.status,
      });

      // Notify owner
      await notifyOwner({
        title: `New ${BRAND.programmeName} Registration: ${input.fullName} (${input.package})`,
        content: `New registration received from ${input.fullName} (${input.email}, ${input.phone}) for ${input.businessName} (${input.businessModel}). Package: ${input.package}.\n\nPre-submitted Question: ${input.question || "None"}`,
      }).catch(() => {});

      return {
        success: true,
        status: "Pending",
        bookingToken,
        diagnostic,
        emailStatus: confirmationDelivery.status,
        message: confirmationDelivery.status === "Sent"
          ? "Registration submitted successfully! An automated acknowledgement has been sent to your email."
          : "Registration submitted successfully! Your acknowledgement is recorded and will be delivered once email setup is complete.",
      };
    }),

  // Admin procedures
  list: adminPermissionProcedure("view_participants")
    .input(
      z.object({
        packageFilter: z.string().optional(),
        statusFilter: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const list = await db
        .select()
        .from(registrations)
        .orderBy(desc(registrations.createdAt));

      let filtered = list.filter((registration) => isActiveApplication(registration.archivedAt));
      if (input?.packageFilter && input.packageFilter !== "All") {
        filtered = filtered.filter((r) => r.package === input.packageFilter);
      }
      if (input?.statusFilter && input.statusFilter !== "All") {
        filtered = filtered.filter((r) => r.status === input.statusFilter);
      }
      if (input?.search && input.search.trim().length > 0) {
        const q = input.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.fullName.toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q) ||
            r.businessName.toLowerCase().includes(q)
        );
      }

      const registrationIds = filtered.map((registration) => registration.id);
      if (registrationIds.length === 0) return [];
      const [assessments, receipts] = await Promise.all([
        db.select().from(currentStatusAssessments).where(inArray(currentStatusAssessments.registrationId, registrationIds)),
        db.select().from(participantPaymentReceipts).where(inArray(participantPaymentReceipts.registrationId, registrationIds)),
      ]);
      const assessmentByRegistrationId = new Map(assessments.map((assessment) => [assessment.registrationId, assessment]));
      const receiptsByRegistrationId = new Map<number, typeof receipts>();
      for (const receipt of receipts) {
        const records = receiptsByRegistrationId.get(receipt.registrationId) ?? [];
        records.push(receipt);
        receiptsByRegistrationId.set(receipt.registrationId, records);
      }

      return filtered.map((registration) => ({
        ...registration,
        journey: deriveParticipantJourney({
          applicationStatus: registration.status,
          depositPaid: registration.depositPaid,
          instalment1: registration.instalment1,
          instalment2: registration.instalment2,
          assessmentStatus: assessmentByRegistrationId.get(registration.id)?.status ?? null,
          receiptStatuses: (receiptsByRegistrationId.get(registration.id) ?? []).map((receipt) => receipt.status),
        }),
      }));
    }),

  updateStatus: adminPermissionProcedure("decide_applications")
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["Pending", "Accepted", "Rejected", "Waitlisted"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.status === "Accepted") {
        const current = await db
          .select()
          .from(registrations)
          .where(eq(registrations.id, input.id))
          .limit(1);
        const applicant = current[0];
        if (!applicant) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

        if (applicant.package === "Boardroom") {
          const acceptedBoardroom = await db
            .select({ count: sql<number>`count(*)` })
            .from(registrations)
            .where(
              and(
                eq(registrations.package, "Boardroom"),
                eq(registrations.status, "Accepted")
              )
            );
          if (Number(acceptedBoardroom[0]?.count ?? 0) >= BOARDROOM_CAPACITY && applicant.status !== "Accepted") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Boardroom capacity is full. Move another applicant out of Accepted before accepting this registration.",
            });
          }
        }
      }

      await db
        .update(registrations)
        .set({ status: input.status })
        .where(eq(registrations.id, input.id));

      return { success: true };
    }),

  archiveRegistration: ownerAdminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const registration = (await db.select({ id: registrations.id, archivedAt: registrations.archivedAt })
        .from(registrations).where(eq(registrations.id, input.id)).limit(1))[0];
      if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      if (registration.archivedAt) return { success: true, alreadyArchived: true };
      await db.update(registrations).set(archiveApplicationFields(ctx.user.id)).where(eq(registrations.id, input.id));
      return { success: true, alreadyArchived: false };
    }),

  updatePayment: adminPermissionProcedure("manage_payments")
    .input(
      z.object({
        id: z.number(),
        field: z.enum(["depositPaid", "instalment1", "instalment2"]),
        value: z.enum(["Pending", "Paid"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(registrations)
        .set({ [input.field]: input.value })
        .where(eq(registrations.id, input.id));

      return { success: true };
    }),

  updateCohort: adminPermissionProcedure("manage_cohorts")
    .input(
      z.object({
        id: z.number(),
        cohortGroup: z.enum(["Unassigned", "Makers", "Traders", "Experts"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(registrations)
        .set({ cohortGroup: input.cohortGroup })
        .where(eq(registrations.id, input.id));

      return { success: true };
    }),

  sendEmail: ownerAdminProcedure
    .input(
      z.object({
        registrationId: z.number(),
        recipientEmail: z.string().email(),
        subject: z.string().min(2),
        body: z.string().min(5),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const delivery = await deliverEmail({
        to: input.recipientEmail,
        subject: input.subject,
        body: input.body,
      });

      await db.insert(emailLogs).values({
        registrationId: input.registrationId,
        recipientEmail: input.recipientEmail,
        subject: input.subject,
        body: input.body,
        status: delivery.status,
      });

      return { success: true, status: delivery.status };
    }),

  sendBulkEmail: ownerAdminProcedure
    .input(
      z.object({
        registrationIds: z.array(z.number()).min(1),
        recipients: z.array(z.string().email()).min(1),
        subject: z.string().min(2),
        body: z.string().min(5),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.registrationIds.length !== input.recipients.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Recipients and registrations must match." });
      }

      const deliveries = await Promise.all(
        input.registrationIds.map((registrationId, index) =>
          deliverEmail({
            to: input.recipients[index]!,
            subject: input.subject,
            body: input.body,
          }).then((delivery) => ({ registrationId, recipientEmail: input.recipients[index]!, delivery }))
        )
      );

      await db.insert(emailLogs).values(
        deliveries.map(({ registrationId, recipientEmail, delivery }) => ({
          registrationId,
          recipientEmail,
          subject: input.subject,
          body: input.body,
          status: delivery.status,
        }))
      );

      const sent = deliveries.filter(({ delivery }) => delivery.status === "Sent").length;
      const failed = deliveries.filter(({ delivery }) => delivery.status === "Failed").length;
      return { success: true, count: deliveries.length, sent, failed, status: failed > 0 ? "Failed" as const : sent === deliveries.length ? "Sent" as const : "Simulated" as const };
    }),

  getEmailLogs: adminPermissionProcedure("view_communications")
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return await db
        .select()
        .from(emailLogs)
        .where(eq(emailLogs.registrationId, input.registrationId))
        .orderBy(desc(emailLogs.sentAt));
    }),

  getAllEmailLogs: adminPermissionProcedure("view_communications")
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      return await db
        .select()
        .from(emailLogs)
        .orderBy(desc(emailLogs.sentAt))
        .limit(100);
    }),

  requestPortalLink: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      requireLegacyJump();
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const email = input.email.trim().toLowerCase();
      if (!consumePortalLinkRateLimit(email, ctx.req.ip || "unknown")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "For your security, please wait a few minutes before requesting another sign-in link." });
      }

      const rows = await db.select().from(registrations);
      const applicant = rows.find((row) => normalizeParticipantEmail(row.email) === email);
      if (!applicant || applicant.status === "Rejected") {
        return { success: true, message: `If this email is linked to an eligible ${BRAND.programmeShortName} registration, a secure password link will arrive shortly.` };
      }

      const passwordLink = await createParticipantPasswordLink(applicant.id, ctx.req);
      const { subject, body, html } = buildParticipantPasswordLinkEmail(
        passwordLink.applicant.fullName,
        passwordLink.passwordUrl,
        passwordLink.purpose,
      );

      const delivery = await deliverEmail({
        to: passwordLink.applicant.email,
        bcc: JUMP_MONITORING_BCC,
        subject,
        body,
        html,
      });
      await db.update(participantPasswordTokens).set({
        deliveryStatus: delivery.status,
        deliveryMessageId: delivery.status === "Sent" ? delivery.providerMessageId || null : null,
        revokedAt: delivery.status === "Sent" ? null : new Date(),
      }).where(eq(participantPasswordTokens.id, passwordLink.tokenId));

      await db.insert(emailLogs).values({
        registrationId: applicant.id,
        recipientEmail: applicant.email,
        subject,
        body,
        status: delivery.status,
      });

      if (delivery.status !== "Sent") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `We could not deliver your password link. Please try again shortly or contact ${BRAND.facilitatorFirstName} directly.` });
      }

      return { success: true, message: `If this email is linked to an eligible ${BRAND.programmeShortName} registration, a secure password link will arrive shortly.` };
    }),

  resendEmailLog: ownerAdminProcedure
    .input(z.object({ logId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const logRecord = await db
        .select()
        .from(emailLogs)
        .where(eq(emailLogs.id, input.logId))
        .limit(1);

      const target = logRecord[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Email log not found" });

      const delivery = await deliverEmail({
        to: target.recipientEmail,
        subject: target.subject,
        body: target.body,
      });

      await db.insert(emailLogs).values({
        registrationId: target.registrationId,
        recipientEmail: target.recipientEmail,
        subject: target.subject,
        body: target.body,
        status: delivery.status,
      });

      return { success: true, status: delivery.status };
    }),

  sendSessionReminder: ownerAdminProcedure
    .input(
      z.object({
        sessionTitle: z.string().min(2),
        sessionDate: z.string(), // ISO string or formatted date
        sessionTime: z.string(),
        meetingUrl: z.string().url().optional(),
        messageNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Get all accepted registrations
      const acceptedApplicants = await db
        .select()
        .from(registrations)
        .where(eq(registrations.status, "Accepted"));

      if (acceptedApplicants.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No accepted participants found to send reminder to." });
      }

      const startTime = new Date(`${input.sessionDate}T09:00:00Z`);
      const endTime = new Date(startTime.getTime() + 90 * 60 * 1000); // 90 mins duration

      const { generateICS } = await import("../ics");
      const icsContent = generateICS({
        title: input.sessionTitle,
        description: `${BRAND.programmeFullName}\nSession: ${input.sessionTitle}\nNotes: ${input.messageNotes || "Please join on time."}`,
        startTime,
        endTime,
        location: input.meetingUrl || "Google Meet (Link available in Participant Portal)",
        url: input.meetingUrl,
      });

      const results = await Promise.all(
        acceptedApplicants.map(async (applicant) => {
          const reminderEmail = buildSessionReminderEmail({
            fullName: applicant.fullName,
            sessionTitle: input.sessionTitle,
            sessionDate: input.sessionDate,
            sessionTime: input.sessionTime,
            meetingUrl: input.meetingUrl,
            messageNotes: input.messageNotes,
          });
          const body = reminderEmail.body;

          const delivery = await deliverEmail({
            to: applicant.email,
            subject: reminderEmail.subject,
            body,
            html: reminderEmail.html,
            icsContent,
            icsFilename: `${input.sessionTitle.replace(/[^a-zA-Z0-9]/g, "_")}_reminder.ics`,
          });

          await db.insert(emailLogs).values({
            registrationId: applicant.id,
            recipientEmail: applicant.email,
            subject: reminderEmail.subject,
            body,
            status: delivery.status,
          });

          return { email: applicant.email, status: delivery.status };
        })
      );

      const sent = results.filter((r) => r.status === "Sent").length;
      const failed = results.filter((r) => r.status === "Failed").length;

      return {
        success: true,
        total: results.length,
        sent,
        failed,
        message: `Reminder broadcast dispatched to ${results.length} accepted participants (${sent} sent, ${failed} failed). Calendar invitation attached.`,
      };
    }),

  initializePaystack: publicProcedure
    .input(
      z.object({
        registrationId: z.number().int().positive(),
        email: z.string().email(),
        amountInNaira: z.number().positive(),
        packageName: z.enum(["Foundation", "Engine Room", "Boardroom"]),
      })
    )
    .mutation(async ({ input }) => {
      requireLegacyJump();
      const secretKey = ENV.paystackSecretKey;
      if (!secretKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Online card payments are not currently available. Kindly use the approved payment guidance in your participant portal." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const applicant = (await db.select({ id: registrations.id, email: registrations.email, package: registrations.package, status: registrations.status })
        .from(registrations)
        .where(eq(registrations.id, input.registrationId))
        .limit(1))[0];
      if (!applicant || applicant.status === "Rejected" || applicant.email.trim().toLowerCase() !== input.email.trim().toLowerCase() || applicant.package !== input.packageName) {
        throw new TRPCError({ code: "FORBIDDEN", message: `This payment request does not match an eligible ${BRAND.programmeShortName} registration.` });
      }
      const expectedAmount = PAYSTACK_COMMITMENT_AMOUNTS[applicant.package];
      if (input.amountInNaira !== expectedAmount) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The requested payment amount does not match this pathway’s current commitment amount." });
      }

      try {
        const res = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: input.email,
            amount: Math.round(input.amountInNaira * 100), // Paystack uses kobo
            callback_url: `${getTrustedApplicationOrigin()}/admin?payment=verified&reg=${input.registrationId}`,
            metadata: {
              registrationId: input.registrationId,
              packageName: input.packageName,
            },
          }),
        });

        const data = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string; reference: string } };
        if (!data.status || !data.data) {
          throw new TRPCError({ code: "BAD_REQUEST", message: data.message || "Failed to initialize Paystack transaction" });
        }

        return {
          success: true,
          mode: "live",
          reference: data.data.reference,
          authorizationUrl: data.data.authorization_url,
        };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Paystack initialization error",
        });
      }
    }),

  verifyPaystack: publicProcedure
    .input(z.object({ reference: z.string().min(8).max(255), registrationId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      requireLegacyJump();
      const secretKey = ENV.paystackSecretKey;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (!secretKey) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Online card-payment verification is not currently available." });
      }

      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(input.reference)}`, {
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        });
        const data = (await res.json()) as { status: boolean; data?: { status: string; amount?: number; metadata?: { registrationId?: number | string } } };
        const applicant = (await db.select({ id: registrations.id, package: registrations.package, status: registrations.status }).from(registrations).where(eq(registrations.id, input.registrationId)).limit(1))[0];
        const expectedAmount = applicant ? PAYSTACK_COMMITMENT_AMOUNTS[applicant.package] * 100 : undefined;
        const providerRegistrationId = Number(data.data?.metadata?.registrationId);
        if (data.status && data.data?.status === "success" && applicant?.status !== "Rejected" && data.data?.amount === expectedAmount && providerRegistrationId === input.registrationId) {
          await db
            .update(registrations)
            .set({ depositPaid: "Paid" })
            .where(eq(registrations.id, input.registrationId));
          return { success: true, status: "success" };
        }
        return { success: false, status: data.data?.status ?? "failed" };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification request failed" });
      }
    }),
});
