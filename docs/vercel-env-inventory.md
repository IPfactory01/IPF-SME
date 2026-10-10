# Vercel environment variable inventory

Names only; no values. Derived from `process.env.*` / `import.meta.env.*` in this repository (`server/_core/env.ts` is the main reader).
Server variables go in Vercel → Project Settings → Environment Variables. `VITE_*` variables are inlined into the browser bundle **at build time**, so they must exist before `vite build` runs.

Requirement groups: **A** basic API, **B** database, **C** registration, **D** participant login, **E** admin login, **F** email, **G** uploads, **H** Google OAuth/Calendar.

| Variable | Used By | Server / Client | Required / Optional | Purpose | Production Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | security.ts, vite.ts, index.ts, email.ts, gmail.ts | Server | Required (A) | Switches CSP, origin policy and test-mode email suppression | Vercel sets `production` for builds/functions. Production origin policy applies only when it is `production`. |
| `PORT` | server/_core/index.ts | Server (local only) | Optional | Preferred local listen port | Not used on Vercel (no listener). |
| `DATABASE_URL` | db.ts | Server | Required (B, C, D, E) | PostgreSQL runtime connection | Supabase **Transaction Pooler** (port 6543). node-postgres pool created once per function instance with `max: 1` and no named prepared statements (transaction pooling does not support pipelining). |
| `DATABASE_SSL_CA` | db.ts | Server | Optional | PEM of the database CA | When set, the server certificate is verified; otherwise the connection is encrypted but unverified. |
| `MIGRATION_DATABASE_URL` | drizzle.config.ts | Server (tooling) | Required to migrate | PostgreSQL migration connection | Supabase **Session Pooler** (port 5432) or a direct connection. Never needed at runtime. |
| `TEST_DATABASE_URL` | test/db | Test | Optional | Disposable database for `pnpm test:db` | Never set on Vercel. |
| `JWT_SECRET` | env.ts → sdk.ts | Server | Required (D, E) | Signs session cookies/tokens | Generate fresh per environment. Changing it signs everyone out. |
| `APP_ORIGIN` | env.ts → security.ts, links in email | Server | Required in production (A, C, F) | Canonical public origin for CSRF checks and emailed links | Set to `https://ipfactory.co`. Defaults to `https://emmanueltarfa.com` if unset. |
| `APP_ALTERNATE_ORIGINS` | env.ts → security.ts | Server | Required in production (A) | Extra trusted browser origins, comma-separated | Set to `https://www.ipfactory.co` (add the production `*.vercel.app` alias if wanted). Defaults to `https://www.emmanueltarfa.com`. |
| `VERCEL_URL` | env.ts → security.ts | Server | Optional (system var, set by Vercel) | Trusts the current deployment's own origin | Provided automatically; do not set manually. Only honoured in production mode. |
| `OWNER_ADMIN_EMAIL` | env.ts, adminSecurity.ts, db.ts | Server | Required (E) | Permanent Super Admin email | Defaults to a hard-coded address if unset; set explicitly to the owner's sign-in email. A blank value counts as unset. Super Admin is also stored as a role by `pnpm owner:bootstrap`, so the owner stays Super Admin even if this value differs. |
| `OWNER_OPEN_ID` | env.ts, db.ts | Server | Optional (E) | Manus openId auto-promoted to admin | Manus-specific. |
| `CRON_SECRET` | env.ts → scheduledReminder.ts | Server | Required for scheduled reminders | Bearer secret authorising `/api/scheduled/*` | Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when this variable exists. |
| `VITE_APP_ID` | env.ts (as `appId`), client/src/const.ts | Both | Required for Manus admin OAuth (E) | Manus app id | Manus-specific; needed at build time for the client. |
| `OAUTH_SERVER_URL` | env.ts → sdk.ts | Server | Required for Manus admin OAuth (E) | Manus OAuth server base URL | Manus-specific. |
| `VITE_OAUTH_PORTAL_URL` | client/src/const.ts | Client | Required for Manus admin OAuth (E) | Manus login portal URL | Manus-specific; build time. |
| `BUILT_IN_FORGE_API_URL` | env.ts → storage.ts, storageProxy.ts, llm.ts, map.ts, dataApi.ts, imageGeneration.ts, voiceTranscription.ts, notification | Server | Required for uploads (G) | Manus Forge API (presigned S3 storage and other services) | Manus-specific storage backend. |
| `BUILT_IN_FORGE_API_KEY` | same as above | Server | Required for uploads (G) | Bearer key for Forge API | Secret. |
| `VITE_FRONTEND_FORGE_API_URL` | client/src/components/Map.tsx | Client | Optional | Maps proxy URL | Build time; only for map component. |
| `VITE_FRONTEND_FORGE_API_KEY` | client/src/components/Map.tsx | Client | Optional | Maps key | Public by design (bundled); build time. |
| `DISCOVERY_CALL_URL` | env.ts → routers/businessCheck.ts, businessCheck.ts (owner email) | Server | Optional (defaults to IP Factory's Calendly event in `shared/brand.ts`) | Booking page for the free 20-minute discovery call | Set only to use a different booking page. A Calendly event link (e.g. `https://calendly.com/<account>/discovery-call`) is embedded on the business check result with the owner's name and email filled in; any other https booking page opens in a new tab. Not secret. |
| `CALENDLY_API_TOKEN` | env.ts → calendly.ts → routers/businessCheck.ts | Server | Optional | Reads the date and time of a call booked on Calendly, so admin shows it as "Call booked" with the time | **Secret.** Calendly → Integrations → API & Webhooks → Personal access token. The server checks the booking is active and was made with the business check's email before saving the time; when admin opens, calls still waiting for a time are also looked up by email (up to 10 per load). Failures are logged as `[Calendly] … returned <status>` (401 = wrong or revoked token). Without it, booked calls show as "Call requested". |
| `RESEND_API_KEY` | env.ts → email.ts, scripts/send-test-email.mjs | Server | Required for primary email (F) | Resend transport | Secret. |
| `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NUMBER` | env.ts → payments.ts | Server | Optional until real payments | The account business owners pay into by bank transfer for the full report and Current State Assessment, until online payment (Paystack) is ready | Not secret, but kept out of the code so they can change without a release. Until **all three** are set, payment email shows placeholder test details (account 0000000000) with "TEST DETAILS: DO NOT PAY" in capitals. |
| `EMAIL_FROM` | env.ts → email.ts | Server | Optional (F) | Sender for business check (IP Factory Business Support) email | Defaults to `IP Factory <info@ipfactory.co>`; replies go to info@ipfactory.co. Until ipfactory.co is verified in Resend, use Resend's test sender `IP Factory <onboarding@resend.dev>` (it delivers only to the Resend account's own email). A JUMP/emmanueltarfa.com address here is ignored. JUMP programme email always sends from the JUMP mailbox. Refused sends are logged as `[Email] Resend refused an email …`. |
| `EMAIL_REPLY_TO` | env.ts → email.ts, gmail.ts | Server | Optional (F) | Reply-To address | Defaults to the brand administration mailbox. |
| `GOOGLE_CLIENT_ID` | env.ts → gmail.ts, workspaceMailbox.ts, calendar; scripts | Server | Required (F fallback, H) | Google OAuth client | |
| `GOOGLE_CLIENT_SECRET` | same | Server | Required (F fallback, H) | Google OAuth client secret | Secret. |
| `GOOGLE_REFRESH_TOKEN` | env.ts → gmail.ts, calendar; scripts | Server | Required (F fallback, H) | Refresh token for Gmail send and Calendar | Secret. |
| `JUMP_GMAIL_REFRESH_TOKEN` | env.ts → workspaceMailbox.ts | Server | Optional (F) | Workspace mailbox send / reply sync | Secret. |
| `GOOGLE_CALENDAR_ID` | env.ts, scripts | Server | Optional (H) | Calendar to create sessions in | Defaults to `primary`. |
| `SUPABASE_URL` | env.ts → fileStorage.ts, security.ts | Server | Required for file uploads in the engagement room | The Supabase project URL (`https://<ref>.supabase.co`); its origin is added to the production CSP so the browser can upload straight to the bucket | Not secret. Uploads stay off until all three storage variables are set; the room then says to send files on WhatsApp or by email. |
| `SUPABASE_SERVICE_ROLE_KEY` | env.ts → fileStorage.ts | Server | Required for file uploads | Lets the server issue one-off upload links and short-lived download links for a **private** bucket; the key never reaches the browser | **Secret.** Server only. |
| `SUPABASE_STORAGE_BUCKET` | env.ts → fileStorage.ts | Server | Optional (default `engagement-files`) | The private bucket's name | Create it private, in Supabase → Storage. |
| `PAYSTACK_PUBLIC_KEY` | env.ts → routers/registration.ts | Server | Required once Paystack goes live | Paystack: the agreed payment method for The Shift, not set up yet. Today only JUMP-era `initializePaystack` and `verifyPaystack` read it, and no client code calls them | Set (test keys first) as soon as IP Factory's Paystack business account is open. Until then payments are confirmed manually. |
| `PAYSTACK_SECRET_KEY` | env.ts | Server | Required once Paystack goes live | As above; also verifies Paystack webhook signatures | Secret. |
| `VITE_ANALYTICS_ENDPOINT` | security.ts (CSP), vite.config.ts | Both | Optional | Self-hosted analytics script origin | Build time; also server-read for CSP, so set for both. |
| `VITE_ANALYTICS_WEBSITE_ID` | vite.config.ts | Client | Optional | Analytics site id | Build time. |
| `VALIDATE_RESEND_CREDENTIALS`, `VALIDATE_RESEND_SENDER`, `VALIDATE_GOOGLE_CALENDAR` | opt-in tests only | Test | Never in production | Run live-integration tests | Leave unset on Vercel. |

## Minimum sets by capability

- **A basic API:** `NODE_ENV` (automatic), `APP_ORIGIN`, `APP_ALTERNATE_ORIGINS`
- **B database:** `DATABASE_URL`
- **C registration:** A + B (+ F for confirmation email)
- **D participant login:** B + `JWT_SECRET` (+ F for sign-in email)
- **E admin login:** B + `JWT_SECRET`, `OWNER_ADMIN_EMAIL`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`
- **F email:** `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`; Gmail fallback adds `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`; workspace mailbox adds `JUMP_GMAIL_REFRESH_TOKEN`
- **G uploads:** `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`
- **H Google OAuth/Calendar:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`
