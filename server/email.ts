import { ENV } from "./_core/env";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG_BASE64 } from "./emailLogo";
import { buildBusinessSupportEmailHtml, buildPlainTextEmailHtml } from "./emailTemplates";
import { BRAND } from "../shared/brand";
import { logBusinessSupportEmail } from "./emailDeliveryLog";

export const JUMP_PROGRAMME_MAILBOX = BRAND.programmeMailbox;
export const JUMP_PROGRAMME_SENDER = `${BRAND.senderDisplayName} <${JUMP_PROGRAMME_MAILBOX}>`;
export const JUMP_ADMINISTRATION_MAILBOX = BRAND.administrationMailbox;
/** Where IP Factory Business Support is told about business checks. Separate from the JUMP programme mailbox. */
export const BUSINESS_SUPPORT_MAILBOX = BRAND.businessSupportMailbox;
/** A single audited copy of each operational JUMP email is retained in the programme administration mailbox. */
export const JUMP_MONITORING_BCC: string[] = [JUMP_ADMINISTRATION_MAILBOX];

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type EmailDeliveryResult =
  | { status: "Sent"; providerMessageId?: string }
  | { status: "Simulated"; reason: "missing_credentials" | "test_sender" }
  | { status: "Failed"; reason: string };

/** Retained for delivery-status reporting compatibility. */
export function shouldUseResendFallback(gmailStatus: EmailDeliveryResult["status"]): boolean {
  return gmailStatus !== "Sent";
}

/** Retained for delivery-status reporting compatibility. */
export function shouldUseGmailFallback(resendStatus: EmailDeliveryResult["status"]): boolean {
  return resendStatus !== "Sent";
}

export function normalizeEmailHeaderValue(value: string): string {
  return value
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">");
}

/**
 * Participant communication must always originate from the JUMP programme mailbox.
 * A stale admin or personal configuration is deliberately ignored rather than used.
 */
export function getJumpProgrammeSender(configuredFrom = ENV.emailFrom): string {
  const normalised = normalizeEmailHeaderValue(configuredFrom || "");
  const lower = normalised.toLowerCase();
  return lower.includes(`<${JUMP_PROGRAMME_MAILBOX}>`) || lower === JUMP_PROGRAMME_MAILBOX
    ? normalised
    : JUMP_PROGRAMME_SENDER;
}

export function getJumpProgrammeReplyTo(_configuredReplyTo = ENV.emailReplyTo): string {
  return JUMP_PROGRAMME_MAILBOX;
}

/** Verified production identity for IP Factory Business Support email. */
export const BUSINESS_SUPPORT_SENDER = `${BRAND.organisationName} <notifications@contact.ipfactory.co>`;

/**
 * Business Support mail uses the verified IP Factory domain in production. A misconfigured production EMAIL_FROM
 * cannot silently select an unverified sender. Development can still override it for provider testing.
 */
export function getBusinessSupportSender(configuredFrom = ENV.emailFrom, production = ENV.isProduction): string {
  const normalised = normalizeEmailHeaderValue(configuredFrom || "").trim();
  if (!normalised || /emmanueltarfa\.com/i.test(normalised)) return BUSINESS_SUPPORT_SENDER;
  if (production && !/@contact\.ipfactory\.co\s*>?$/i.test(normalised)) return BUSINESS_SUPPORT_SENDER;
  return normalised;
}

/** Which identity an email is sent under. JUMP programme email keeps its own mailbox. */
export type EmailSender = "jump" | "business_support";

/** The Resend request body. Pure, so the sender and reply-to rules can be tested without sending anything. */
export function resendRequestBody(input: {
  to: string;
  bcc?: string | string[];
  subject: string;
  body: string;
  html?: string;
  icsContent?: string;
  icsFilename?: string;
  attachments?: EmailAttachment[];
  sender?: EmailSender;
}) {
  const businessSupport = input.sender === "business_support";
  const html = input.html || (businessSupport ? buildBusinessSupportEmailHtml(input.body) : buildPlainTextEmailHtml(input.body));
  return {
    from: businessSupport ? getBusinessSupportSender() : getJumpProgrammeSender(),
    to: [input.to],
    bcc: input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : undefined,
    subject: input.subject,
    text: input.body,
    html,
    reply_to: businessSupport ? BUSINESS_SUPPORT_MAILBOX : getJumpProgrammeReplyTo(),
    attachments: [
      ...(input.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        content_type: attachment.contentType,
      })),
      ...(input.icsContent
        ? [{ filename: input.icsFilename || "session-invite.ics", content: Buffer.from(input.icsContent).toString("base64"), content_type: "text/calendar" }]
        : []),
      // The IP Factory logo travels inside the email when the layout shows it.
      ...(html.includes(`cid:${EMAIL_LOGO_CID}`)
        ? [{ filename: "ip-factory-logo.png", content: EMAIL_LOGO_PNG_BASE64, content_type: "image/png", content_id: EMAIL_LOGO_CID }]
        : []),
    ],
  };
}

/** How long one Resend call may take. A serverless function cannot wait on a hung provider. */
export const EMAIL_TIMEOUT_MS = 8_000;
/** The pause before the one retry, unless Resend asks for a (short) longer one. */
const RETRY_DELAY_MS = 600;
const RETRY_DELAY_MAX_MS = 2_000;
const USER_AGENT = "advisory-as-a-service-platform/1.0";

/** Resend's Retry-After in seconds, capped so a retry still fits in the request. */
function retryDelay(retryAfter: string | null) {
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, RETRY_DELAY_MAX_MS) : RETRY_DELAY_MS;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * One email through Resend: a bounded request (EMAIL_TIMEOUT_MS), one retry when Resend is busy or down (429, 5xx, no
 * answer) and an Idempotency-Key so the retry, or a repeated request for the same record, cannot send twice. A refusal
 * (an unverified domain, a bad address) is not retried. Never throws.
 */
export async function postToResend(input: {
  payload: unknown;
  apiKey: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<EmailDeliveryResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? wait;
  const timeoutMs = input.timeoutMs ?? EMAIL_TIMEOUT_MS;
  const body = JSON.stringify(input.payload);
  let last: EmailDeliveryResult = { status: "Failed", reason: "Not sent" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${input.apiKey}`,
          "user-agent": USER_AGENT,
          ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey.slice(0, 256) } : {}),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (response.ok) return { status: "Sent", providerMessageId: data.id };
      const reason = data.message || data.name || `Resend API error: HTTP ${response.status}`;
      last = { status: "Failed", reason };
      const busy = response.status === 429 || response.status >= 500;
      // Visible in the hosting logs (e.g. an unverified domain); never includes the API key.
      console.warn(`[Email] Resend ${busy ? "did not accept" : "refused"} an email (HTTP ${response.status}): ${reason}`);
      if (!busy || attempt === 1) return last;
      await sleep(retryDelay(response.headers.get("retry-after")));
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      last = { status: "Failed", reason: timedOut ? `Resend did not answer within ${Math.round(timeoutMs / 1000)} seconds` : error instanceof Error ? error.message : "Unknown error during email delivery" };
      console.warn(`[Email] Resend could not be reached: ${last.reason}`);
      if (attempt === 1) return last;
      await sleep(RETRY_DELAY_MS);
    }
  }
  return last;
}

export async function deliverEmail(input: {
  to: string;
  bcc?: string | string[];
  subject: string;
  body: string;
  html?: string;
  icsContent?: string;
  icsFilename?: string;
  attachments?: EmailAttachment[];
  /** Defaults to the JUMP programme; business check email passes "business_support". */
  sender?: EmailSender;
  /**
   * Names the record and the message, e.g. "payment_requests:12:confirmed", so a retry or a repeated request cannot
   * send the same email twice (Resend keeps the key for 24 hours). Omit for a message that is new every time.
   */
  idempotencyKey?: string;
  businessCheckId?: number;
  paymentRequestId?: number;
  invitationId?: number;
}): Promise<EmailDeliveryResult> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return { status: "Simulated", reason: "test_sender" };
  }

  const attemptedAt = new Date();
  const apiKey = ENV.resendApiKey;
  let result: EmailDeliveryResult;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY is not set, so no email was sent.");
    result = { status: "Failed", reason: "Email delivery is not configured (RESEND_API_KEY)" };
  } else {
    result = await postToResend({ payload: resendRequestBody(input), apiKey, idempotencyKey: input.idempotencyKey });
  }
  if (input.sender === "business_support") await logBusinessSupportEmail({
    to: input.to,
    subject: input.subject,
    attemptedAt,
    result,
    businessCheckId: input.businessCheckId,
    paymentRequestId: input.paymentRequestId,
    invitationId: input.invitationId,
  });
  return result;
}
