import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { OnlinePaymentMode } from "../shared/payments";
import { ENV } from "./_core/env";

/**
 * Paystack, through its hosted checkout: the server opens a transaction for the exact amount and sends the owner to
 * Paystack's page; Paystack sends them back and tells us by a signed webhook. Nothing here trusts the browser: amounts
 * come from the payment request in the database, and a payment is believed only once Paystack itself confirms it to us
 * (`verifyTransaction`). The secret key never leaves the server and is never logged.
 */

export const PAYSTACK_API = "https://api.paystack.co";
/** Where Paystack posts its signed events. Paste the full address into Paystack → Settings → API Keys & Webhooks. */
export const PAYSTACK_WEBHOOK_PATH = "/api/paystack/webhook";
/** Paystack answers in a second or two; a stuck call must not hold the function. */
const TIMEOUT_MS = 10_000;

const secret = (key: string = ENV.paystackSecretKey) => key.trim();

/** test or live from the secret key's prefix; off when it is missing or not a secret key, and then nothing is offered online. */
export function paystackMode(secretKey: string = ENV.paystackSecretKey): OnlinePaymentMode {
  const key = secret(secretKey);
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "off";
}

/** A Paystack call failed (unreachable, refused or an answer we cannot use). The message never carries the key. */
export class PaystackError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "PaystackError";
  }
}

type Envelope<T> = { status?: boolean; message?: string; data?: T };

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<{ httpStatus: number; body: Envelope<T> }> {
  const key = secret();
  if (paystackMode(key) === "off") throw new PaystackError("Online payment is off: PAYSTACK_SECRET_KEY is not set.");
  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_API}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${key}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new PaystackError(`Paystack did not answer (${error instanceof Error ? error.name : "unknown error"}).`);
  }
  let body: Envelope<T>;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    throw new PaystackError(`Paystack answered ${response.status} without a readable body.`, response.status);
  }
  return { httpStatus: response.status, body: body ?? {} };
}

/** A one-off reference for each attempt: Paystack refuses a reference twice, and an owner may abandon a first try. */
export function onlineReference(paymentReference: string) {
  return `${paymentReference}-${randomBytes(4).toString("hex")}`;
}

/** The payment request's reference inside an attempt's reference (`TS-R-000123-1a2b3c4d` → `TS-R-000123`), or null. */
export function paymentReferenceOf(reference: string): string | null {
  return /^(TS-[A-Z]{1,3}-\d{6,})-[0-9a-f]{8}$/.exec(reference)?.[1] ?? null;
}

/**
 * Opens a transaction on Paystack and returns the checkout page to send the owner to. The amount is in kobo and comes
 * from the caller's database row; Paystack fixes it for this reference.
 */
export async function initializeTransaction(input: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  if (!Number.isSafeInteger(input.amountKobo) || input.amountKobo <= 0) throw new PaystackError("The amount must be a whole number of kobo.");
  const { httpStatus, body } = await call<{ authorization_url?: string; reference?: string }>("/transaction/initialize", {
    method: "POST",
    body: { email: input.email, amount: input.amountKobo, currency: "NGN", reference: input.reference, callback_url: input.callbackUrl, metadata: input.metadata },
  });
  const url = body.data?.authorization_url;
  if (httpStatus >= 400 || !body.status || !url || !/^https:\/\//.test(url)) {
    throw new PaystackError(`Paystack refused to open the payment (${httpStatus}${body.message ? `: ${body.message}` : ""}).`, httpStatus);
  }
  return { authorizationUrl: url, reference: body.data?.reference ?? input.reference };
}

/**
 * What Paystack says about a transaction: only the fields the confirmation checks. `amount` is what the customer was
 * charged, in kobo; when the business passes Paystack's fee to the customer it includes the fee, and `requestedAmount`
 * (Paystack's `requested_amount`) is the amount we asked for. NaN when Paystack does not say.
 */
export type VerifiedTransaction = { reference: string; status: string; amount: number; currency: string; requestedAmount?: number };

/**
 * Asks Paystack how a transaction stands. Null when Paystack does not know the reference; throws when Paystack cannot
 * be asked, so the caller can try again later rather than conclude anything.
 */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction | null> {
  const { httpStatus, body } = await call<{ reference?: unknown; status?: unknown; amount?: unknown; currency?: unknown; requested_amount?: unknown }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: "GET" });
  if ((httpStatus === 400 || httpStatus === 404) && !body.status) return null;
  if (httpStatus >= 400 || !body.status || !body.data) throw new PaystackError(`Paystack could not check the payment (${httpStatus}).`, httpStatus);
  const { data } = body;
  return {
    reference: typeof data.reference === "string" ? data.reference : "",
    status: typeof data.status === "string" ? data.status : "",
    amount: typeof data.amount === "number" ? data.amount : Number.NaN,
    currency: typeof data.currency === "string" ? data.currency : "",
    requestedAmount: typeof data.requested_amount === "number" ? data.requested_amount : undefined,
  };
}

/**
 * True when `x-paystack-signature` is the HMAC-SHA512 of the exact bytes received, keyed with the secret key. Compared
 * in constant time; a missing key, a missing header or a header of the wrong length is simply false.
 */
export function isValidPaystackSignature(rawBody: Buffer, signatureHeader: string | string[] | undefined, secretKey: string = ENV.paystackSecretKey) {
  const key = secret(secretKey);
  if (!key || typeof signatureHeader !== "string" || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"), "utf8");
  const given = Buffer.from(signatureHeader, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
