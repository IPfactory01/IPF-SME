import { TRPCError } from "@trpc/server";
import { formatNaira, PRICES } from "../shared/businessSupport";
import type { PaymentItem } from "../shared/payments";

/**
 * The one place the Business Support prices are decided. The code's prices (shared/businessSupport.ts PRICES) are the
 * defaults; the server can override the two paid services with environment variables, so a controlled real-money test
 * can charge a token amount and the real price comes back by restoring the variable. The browser never names a price:
 * it only displays what `businessCheck.prices` returns, and Paystack is opened for the amount on the payment request.
 *
 * Nothing else reads these variables. Once a payment request exists its stored amount is the authority for that
 * payment; this resolver only prices requests that are about to be created or sent again.
 */

export const PRICE_ENV_NAMES = { full_report: "FULL_REPORT_PRICE_NGN", current_state: "CURRENT_STATE_PRICE_NGN" } as const satisfies Record<PaymentItem, string>;
const DEFAULT_PRICES = { full_report: PRICES.fullReport, current_state: PRICES.currentState } as const satisfies Record<PaymentItem, number>;

/**
 * In production a price below this is refused unless ALLOW_LOW_PRICE_TESTING=true. The cheapest real price is
 * ₦100,000, so ₦10,000 catches a forgotten test price (₦100) without limiting a legitimate price change.
 */
export const LOW_PRICE_THRESHOLD_NGN = 10_000;
/** Whole naira only, and nothing beyond this: a typo such as an extra three zeros is not a price. */
export const MAX_PRICE_NGN = 100_000_000;
export const LOW_PRICE_SWITCH = "ALLOW_LOW_PRICE_TESTING";

export type PriceEnv = Partial<Record<string, string | undefined>>;

export type PriceResolution =
  | { ok: true; amountNaira: number; configured: boolean; lowPriceTesting: boolean }
  | { ok: false; problem: "invalid" | "too_low"; reason: string };

const isProduction = (env: PriceEnv) => env.NODE_ENV === "production";
const lowPriceTestingAllowed = (env: PriceEnv) => env[LOW_PRICE_SWITCH]?.trim().toLowerCase() === "true";

/** What an item costs under this environment, or why its configuration cannot be used. Pure: nothing is logged. */
export function evaluateBusinessSupportPrice(item: PaymentItem, env: PriceEnv = process.env): PriceResolution {
  const name = PRICE_ENV_NAMES[item];
  const raw = env[name]?.trim();
  let amountNaira: number = DEFAULT_PRICES[item];
  if (raw) {
    // Digits only: no sign, decimal point, exponent, separator or currency symbol.
    if (!/^\d{1,12}$/.test(raw)) return { ok: false, problem: "invalid", reason: `${name} must be a whole number of naira, such as ${DEFAULT_PRICES[item]}.` };
    amountNaira = Number(raw);
    if (!Number.isSafeInteger(amountNaira) || amountNaira <= 0 || amountNaira > MAX_PRICE_NGN) {
      return { ok: false, problem: "invalid", reason: `${name} must be between 1 and ${MAX_PRICE_NGN} naira.` };
    }
  }
  const low = amountNaira < LOW_PRICE_THRESHOLD_NGN;
  if (low && isProduction(env) && !lowPriceTestingAllowed(env)) {
    return { ok: false, problem: "too_low", reason: `${name} is ${formatNaira(amountNaira)}, below the production safety threshold of ${formatNaira(LOW_PRICE_THRESHOLD_NGN)}. Set ${LOW_PRICE_SWITCH}=true only for a deliberate test.` };
  }
  return { ok: true, amountNaira, configured: Boolean(raw), lowPriceTesting: low && isProduction(env) };
}

const warned = new Set<string>();
/** Said once per item and amount, never with a secret: just that a low price is live. */
function warnLowPriceTesting(item: PaymentItem, amountNaira: number) {
  const key = `${item}:${amountNaira}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[Pricing] ${LOW_PRICE_SWITCH} is on: ${item} is priced at ${formatNaira(amountNaira)}, below the ${formatNaira(LOW_PRICE_THRESHOLD_NGN)} threshold. Restore the real price and turn the switch off after the test.`);
}

/** Clears what has been warned about. Tests only. */
export function resetPriceWarningsForTests() {
  warned.clear();
}

/** Full outcome for the payment paths: the amount, and whether low-price testing is what allowed it (for the audit record). */
export function resolveBusinessSupportPrice(item: PaymentItem, env: PriceEnv = process.env) {
  const outcome = evaluateBusinessSupportPrice(item, env);
  if (!outcome.ok) {
    console.error(`[Pricing] ${outcome.reason}`);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This payment is paused while we check its price. Please try again shortly, or reply to your email." });
  }
  if (outcome.lowPriceTesting) warnLowPriceTesting(item, outcome.amountNaira);
  return { amountNaira: outcome.amountNaira, lowPriceTesting: outcome.lowPriceTesting };
}

/** The server-side price of an item in whole naira. Throws when the configuration is invalid or an unsafe low price. */
export function getBusinessSupportPrice(item: PaymentItem, env: PriceEnv = process.env) {
  return resolveBusinessSupportPrice(item, env).amountNaira;
}

/**
 * A stored amount about to be sent to Paystack must pass the same low-price safety: a ₦100 request left over from a
 * test cannot be paid once the switch is off. Throws; otherwise returns whether low-price testing is what allowed it.
 */
export function assertAmountAllowed(amountNaira: number, env: PriceEnv = process.env) {
  const low = amountNaira < LOW_PRICE_THRESHOLD_NGN;
  if (low && isProduction(env) && !lowPriceTestingAllowed(env)) {
    console.error(`[Pricing] A payment request of ${formatNaira(amountNaira)} was refused: below the production safety threshold of ${formatNaira(LOW_PRICE_THRESHOLD_NGN)} and ${LOW_PRICE_SWITCH} is off.`);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This payment is paused while we check its price. Reply to your payment email and we will send you a fresh link." });
  }
  return low && isProduction(env);
}

/**
 * The prices the website shows. Display never fails: with a configuration the payment paths would refuse, it shows the
 * real price (which is also all that can be charged, because nothing is chargeable while the configuration is refused).
 */
export function displayedPrices(env: PriceEnv = process.env) {
  const priceOf = (item: PaymentItem) => {
    const outcome = evaluateBusinessSupportPrice(item, env);
    return outcome.ok ? outcome.amountNaira : DEFAULT_PRICES[item];
  };
  return { fullReport: priceOf("full_report"), currentState: priceOf("current_state") };
}

export type DisplayedPrices = ReturnType<typeof displayedPrices>;
