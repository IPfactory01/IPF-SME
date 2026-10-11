import { z } from "zod";
import { requireLegacyJump } from "../_core/legacy";
import { pricingRequests } from "../../drizzle/schema";
import { getDb } from "../db";
import { deliverEmail, JUMP_ADMINISTRATION_MAILBOX } from "../email";
import { participantProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { BRAND } from "../../shared/brand";

const PACKAGE_CHOICES = ["Foundation", "Engine Room", "Boardroom", "Not sure yet"] as const;
const PUBLIC_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_REQUEST_MAXIMUM = 5;
const publicRequestCounts = new Map<string, { count: number; resetAt: number }>();

const publicPricingRequestInput = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().email().max(320),
  businessName: z.string().trim().min(2).max(255),
  preferredPackage: z.enum(PACKAGE_CHOICES),
  note: z.string().trim().max(1000).optional(),
});

const portalPricingRequestInput = z.object({
  note: z.string().trim().max(1000).optional(),
});

function consumePublicPricingRequestRateLimit(email: string, ip: string) {
  const key = `${ip.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
  const now = Date.now();
  const existing = publicRequestCounts.get(key);
  if (!existing || existing.resetAt <= now) {
    publicRequestCounts.set(key, { count: 1, resetAt: now + PUBLIC_REQUEST_WINDOW_MS });
    return true;
  }
  if (existing.count >= PUBLIC_REQUEST_MAXIMUM) return false;
  existing.count += 1;
  return true;
}

function buildNotification(input: {
  source: "Public" | "ParticipantPortal";
  fullName: string;
  email: string;
  businessName?: string | null;
  preferredPackage?: string | null;
  note?: string | null;
}) {
  const subject = `${BRAND.programmeName} — pricing request from ${input.fullName}`;
  const body = [
    `A ${BRAND.programmeName} programme pricing request has been received.`,
    "",
    `Source: ${input.source === "ParticipantPortal" ? "Authenticated participant portal" : "Public sign-up page"}`,
    `Name: ${input.fullName}`,
    `Email: ${input.email}`,
    `Business: ${input.businessName || "Not provided"}`,
    `Programme interest: ${input.preferredPackage || "Not specified"}`,
    `Note: ${input.note || "No additional note"}`,
    "",
    `Please prepare any participant response from the approved ${BRAND.programmeShortName} communication workflow.`,
  ].join("\n");
  return { subject, body };
}

async function persistAndNotify(input: {
  registrationId?: number;
  source: "Public" | "ParticipantPortal";
  fullName: string;
  email: string;
  businessName?: string | null;
  preferredPackage?: string | null;
  note?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${BRAND.programmeShortName} is temporarily unable to record this pricing request.` });

  const message = buildNotification(input);
  const delivery = await deliverEmail({
    to: JUMP_ADMINISTRATION_MAILBOX,
    subject: message.subject,
    body: message.body,
  });
  const notificationStatus = delivery.status === "Failed" ? "Failed" : delivery.status === "Simulated" ? "Simulated" : "Sent";
  await db.insert(pricingRequests).values({
    registrationId: input.registrationId,
    source: input.source,
    fullName: input.fullName,
    email: input.email,
    businessName: input.businessName || null,
    preferredPackage: input.preferredPackage || null,
    note: input.note || null,
    notificationStatus,
  });

  if (delivery.status === "Failed") {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "We could not send your request to the programme office. Kindly try again shortly." });
  }
  return { success: true };
}

export const pricingRequestsRouter = router({
  submitPublic: publicProcedure.input(publicPricingRequestInput).mutation(async ({ input, ctx }) => {
    requireLegacyJump();
    if (!consumePublicPricingRequestRateLimit(input.email, ctx.req.ip || "unknown")) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Kindly wait a few minutes before sending another pricing request." });
    }
    return persistAndNotify({ ...input, source: "Public" });
  }),

  submitPortal: participantProcedure.input(portalPricingRequestInput).mutation(async ({ input, ctx }) => {
    const participant = ctx.participant;
    return persistAndNotify({
      registrationId: participant.id,
      source: "ParticipantPortal",
      fullName: participant.fullName,
      email: participant.email,
      businessName: participant.businessName,
      preferredPackage: participant.package,
      note: input.note,
    });
  }),
});
