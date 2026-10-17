# Phase 2 production-hardening remediation

**Scope:** verification and fixes limited to the production email, URL, authorization, payment, abuse, upload, and owner-admin items named in Phase 2. The audit was treated as hypotheses. No production secrets are recorded here.

## Original P0/P1 findings: verification outcome

| Audit finding | Verified problem | Disposition |
|---|---|---|
| P0 — Resend sender mismatch risk | **Verified in code.** Business Support could use the general configured sender, whose default was `info@ipfactory.co`, outside the verified `contact.ipfactory.co` domain. | **Fixed.** Production Business Support mail now defaults to `IP Factory <notifications@contact.ipfactory.co>` and ignores configured senders outside that domain. Reply-To is pinned to `info@ipfactory.co`. Production sender and Reply-To values were manually confirmed. |
| P0 — payment integrity/manual confirmation unproven | **Not established as a code defect.** Existing server/database tests exercised authorization and payment state transitions; requested missing proof cases were added or confirmed below. | **Verified by tests; payment engine unchanged.** No payment redesign was justified. Production Paystack configuration remains an operator check. |
| P1 — no Resend event pipeline or Business Support delivery log | **Verified.** No signed Resend webhook or general Business Support event record existed. | **Fixed in code.** Added signed, raw-body-verified, idempotent event intake and a metadata-only delivery record/support view. Migration 0011 is applied; `pnpm db:verify` passes 27/27. |
| P1 — `OWNER_ADMIN_EMAIL` mailbox takeover risk | **Operational risk, not a demonstrated code defect.** Generic responses, random hash-only expiring single-use reset tokens, throttling, session revocation, and a configured-owner-only first-password bridge are covered by existing tests. | **Retained architecture.** Operational launch control: the `OWNER_ADMIN_EMAIL` mailbox **must have MFA enabled and tightly controlled access**. |
| P1 — tenant and role isolation lacks proof | **Partly a verification gap, not a broad authorization defect.** Existing direct-procedure tests covered many controls; focused gaps were added. | **Verified by direct server/database tests.** No authorization rewrite was needed. |
| P1 — sensitive actions need rate-limit verification | **Partly verified gap.** New invitation/sign-in email, file-ticket, and engagement-comment paths lacked limits. | **Fixed and inventoried below.** Limits use the existing database-backed limiter. |
| P1 — upload authorization/dangerous-content risk | **Partly verified.** Private-bucket/signed-link/role checks and cross-business link denial were already present. HTML/SVG were excluded by the allowlist. Confirmation accepted any key beginning with an authorized prefix, creating a path-normalization risk. | **Fixed and tested.** Confirmation now requires a single UUID-prefixed safe filename leaf under the exact task/deliverable. Added a traversal/cross-business proof case and active-content rejection tests. The production engagement Storage bucket was manually confirmed private. |
| P1 — production origin and stale Vercel URLs | **Code already derived links/callbacks from `APP_ORIGIN`.** Workspace `.env` has the expected `https://www.ipfactory.co`; the live Vercel value cannot be verified here. Two stale Vercel URLs were found in an untracked capabilities report only, not runtime code/config. | **Configuration/docs issue.** Updated operational docs and canonical URL fixtures. Informational references in the untracked report were left alone because they do not affect production behavior. |
| P1 — no practical Business Support email visibility | **Verified as part of missing email log.** | **Fixed in code** by the minimal authorized Business Checks support view; the production migration is applied and `pnpm db:verify` passes. |

## A. Resend sender result

- Production Business Support sender: `IP Factory <notifications@contact.ipfactory.co>`.
- Business Support Reply-To: `info@ipfactory.co`.
- In production, an `EMAIL_FROM` outside `@contact.ipfactory.co` falls back to the verified sender. JUMP mail retains its separate fixed programme identity.
- `EMAIL_REPLY_TO` is not used to select the Business Support Reply-To.
- Production `APP_ORIGIN`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, and `RESEND_WEBHOOK_SECRET` were manually confirmed. The webhook is configured for all events. Delivery to production inboxes has not yet been smoke-tested.

## B. Resend webhook implementation

Added `POST /api/resend/webhook`, mounted before JSON parsing and the browser-origin guard. It verifies Svix `svix-id`, `svix-timestamp`, and `svix-signature` against the exact raw payload using the configured `RESEND_WEBHOOK_SECRET`; invalid or unsigned requests return 401. Stale signatures are rejected. Supported events are `sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, and `suppressed`. Provider event IDs are unique; duplicate events do not reapply state. Persistence errors return 503 so Resend can retry. Email bodies and content are not stored.

Production has `RESEND_WEBHOOK_SECRET` configured. The endpoint `https://www.ipfactory.co/api/resend/webhook` is created in Resend and subscribed to all events; the application processes the seven supported event types listed above.

## C. Email log and support visibility

Business Support attempts record recipient, subject/purpose, related check/payment/invitation IDs where available, provider message ID, attempted/accepted times, and latest event/time. The schema stores no body. A minimal latest-100 list is shown inside Business Checks to users already authorized for Business Support/client onboarding. JUMP mail is unchanged. Logging is best-effort so a database logging fault does not change email delivery behavior.

## D. Production-origin result

- Canonical origin is `https://www.ipfactory.co`; production `APP_ORIGIN` was manually confirmed.
- Onboarding, password reset, sign-in links, Full Report intake/payment, Current State payment return, email CTAs/legal footer, and Paystack callback URLs use the trusted application origin derived from `APP_ORIGIN`.
- Terms and Privacy links are relative application routes; email legal links prefix them with `APP_ORIGIN`.
- The only `ipf-sme.vercel.app` matches are in the untracked current-capabilities report. They are descriptive notes, not generated runtime URLs, so they were not rewritten.
- Required production setting: `APP_ORIGIN=https://www.ipfactory.co`.

## E. Authorization tests

Server-side procedure tests (not hidden-UI checks) prove:

- Client A cannot read Business B or its files; business members cannot switch to a business without an active membership.
- An invite payload cannot self-promote a business member to owner.
- Unassigned analysts and partner/SME staff cannot access an engagement; assignment enables the appropriate staff access.
- Business ownership does not create platform-admin authority.
- Finance cannot mutate non-payment pipeline resources based only on payment privileges.
- An administrator missing a capability is refused the associated mutation; Super Admin role grant/revoke stays Super Admin-only.
- Suspended accounts lose sign-in and their existing sessions immediately stop authorizing requests.

The existing procedures already enforced these checks; no authorization implementation rewrite was made.

## F. Paystack fraud and idempotency tests

Existing direct-route/server/database tests plus the added check-token binding and overpayment cases cover: invalid/missing signatures; event replay and duplicate delivery; webhook/return-page race; wrong reference; wrong currency; underpayment and overpayment; Paystack verification not successful; already-confirmed payment and second payment after confirmation; Full Report payment not creating/unlocking a Current State engagement; Current State payment bound to its exact Business Check token; tampered/cross-check token; manual confirmation permission and actor audit; at most one engagement and one invitation after confirmation.

The payment engine was not changed. Live/test Paystack key mode and the dashboard webhook URL are configuration checks, not verified from source.

## G. Rate-limit inventory

All limits below use the shared database-backed limiter (hashed subjects and fixed windows). If the database limiter cannot be used, the existing code temporarily falls back to per-instance memory; that fallback is not cross-instance enforcement.

| Sensitive action | Existing or added limit | Result |
|---|---|---|
| Business Check start | 20 per IP / 15 min and 5 per IP+email / 15 min | Existing, verified |
| Business Check completion | 3 per check token / hour | Existing, verified |
| Login | 5 per IP+email / 15 min, plus per-account lockout | Existing, verified |
| Admin login | Internal account login shares the 5 per IP+email / 15 min limit; legacy admin-password verification has a five-failure account lockout | Existing, verified |
| Password-reset request | 5 per IP and 5 per normalized email / hour | Existing, verified |
| Reset-token preview/use | 30 per IP / hour | Existing, verified |
| Onboarding acceptance | 10 per IP+action / 15 min | Existing, verified |
| Join acceptance | 10 per IP+action / 15 min | Existing, verified |
| Send sign-in link | 10 per internal actor / hour | Added |
| Resend onboarding invitation | 10 per internal actor / hour | Added |
| Full Report request | 5 per check token / day | Existing, verified |
| Full Report intake read/submit | 30 per intake token / hour | Existing, verified |
| Full Report download | 5 per intake token / day | Existing, verified |
| Payment initiation | 10 per Business Check token / hour | Existing, verified |
| Payment page reads | 60 per Business Check token / hour | Existing, verified |
| Payment status polling | 20 per Paystack reference and 60 per IP / hour | Existing, verified |
| File upload ticket/legacy upload route | 30 per actor or IP / day, before multipart parsing on legacy routes | Added |
| Engagement comments | 60 per actor / hour | Added |

## H. File security result

Engagement files use the configured Supabase service role only on the server, a private bucket, one-off signed uploads, five-minute signed downloads, `x-upsert: false`, UUID-prefixed object names, sanitized path leaves, exact task/deliverable and business authorization, and a 25 MB cap. The type allowlist rejects HTML, SVG, executables, and mismatched dangerous types. Legacy participant uploads use a 15 MB cap, MIME allowlist, participant-scoped path, and now receive IP throttling before Multer parses the file. Duplicate overwrite is disabled for signed engagement uploads. Cross-business and path-traversal confirmation/link cases are tested. The production Supabase engagement Storage bucket was manually confirmed private.

## I. OWNER_ADMIN_EMAIL result

The bridge is retained. Tests verify generic account responses, random reset tokens stored only as hashes, expiry, single-use/revocation, session revocation on reset, rate-limited requests, and first-password bootstrap restricted to the configured owner address. No arbitrary address can become `super_admin` through that path. Operational launch requirement: the `OWNER_ADMIN_EMAIL` mailbox **must have MFA enabled and tightly controlled access**.

## J. Schema and migration changes

Migration `0011_bitter_squadron_sinister` adds two tables and supporting indexes: `business_support_email_deliveries` for operational Business Support message metadata and `resend_email_events` for unique provider events. It stores no email bodies and leaves existing email behavior intact. The production migration is applied; `pnpm db:verify` passes 27/27.

## K. Files changed

- Runtime/email: `server/email.ts`, `server/emailDeliveryLog.ts`, `server/resendWebhook.ts`, `server/_core/env.ts`, `server/_core/app.ts`, `server/accountInvitations.ts`, `server/clientOnboarding.ts`, `server/fullReport/service.ts`, `server/payments.ts`, `server/routers/businessCheck.ts`, `server/routers/businessSupport.ts`, `server/routers/clientOnboarding.ts`, `server/routers/engagement.ts`, `server/engagements.ts`, `server/rateLimit.ts`.
- Schema/migration: `drizzle/schema.ts`, `drizzle/migrations/0011_bitter_squadron_sinister.sql`, `drizzle/migrations/meta/0011_snapshot.json`, `drizzle/migrations/meta/_journal.json`.
- Support UI/build output: `client/src/components/admin/BusinessChecksView.tsx`, `api/index.js` (generated by `pnpm build`).
- Tests: `test/client/pages/adminConsole.ui.test.tsx`, `test/db/contract.db.test.ts`, `test/db/engagements.db.test.ts`, `test/db/onlinePayment.db.test.ts`, `test/db/payments.db.test.ts`, `test/db/platform.db.test.ts`, `test/server/businessCheck.ui.test.tsx`, `test/server/clientOnboarding.test.ts`, `test/server/deploymentConfig.test.ts`, `test/server/email.businessSupport.test.ts`, `test/server/participantUploads.test.ts`, `test/server/postgresPersistence.test.ts`, `test/server/rateLimit.test.ts`, `test/server/resendWebhook.test.ts`, `test/shared/booking.test.ts`.
- Documentation/configuration: `.env.example`, `README.md`, `docs/product/01-prd.md`, `docs/product/02-technical-requirements.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`, `docs/vercel-env-inventory.md`, this report.

The pre-existing untracked audit/capabilities files are user-provided inputs, not implementation changes. `.gitignore` also has unrequested ignore entries for the audit, `.gitignore`, and `env.md`; that workspace change was not intentionally edited as part of Phase 2 and is excluded from the implementation file list.

## L. Tests added

- Resend production sender-domain policy and raw-body Svix verification/rejection/retry behavior.
- Tenant/workspace switching, member role escalation, unassigned engagement access, finance capability, and suspended-session proofs.
- Paystack token binding and overpayment refusal; existing concurrency/replay/race/reference/currency/status/manual-audit protections were confirmed in tests.
- HTML/SVG rejection, filename sanitation, and upload traversal rejection.
- Rate-limit inventory assertions and Business Support email status UI mock coverage.

## M. Verification results

Node used: `v22.23.3` (Node 22, satisfying 22.22.2+).

| Gate | Result |
|---|---|
| `pnpm check` | Passed |
| `pnpm check:tests` | Passed |
| `pnpm test` | Passed: 133 files passed, 5 skipped; 1,261 tests passed, 386 skipped |
| `pnpm build` | Passed; generated `api/index.js`. Vite reported the existing >500 kB chunk advisory. |
| `pnpm db:verify` | Passed: 27/27 after production migration 0011 was applied. |
| Targeted security tests | Passed: 8 files, 137 tests passed, 115 DB-mode skips; includes Resend signature/idempotence, upload traversal, tenant/role and Paystack cases. |

The production migration was applied by the operator. The configured `TEST_DATABASE_URL` resolves to the same host/database as `MIGRATION_DATABASE_URL`, so it was not treated as disposable staging. Nothing was pushed.

## N. Manual production actions still required

1. Independently confirm the Paystack production webhook URL and live/test mode in the Paystack dashboard.
2. Verify production email delivery with controlled messages to Gmail, Outlook/Hotmail, Yahoo, and a custom/corporate inbox. Confirm sender, Reply-To, canonical links and delivery-event logging.
3. Run the manual production smoke sequence for password reset, onboarding, Paystack test-mode flow, file authorization and legal pages.
4. Ensure the `OWNER_ADMIN_EMAIL` mailbox has MFA enabled and tightly controlled access.

## O. Residual P0 findings

No P0 code defect was demonstrated in the payment engine after direct procedure and route proof tests. The sender fallback risk is fixed in code. Paystack mode and the production webhook URL remain external configuration checks; controlled email delivery and end-to-end smoke tests are pending.

## P. Residual P1 findings

The Paystack production webhook URL still needs independent confirmation. Production inbox delivery and end-to-end smoke tests remain outstanding. The private Supabase engagement bucket setting was manually confirmed. The listed stale Vercel references remain only in the untracked descriptive capabilities report and do not affect runtime URLs.

## Q. Revised production-readiness score

**90/100, conditional on the manual actions above.** The audit baseline was 68/100. The additive migration and core production email configuration are confirmed, and the required code and test gates pass. Remaining points reflect the unconfirmed Paystack production webhook and pending controlled inbox/end-to-end smoke tests. This is a scoped Phase 2 score, not a claim that out-of-scope load/dependency work is complete.
