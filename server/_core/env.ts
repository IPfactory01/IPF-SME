import { BRAND } from "../../shared/brand";
function originOf(value: string) {
  return new URL(value).origin;
}

/** Origin of the current Vercel deployment (VERCEL_URL is a bare host). Empty off Vercel. */
function vercelDeploymentOrigin() {
  const host = process.env.VERCEL_URL?.trim();
  if (!host) return "";
  try {
    return originOf(`https://${host}`);
  } catch {
    return "";
  }
}

/**
 * Settings production cannot run without. Nothing stands in for them: /api/health answers 503 and lists any that are
 * missing, and the server logs them once when it starts, so a deployment without them is visible at once instead of
 * quietly using someone else's domain or address.
 */
export const REQUIRED_IN_PRODUCTION = ["DATABASE_URL", "JWT_SECRET", "APP_ORIGIN", "OWNER_ADMIN_EMAIL", "RESEND_API_KEY", "PAYSTACK_SECRET_KEY"] as const;

export function missingProductionSettings(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production" ? REQUIRED_IN_PRODUCTION.filter(name => !env[name]?.trim()) : [];
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  /** Booking page for the free discovery call (Calendly, Microsoft Bookings…). Falls back to BRAND.discoveryCallUrl. */
  discoveryCallUrl: process.env.DISCOVERY_CALL_URL?.trim() || BRAND.discoveryCallUrl,
  /** Calendly personal access token (secret): lets the server read a booking's time for the admin console. Optional. */
  calendlyApiToken: process.env.CALENDLY_API_TOKEN?.trim() ?? "",
  /**
   * Calendly booking page for the Current State Assessment Sessions: one event type, booked twice (Session 1, then
   * Session 2). Whoever hosts is set in Calendly (one person or round robin). Empty: the room shows no Book button.
   */
  calendlySessionUrl: process.env.CALENDLY_SESSION_URL?.trim() ?? "",
  emailFrom: process.env.EMAIL_FROM ?? `${BRAND.senderDisplayName} <${BRAND.administrationMailbox}>`,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
  jumpGmailRefreshToken: process.env.JUMP_GMAIL_REFRESH_TOKEN ?? "",
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
  /** Private file storage for the engagement room (Supabase Storage, server/fileStorage.ts). Uploads switch on once set. */
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "engagement-files",
  /**
   * Paystack (server/paystack.ts). The secret key decides the mode: `sk_test_` is test (no real money moves), `sk_live_`
   * is live, unset is off and nothing can be paid (required in production). It also checks the webhook's signature. The public key is
   * not needed by the hosted checkout, and nothing reads it today.
   */
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY?.trim() ?? "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY?.trim() ?? "",
  /**
   * Canonical public origin (scheme + host) used for emailed links and CSRF checks in production. Without APP_ORIGIN
   * the deployment's own Vercel address stands in (links still work; health reports the gap); locally, localhost.
   */
  appOrigin: originOf(process.env.APP_ORIGIN?.trim() || vercelDeploymentOrigin() || "http://localhost:3000"),
  /** Further production origins accepted for browser requests, comma-separated (e.g. the www host). */
  appAlternateOrigins: (process.env.APP_ALTERNATE_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(originOf),
  /** This Vercel deployment's own origin, trusted in production alongside the configured origins. */
  vercelOrigin: vercelDeploymentOrigin(),
  /** The commit this deployment was built from (Vercel sets VERCEL_GIT_COMMIT_SHA), shown by /api/health as "build". */
  buildCommit: (process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "").slice(0, 7),
  /** Shared secret the host's scheduler sends as a Bearer token to /api/scheduled/* endpoints. */
  cronSecret: process.env.CRON_SECRET ?? "",
  /**
   * Email address of the permanent Super Admin. Empty when unset or blank: then nobody is Super Admin by email, and only
   * a role stored by `pnpm owner:bootstrap` counts. Every comparison must treat "" as "no owner", never as a match.
   */
  ownerAdminEmail: (process.env.OWNER_ADMIN_EMAIL?.trim() ?? "").toLowerCase(),
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? BRAND.administrationMailbox,
  /**
   * Keeps the JUMP programme's public procedures open (registration, portal sign-in links, pricing requests, Paystack
   * callbacks, emailing a diagnostic to any address). Off unless LEGACY_JUMP_ENABLED is 1, true or yes: each of them
   * sends email or calls a provider without a limit, and The Shift does not use them.
   */
  legacyJumpEnabled: /^(1|true|yes)$/i.test(process.env.LEGACY_JUMP_ENABLED?.trim() ?? ""),
  /** Required production settings that are not set (empty outside production). */
  missingSettings: missingProductionSettings(),
};

if (ENV.missingSettings.length) {
  console.error(`[Config] Missing in production: ${ENV.missingSettings.join(", ")}. Set them in the hosting environment; /api/health reports them until then.`);
}
