import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "@server/_core/env";
import { handleResendWebhook, verifyResendWebhookSignature } from "@server/resendWebhook";
import { getDb } from "@server/db";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { businessSupportEmailDeliveries, resendEmailEvents } from "../../drizzle/schema";
import { createPgliteHarness, type DbHarness } from "../db/harness";

vi.mock("@server/db", () => ({ getDb: vi.fn() }));

const secret = `whsec_${Buffer.from("a fixture webhook signing key").toString("base64")}`;
const now = 1_800_000_000;
const body = Buffer.from('{ "type":"email.delivered", "created_at":"2026-10-16T12:00:00.000Z", "data":{"email_id":"re_fixture_1","to":["ada@example.com"]}}');
const signature = (id: string, timestamp: string, rawBody: Buffer) => `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${id}.${timestamp}.${rawBody.toString("utf8")}`).digest("base64")}`;

const saved = ENV.resendWebhookSecret;
afterEach(() => {
  ENV.resendWebhookSecret = saved;
  vi.restoreAllMocks();
});

beforeEach(() => vi.mocked(getDb).mockReset());

let harness: DbHarness;
beforeAll(async () => { harness = await createPgliteHarness(); });
afterAll(async () => { await harness?.close(); });

describe("Resend Svix webhook signature verification", () => {
  it("verifies the signature over the exact raw bytes", () => {
    expect(verifyResendWebhookSignature({ rawBody: body, secret, id: "msg_fixture", timestamp: String(now), signature: signature("msg_fixture", String(now), body), nowSeconds: now })).toBe(true);
    expect(verifyResendWebhookSignature({ rawBody: Buffer.from(body.toString().replace("delivered", "bounced")), secret, id: "msg_fixture", timestamp: String(now), signature: signature("msg_fixture", String(now), body), nowSeconds: now })).toBe(false);
  });

  it("rejects missing, malformed, and stale signatures", () => {
    expect(verifyResendWebhookSignature({ rawBody: body, secret, id: undefined, timestamp: String(now), signature: signature("msg_fixture", String(now), body), nowSeconds: now })).toBe(false);
    expect(verifyResendWebhookSignature({ rawBody: body, secret, id: "msg_fixture", timestamp: String(now - 301), signature: signature("msg_fixture", String(now - 301), body), nowSeconds: now })).toBe(false);
    expect(verifyResendWebhookSignature({ rawBody: body, secret: "", id: "msg_fixture", timestamp: String(now), signature: "v1,bad", nowSeconds: now })).toBe(false);
  });
});

async function post(rawBody: Buffer, headers: Record<string, string> = {}) {
  let status = 200;
  let payload: unknown;
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  const req = { body: rawBody, get: (name: string) => normalized[name.toLowerCase()] } as unknown as Request;
  const res = {
    status(code: number) { status = code; return this; },
    json(body: unknown) { payload = body; return this; },
  } as unknown as Response;
  await handleResendWebhook(req, res);
  return { status, payload };
}

describe("Resend webhook endpoint", () => {
  it("rejects missing and invalid signatures before parsing or storing an event", async () => {
    ENV.resendWebhookSecret = secret;
    expect((await post(body)).status).toBe(401);
    expect((await post(body, { "svix-id": "msg_fixture", "svix-timestamp": String(now), "svix-signature": "v1,bad" })).status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("returns a retryable error when a valid signed event cannot be persisted", async () => {
    ENV.resendWebhookSecret = secret;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getDb).mockResolvedValue(null);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const id = "msg_fixture_retry";
    const response = await post(body, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature(id, timestamp, body) });
    expect(response.status).toBe(503);
  });

  it("stores provider events once and never lets an older event replace a newer delivery state", async () => {
    ENV.resendWebhookSecret = secret;
    vi.mocked(getDb).mockResolvedValue(harness.db as never);
    const [delivery] = await harness.db.insert(businessSupportEmailDeliveries).values({ providerMessageId: "re_fixture_1", recipientEmail: "ada@example.com", purpose: "Business Health Check result" }).returning();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const id = "msg_fixture_idempotent";
    const headers = { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature(id, timestamp, body) };

    expect((await post(body, headers)).status).toBe(200);
    expect((await post(body, headers)).status).toBe(200);
    const [stored] = await harness.db.select().from(resendEmailEvents).where(eq(resendEmailEvents.eventId, id));
    expect(stored.eventType).toBe("delivered");
    expect(await harness.db.select().from(resendEmailEvents).where(eq(resendEmailEvents.eventId, id))).toHaveLength(1);
    expect((await harness.db.select().from(businessSupportEmailDeliveries).where(eq(businessSupportEmailDeliveries.id, delivery.id)))[0].latestState).toBe("delivered");

    const olderBody = Buffer.from(body.toString().replace("2026-10-16T12:00:00.000Z", "2026-10-16T11:59:00.000Z").replace("email.delivered", "email.delivery_delayed"));
    const olderId = "msg_fixture_older";
    expect((await post(olderBody, { "svix-id": olderId, "svix-timestamp": timestamp, "svix-signature": signature(olderId, timestamp, olderBody) })).status).toBe(200);
    expect((await harness.db.select().from(businessSupportEmailDeliveries).where(eq(businessSupportEmailDeliveries.id, delivery.id)))[0].latestState).toBe("delivered");
  });
});
