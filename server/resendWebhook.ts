import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { businessSupportEmailDeliveries, resendEmailEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const SUPPORTED = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.failed", "email.suppressed"]);
const MAX_SKEW_SECONDS = 5 * 60;

export function verifyResendWebhookSignature(input: {
  rawBody: Buffer;
  secret: string;
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  nowSeconds?: number;
}) {
  if (!input.secret.startsWith("whsec_") || !input.id || !input.timestamp || !input.signature) return false;
  if (!/^\d+$/.test(input.timestamp)) return false;
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs((input.nowSeconds ?? Math.floor(Date.now() / 1000)) - timestamp) > MAX_SKEW_SECONDS) return false;
  let key: Buffer;
  try { key = Buffer.from(input.secret.slice("whsec_".length), "base64"); } catch { return false; }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.rawBody.toString("utf8")}`).digest();
  return input.signature.split(" ").some(candidate => {
    const match = /^v1,([A-Za-z0-9+/=]+)$/.exec(candidate);
    if (!match) return false;
    const supplied = Buffer.from(match[1], "base64");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

type ResendEvent = {
  type?: unknown;
  created_at?: unknown;
  data?: { email_id?: unknown; to?: unknown };
};

function recipientOf(value: unknown): string | null {
  const address = Array.isArray(value) ? value[0] : value;
  return typeof address === "string" && address.length <= 320 ? address : null;
}

/** Accept only signed raw-byte webhook requests and retain event metadata, never email content. */
export async function handleResendWebhook(req: Request, res: Response) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
  if (!rawBody || !verifyResendWebhookSignature({
    rawBody,
    secret: ENV.resendWebhookSecret,
    id: req.get("svix-id"),
    timestamp: req.get("svix-timestamp"),
    signature: req.get("svix-signature"),
  })) return res.status(401).json({ message: "Invalid webhook signature." });

  let event: ResendEvent;
  try { event = JSON.parse(rawBody.toString("utf8")) as ResendEvent; }
  catch { return res.status(400).json({ message: "Invalid webhook payload." }); }
  const eventId = req.get("svix-id")!;
  if (typeof event.type !== "string" || !SUPPORTED.has(event.type)) return res.status(200).json({ received: true, ignored: true });
  const providerMessageId = typeof event.data?.email_id === "string" ? event.data.email_id.slice(0, 128) : null;
  if (!providerMessageId) return res.status(400).json({ message: "Webhook message ID is missing." });
  const happenedAt = typeof event.created_at === "string" ? new Date(event.created_at) : new Date();
  if (Number.isNaN(happenedAt.getTime())) return res.status(400).json({ message: "Webhook timestamp is invalid." });
  const recipientEmail = recipientOf(event.data?.to);
  const state = event.type.slice("email.".length);

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ message: "Webhook storage is unavailable." });
    await db.transaction(async tx => {
      const [inserted] = await tx.insert(resendEmailEvents).values({ eventId, providerMessageId, eventType: state, recipientEmail, happenedAt })
        .onConflictDoNothing({ target: resendEmailEvents.eventId }).returning({ id: resendEmailEvents.id });
      if (!inserted) return;
      await tx.update(businessSupportEmailDeliveries)
        .set({ latestState: state, lastEventAt: happenedAt })
        .where(and(eq(businessSupportEmailDeliveries.providerMessageId, providerMessageId), sql`(${businessSupportEmailDeliveries.lastEventAt} is null or ${businessSupportEmailDeliveries.lastEventAt} < ${happenedAt})`));
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Resend webhook] Event not stored; provider can retry:", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ message: "Webhook event could not be stored." });
  }
}
