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
  emailFrom: process.env.EMAIL_FROM ?? `${BRAND.senderDisplayName} <${BRAND.administrationMailbox}>`,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
  jumpGmailRefreshToken: process.env.JUMP_GMAIL_REFRESH_TOKEN ?? "",
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
  /**
   * The account business owners pay into by bank transfer until online payment is ready (server/payments.ts). Until all
   * three are set, payment email shows placeholder test details and says in capitals that they are not real.
   */
  paymentBankName: process.env.PAYMENT_BANK_NAME?.trim() ?? "",
  paymentAccountName: process.env.PAYMENT_ACCOUNT_NAME?.trim() ?? "",
  paymentAccountNumber: process.env.PAYMENT_ACCOUNT_NUMBER?.trim() ?? "",
  /** Private file storage for the engagement room (Supabase Storage, server/fileStorage.ts). Uploads switch on once set. */
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "engagement-files",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  /** Canonical public origin (scheme + host) used for emailed links and CSRF checks in production. */
  appOrigin: originOf(process.env.APP_ORIGIN || "https://emmanueltarfa.com"),
  /** Further production origins accepted for browser requests, comma-separated (e.g. the www host). */
  appAlternateOrigins: (process.env.APP_ALTERNATE_ORIGINS || "https://www.emmanueltarfa.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(originOf),
  /** This Vercel deployment's own origin, trusted in production alongside the configured origins. */
  vercelOrigin: vercelDeploymentOrigin(),
  /** Shared secret the host's scheduler sends as a Bearer token to /api/scheduled/* endpoints. */
  cronSecret: process.env.CRON_SECRET ?? "",
  /** Email address of the permanent Super Admin. */
  // A blank value (`OWNER_ADMIN_EMAIL=`) is treated as unset: `??` alone would keep "" and make every user without an
  // email look like the Super Admin.
  ownerAdminEmail: (process.env.OWNER_ADMIN_EMAIL?.trim() || "emmanueltarfa@gmail.com").toLowerCase(),
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? BRAND.administrationMailbox,
};
