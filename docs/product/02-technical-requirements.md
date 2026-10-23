# 2. Technical requirements

**The tools and technology the platform is built on, so nobody guesses halfway through.** Last reviewed 9 October 2026.
Day-to-day rules for changing the code are in `AGENTS.md`; this document is the reference behind them.

---

## 1. Stack

| Layer | Choice | Version (resolved) |
|---|---|---|
| Language | TypeScript, strict | 5.9.3 |
| Runtime | Node 22.22.2 or newer 22.x (`.nvmrc`; `scripts/nodeVersion.mjs` enforces it) | 22 |
| Package manager | pnpm 10 (`packageManager` in `package.json`) | 10.x |
| Client | React 19, Vite 7, Tailwind CSS 4, wouter (routing, patched), TanStack Query, framer-motion, shadcn/ui | React 19.2.1, Vite 7.1.9, Tailwind 4.1.14 |
| API | Express 5 + tRPC 11 with superjson | Express 5.2.1, tRPC 11.18.0 |
| Validation | zod 4 (shared by client and server) | 4.1.12 |
| Database | PostgreSQL on Supabase, through Drizzle ORM and node-postgres | drizzle-orm 0.45.2, pg 8.23.1 |
| PDF | pdfkit with embedded fonts | 0.19.1 |
| Tests | Vitest, Testing Library with jsdom, PGlite for in-memory PostgreSQL | Vitest 2.1.9, PGlite 0.5.8 |

## 2. Code layout

```
client/src/       React app: pages/, components/ (ui/ is shadcn), lib/, preview/ (static clickable preview)
server/           Express + tRPC: routers/, domain modules (businessCheck, payments, fullReport/, clientOnboarding, email…)
server/_core/     Plumbing: env.ts, trpc.ts (guards), context.ts, cookies, app.ts, index.ts (Node), vercelEntry.ts + vercelGateway.ts
shared/           Used by client and server: brand.ts, businessSupport.ts, businessCheck/, fullReport/, payments.ts, auth.ts, platformPermissions.ts
drizzle/          schema.ts and migrations/ (0000–0007)
api/index.js      GENERATED Vercel function bundle; never edit; `pnpm build` regenerates it
test/             Mirrors the source folders; test/db for database tests; test/docs for these documents
docs/product/     These six documents
```

## 3. Hosting and deployment

- **Vercel**, project `ipf-sme`, deploying `main` of `IPfactory01/ipf-sme` automatically to https://www.ipfactory.co (with the root host as an alternate), in the IP Factory Vercel account since 14 October 2026.
- The client is a static Vite build (`dist/public`). Every server route goes through one function, `api/index.js`, via
  the rewrites in `vercel.json` (`/api/*`, `/portal/authenticate`, `/portal/access`, `/manus-storage/*`); everything
  else falls back to `index.html`. Paystack's webhook (`/api/paystack/webhook`) takes the same path: the gateway
  restores the URL and leaves the body untouched, so the signature is checked on the bytes Paystack sent.
- `vercel.json` sets security headers for static files: a content security policy (Calendly is the only allowed frame),
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a permissions policy, same-origin resource policy and
  `Strict-Transport-Security` (two years, subdomains included) on the static routes.
- **CI** (`.github/workflows/ci.yml`) runs on pushes to `main` and `claude/**` and on pull requests: install with the
  frozen lockfile, `check`, `check:tests`, `test`, `build`, then fails if the committed `api/index.js` is stale.
- **Release rule:** work on a branch, preview, and push to `main` only on the owner's word ("push to main"). Never
  force-push or rewrite history.

## 4. Database

- PostgreSQL on Supabase. At runtime `DATABASE_URL` uses the **transaction pooler** (port 6543) through a small pool of
  five connections per function instance (`DATABASE_POOL_MAX` overrides it), each query abandoned after 8 seconds so a
  stuck statement cannot hold the instance; migrations use `MIGRATION_DATABASE_URL` (session pooler, port 5432).
  `DATABASE_SSL_CA` pins the certificate.
- Schema in `drizzle/schema.ts` (38 tables, 55 enums); explained in [5. Backend schema](05-backend-schema.md).
- Changes: edit the schema → `pnpm db:generate` → review the SQL → apply. Migrations 0006 and 0007 were applied with a
  guarded SQL script that records the Drizzle hash, so `drizzle.__drizzle_migrations` stays in step
  (`docs/database-migrations.md`). `pnpm db:verify` checks a database against the schema, read-only.
- Never edit the database by hand. Migrations, major authentication changes and destructive changes go on a dedicated
  branch.

## 5. Configuration

All settings are environment variables, read on the server only through `server/_core/env.ts`. Real values live in
Vercel (production) and in a git-ignored `.env` (local). `.env.example` lists names only;
`docs/vercel-env-inventory.md` lists every variable, where it is read and whether it is required.

| Group | Variables |
|---|---|
| Core | `DATABASE_URL`, `DATABASE_SSL_CA`, `JWT_SECRET`, `NODE_ENV`, `APP_ORIGIN`, `APP_ALTERNATE_ORIGINS`, `VERCEL_URL` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` |
| Booking | `DISCOVERY_CALL_URL` (falls back to `BRAND.discoveryCallUrl`), `CALENDLY_API_TOKEN` (optional) |
| Payments | `PAYSTACK_SECRET_KEY` (required in production: Paystack is the only way to pay; unset is off, `sk_test_` is test, `sk_live_` is live; also checks the webhook signature); `PAYSTACK_PUBLIC_KEY` (not needed by the hosted checkout). There are no bank account settings |
| Staff | `OWNER_ADMIN_EMAIL` (the Super Admin), `CRON_SECRET` |
| AI and files (Manus, to be replaced) | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` |
| JUMP legacy | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `GOOGLE_*`, `JUMP_GMAIL_REFRESH_TOKEN` |
| Migrations and tests | `MIGRATION_DATABASE_URL`, `TEST_DATABASE_URL`, `VALIDATE_*` |

**Rules:** no secret in code, tests, documents or commits; nobody pastes a secret into a chat. The Resend key, for
example, exists only in Resend (shown once at creation) and in Vercel.

## 6. Integrations

| Service | Used for | How | Status |
|---|---|---|---|
| **Resend** | All outbound email | `fetch` to `api.resend.com/emails` (`server/email.ts`) with an 8-second limit, one retry when Resend is busy or down (429, 5xx, no answer) and an `Idempotency-Key` naming the record and message, so a retry or a repeated request cannot send twice; a refusal is not retried; inline logo as an attachment with `content_id` | Live. The `ipfactory.co` sending domain still needs DNS records (DG); until then Resend refuses most outside addresses |
| **Calendly** | Discovery call booking | Inline embed with name and email prefilled (`shared/booking.ts`); optional API read of the booked time (`server/calendly.ts`) | Live |
| **AI (LLM)** | The business check summary only | Manus "Forge" chat completions endpoint (`server/_core/llm.ts`) with a 25-second limit; falls back to the rules summary | Works only with Manus credentials; to move to the Anthropic API |
| **File storage** | JUMP uploads only today | Manus "Forge" presigned S3 (`server/storage.ts`), served through `/manus-storage/*` | To be replaced by a private Supabase Storage bucket (implementation plan 1.1) |
| **Paystack** | Paying online for the Full Report and the Current State Assessment (concept note §11) | Hosted checkout by redirect, so no Paystack script runs on the site and the security policy does not change (`server/paystack.ts`, `server/onlinePayment.ts`). `POST /transaction/initialize` with the amount in kobo from the payment request, `currency: "NGN"`, a reference per attempt (`TS-R-000123-` plus eight hex characters, because Paystack refuses a reference twice), `callback_url` `{APP_ORIGIN}/pay/return` and metadata (payment request, check, item). `GET /transaction/verify/:reference` before anything is confirmed. Bearer secret key; 10-second limit per call. The signed webhook `POST /api/paystack/webhook` (HMAC-SHA512 of the raw body with the secret key, compared in constant time) and the return page both confirm through `confirmPayment`, once. Paystack is the only way to pay (12 October): no bank details and no proof of payment; "Confirm by hand" stays as a fallback for a payment Paystack shows as paid that has not confirmed itself | Built. Takes payments once `PAYSTACK_SECRET_KEY` is in Vercel and the webhook address is set in Paystack. JUMP-era `initializePaystack` and `verifyPaystack` (`server/routers/registration.ts`) are separate and stay closed |
| **Google (OAuth, Calendar, Gmail)** | JUMP-era sign-in, sessions and mailbox sync | `server/_core/oauth.ts`, `server/calendar.ts`, `server/workspaceMailbox.ts` | Legacy |

## 7. Authentication and sessions

- **Clients and staff** sign in with email and password (`server/accountAuth.ts`). Passwords: scrypt with a salt;
  five failures lock the account for 15 minutes. Sessions are server-side rows; the `ipf_session` cookie is httpOnly,
  SameSite=Lax, Secure in production, 14 days; only a hash of the token is stored.
- **Client accounts** are created only from an onboarding invitation (single use, expiring, hashed token, one
  transaction).
- **Password reset** (`server/accountRecovery.ts`): single-use links, 20 minutes, only the SHA-256 stored, a new link
  revokes the one still out, using one signs the person out everywhere. Staff with `manage_users` can issue one; since
  14 October anyone can ask for one from `/login` or `/admin/login` (`account.requestReset`), which answers the same
  whether or not the account exists, only ever emails the link, and is limited to 5 an hour per email and per address.
  For the address in `OWNER_ADMIN_EMAIL` the link also sets a first password and stores `super_admin`, so the owner
  needs no database access to get in (`pnpm owner:bootstrap` remains for a database with no email).
- **Staff** have platform roles and permissions (`shared/platformPermissions.ts`); a client's session never becomes a
  staff identity.
- **Legacy:** Manus OAuth plus an administrator password (`jump_admin_access`, 8 hours) and the JUMP participant session
  (`jump_participant_session`, 30 days) remain for JUMP. JUMP's public forms (registration, portal sign-in link, pricing
  request, Paystack callbacks, emailing a diagnostic) are closed unless `LEGACY_JUMP_ENABLED` is set: each sends email
  or calls a provider without a limit.

## 8. Security requirements

| Requirement | How it is met today |
|---|---|
| Authorisation on the server for every protected procedure | Guards in `server/_core/trpc.ts`: `accountProcedure`, `adminProcedure`, `adminPermissionProcedure("<permission>")`; business checks in `requireBusinessMembership` and `requireBusinessCapability` |
| Client isolation | A business id from the browser is never trusted; the same refusal for unknown and forbidden businesses |
| Cross-site request protection | Every `/api` write must come from a trusted origin (`requireTrustedBrowserOrigin`); account actions also call `assertSameOrigin`. Exempt: `/api/scheduled/*` (bearer secret) and exactly `/api/paystack/webhook` (`ORIGIN_GUARD_EXEMPT_PATHS`), which has no browser Origin and is checked by its signature instead; it is registered before the JSON parser so it reads the raw body |
| Payments from the browser | The browser never names an amount: Paystack is asked for `amountNaira × 100` from the payment request. A payment is confirmed only after the server verifies the transaction with Paystack and its reference starts with the request's own plus "-", its status is success, its currency NGN and its amount the request's exactly; anything else changes nothing and is logged. The pay page is keyed by the Business Check's unguessable token, never the sequential payment reference. The owner may start only the Full Report themselves, for a finished check (the summary email links to it); the Current State Assessment needs details the team sent; the return page learns only paid, pending or failed, and "paid" only for the attempt that paid: request references are sequential, so an invented attempt reference answers exactly as one for an unpaid request, or for no request at all |
| Rate limits | Counters shared by every function instance through `rate_limit_counters` (`server/rateLimit.ts`, migration 0010; this instance's memory stands in until it is applied), keyed by a hash of the address, email or link. Sign-in 5 per 15 minutes per IP and email, with the per-account lockout; onboarding and staff-invitation preview 60 and accept 10 per 15 minutes per IP; Business Check start 20 per IP and 5 per IP and email per 15 minutes, save 300 per check per 15 minutes, submit 3 per check per hour, Discovery Call or report request 5 per check per day; Report Intake 30 per link per hour, download 5 per link per day; legacy reset confirmation and invitation status 30 per IP per hour; pay page 60 and online payment start 10 per Business Check per hour, return-page status 20 per Paystack reference and 60 per IP per hour |
| Tokens | Random 32 bytes (24 for the business check token), stored as SHA-256 (exception: the business check token is stored as is, see schema §6) |
| Audit | `recordAudit` for staff sign-in, roles, payments, reports and onboarding; details never contain secrets. System actors (Paystack) are recorded with a null actor and `via` in the details |
| Security headers | `applySecurityHeaders` on the server; `vercel.json` for static files |
| Personal data | No real personal data in the repository; tests use fictional people and `@example.com` |

Known gaps to close are listed in [5. Backend schema](05-backend-schema.md) §6.

## 9. AI use

- The AI writes the words of the business check summary. It never sets routes, colours, gaps or recommendations outside
  the catalogue; the rules are authoritative and the server checks the output against the catalogue.
- Everything the owner typed is passed as information, never as instructions. When the description is unclear or does
  not fit the sector, the sector wins.
- The full report uses **no AI** at all: fixed rules, so it can go out instantly with no human review.
- AI is a system actor: no interactive account, server-controlled, audited. Clients are told that analysts and AI do the
  analysis under a named consultant.
- Planned: move from the Manus endpoint to the Anthropic API; AI-drafted session notes for human review in the
  engagement room.

## 10. Testing and quality

- `pnpm verify` runs the app typecheck, the test typecheck, every test and the production build. **Nothing is pushed
  until it passes.** About 900 tests in over 100 files today.
- Tests live in `test/`, mirroring the source path, and run offline with no secrets. Email, AI and third-party APIs are
  mocked; tests that need real credentials are skipped unless `VALIDATE_*` or `TEST_DATABASE_URL` is set.
- Database behaviour is tested on PGlite (every migration applied in memory) and, with `pnpm test:db`, on a real
  PostgreSQL in a throwaway schema.
- The business check and the full report have golden snapshots; change one only for an intended change and say why in
  the commit.
- `test/qualityGates.test.ts` keeps the verify order, the CI steps and the agent rules in place;
  `test/docs/productDocs.test.ts` keeps these documents in step with the routes and tables.

## 11. Non-functional targets

| Area | Target |
|---|---|
| Phone | Every owner-facing screen works at 390 px wide on a mid-range Android phone over mobile data |
| Speed | The business check moves to the next question instantly (local state; saving happens in the background) |
| Report | The full report PDF is built and emailed within the form submission (seconds, no queue) |
| Availability | Vercel's platform availability; email or AI failures never block saving a check or confirming a payment, and each failure is recorded. A Paystack webhook that cannot be processed (Paystack or the database unreachable) is answered 500 so Paystack sends it again; the return page confirms too, so a slow webhook never holds an owner up. The function may run for 60 seconds (`maxDuration` in `vercel.json`); the Business Check's 25-second AI budget aborts the model request and its retries, and each email call is bounded, so one request stays inside that limit |
| Data location | Supabase project region as configured by IP Factory; files to follow the same region when storage moves |
| Accessibility | Labels on every input, radio groups and checkboxes with accessible names, visible focus, reduced motion respected, pinch-zoom allowed, no serious or critical axe-core violation on the public pages |
| Download size | The public pages load without the signed-in, payment, staff and JUMP pages: those are loaded on demand (`React.lazy` in `client/src/App.tsx`). The first download fell from 422 KB to 274 KB compressed (22 October) |
| Search and sharing | `client/public/robots.txt` keeps signed-in, payment and staff pages out of search; `sitemap.xml` lists every public page (kept true by `test/client/sitemap.test.ts`). Every public page's title, description and structured data live in `shared/seo.ts`: IP Factory as a ProfessionalService in Lekki serving Nigeria, each service with its price in naira, the questions as an FAQPage. After `vite build`, `scripts/prerender.ts` writes a ready-made page per public address (its own title, description, canonical address, share tags, structured data and words), so link previews and search engines that do not run JavaScript see the right page; every other address is served `app.html`, the untouched shell (`vercel.json`, `server/_core/vite.ts`). Kept true by `test/shared/seo.test.ts` |
