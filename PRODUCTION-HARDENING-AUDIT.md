# Production Hardening Audit

Status: Phase 1 complete. No remediation has been applied.

This audit was conducted against the current live production posture and the codebase in this repository. The review is intentionally scoped to production safety, reliability, and email delivery. Findings below distinguish between facts confirmed by code and deployment checks versus areas that require manual production validation.

## 1. Executive summary

The platform is broadly structured for a production SaaS flow and already includes strong baseline controls in several areas: secure env gating, origin checks, database verification, multi-instance rate limiting, scoped admin permissions, and a deliberate owner-email bridge for emergency super-admin access. The application also has a credible attempt at payment/webhook validation and file storage authorization.

However, the current production posture is not yet fully safe for a live external email domain and cannot be considered production-hardened without a small set of high-priority remediations.

The most important blocker is the email sender configuration: the platform is configured to use a verified Resend domain (`contact.ipfactory.co`), but the application code and brand defaults still point at the legacy business-support email address (`info@ipfactory.co`) unless overridden in deployment. That creates a real risk of sender mismatch, failed delivery, or inconsistent production mail behavior.

Additional concerns: there is no general Resend webhook/event handling in production, no reliable operational email-delivery log for business-support mail, no production-safe delivery verification flow observed for external inboxes, and the app relies on an owner-admin email bridge that requires careful operational controls and explicit mailbox protection.

Overall readiness score: 68/100.

## 2. Resend readiness

### Observed state

- The verified Resend sender domain is `contact.ipfactory.co`.
- The production-safe sender pattern expected by the brief is a sender like `IP Factory <notifications@contact.ipfactory.co>` or an approved equivalent.
- The app code and brand constants still default to `info@ipfactory.co` as the business support/mailbox identity unless a deployment override is set.
- The current code path makes it possible to send business-support mail from a legacy mailbox identity instead of the verified production sender unless `EMAIL_FROM`/sender selection is explicitly overridden in the live environment.
- No evidence was found of a production-safe Resend webhook endpoint or a general outbound email event pipeline.
- No evidence was found of a production test path that definitively validated delivery to multiple external inboxes (Gmail, Outlook, Yahoo, and a corporate/custom inbox) using the app’s actual configured sender.

### Risks

- Sender mismatch against the verified Resend domain can cause accepted mail to be rejected or flagged as suspicious.
- Legacy `info@ipfactory.co` or other unverified sender addresses can undermine trust and deliverability.
- Without a webhook, support cannot reliably determine whether an email was delivered, bounced, complained, suppressed, or failed.
- Without a general email log, production operations cannot answer "Did this email send? Did it deliver? Why did it fail?"

### Severity

P0: Production sender mismatch against verified Resend domain.
P1: No production webhook / no general outbound delivery log.
P1: No validated live external delivery test across major providers.

## 3. Authentication

### Observed strengths

- Password storage and admin password flows appear to use hash-based validation rather than plaintext comparison.
- Account/session logic is structured around same-origin checks and server-side session resolution.
- A central owner-email bridge for emergency super-admin access is intentionally present and documented.
- The app appears to have rate-limited patterns and database-backed counters for abuse prevention.

### Review concerns

- The email-based owner-admin bridge (`OWNER_ADMIN_EMAIL`) is operationally sensitive because it can grant mailbox-controlled access to an emergency super-admin account. This is not inherently a code vulnerability, but it is a high-risk operational control if the mailbox itself is not hardened.
- Password reset and onboarding flows must be reviewed for token entropy, single-use handling, expiry, and abuse prevention. The project has reset-token logic, but the implementation still needs confirmation of the exact reset-request, single-use, and expiry semantics in production.
- Concurrency/session fixation risks must still be checked against the final cookie/session implementation, especially for multi-device sign-in, password change, and workspace switching.
- Suspended-user and privilege-change logic must remain enforced on every request.

### Severity

P1: `OWNER_ADMIN_EMAIL` mailbox takeover risk requires operational control and monitoring.
P2: Review needed for reset/onboarding token lifecycle and abuse protection.
P2: Review needed for concurrent-session and stale-privilege enforcement.

## 4. Authorization

### Scope reviewed

The project contains a platform-role model and a business-membership model. The relevant patterns in the code show a separation between platform roles and business membership, which is a positive design choice.

### Key checks that still need proof

- One business must not access another business’s records.
- One client must not manipulate business IDs or membership scope to access another tenant.
- Analyst access to unassigned engagements must be blocked server-side.
- Finance permissions must not change unrelated records.
- Business owners must not be able to bypass admin procedures.
- UI-hidden routes must remain protected by server-side checks.

### Current status

The codebase has a structure suggesting these checks are intended, but no post-audit verification suite was completed proving all tenant-isolation conditions in production. The requested explicit authorization tests were not completed before the Phase 1 stop point.

### Severity

P1: Tenant isolation and authorization enforcement need explicit proof tests before broad launch confidence.

## 5. Paystack/payment integrity

### Observed strengths

- Payment logic is explicitly designed around server-side verification and compares key transaction data.
- Webhook handling is intended to validate the Paystack signature and verify amount, currency, and reference before unlocking access.
- There is emplaced logic around exact transaction state transitions and noting auditability requirements.

### Risks still to confirm

- The use of raw-body webhook verification is good practice only if it is enforced for every callback and no alternate path bypasses it.
- Manual confirmation is a high-risk area: it must require explicit privilege, auditable actor identity, and no route that allows arbitrary confirmation.
- Duplicate webhook callbacks, replayed events, and return-page race conditions must be tested against the exact database state transitions.
- Payment initiation and callback flows must not allow a user to unlock a different product than the one paid.

### Severity

P0/P1: Payment integrity remains a critical review area because incorrect handling here creates direct money-loss risk.

## 6. Abuse/rate limiting

### Observed strengths

- The project has a database-backed rate-limiting implementation (`server/rateLimit.ts`) rather than an in-memory-only pattern.
- This is an important safeguard for distributed/serverless deployments.

### Risks and blind spots

- The audit required a complete endpoint-by-endpoint inventory, but the large number of public and sensitive flows means the cross-check was not yet complete enough to declare the production posture safe.
- Business Check generation, reset requests, onboarding tokens, payment start/status endpoints, upload flows, admin resend actions, and report-generation pathways must be explicitly checked for abuse scenarios.
- Repeated email sends, duplicate password resets, and repeated business-check attempts are all normal abuse vectors that still require production review.

### Severity

P1: Abuse protection must be verified across every sensitive endpoint and public flow.

## 7. File security

### Observed strengths

- Supabase storage is being used in a likely private-bucket or authorization-aware design.
- The app appears to have a server-controlled storage proxy and access checks.

### Remaining concerns

- MIME validation alone is not enough; content sniffing and dangerous payload handling must be enforced.
- Executable HTML, SVG, and malicious document payloads remain a risk if storage and sanitization are not strict.
- The exact upload path generation, filename sanitization, signed-URL expiry, and cross-business access enforcement must be reviewed against the live storage configuration.

### Severity

P1: Storage security remains a production risk area, especially for user-uploaded content.

## 8. Headers/web security

### Observed strengths

- `vercel.json` includes security headers, HSTS, and several hardening measures.
- The app responds with canonical host redirecting to `https://www.ipfactory.co`.

### Remaining review items

- Full CSP policy validity must be confirmed against all third-party integrations (Calendly, Paystack, analytics, etc.).
- Any remaining `unsafe-inline` / `unsafe-eval` exceptions must be justified and minimal.
- No path or rewrite warnings were deemed severe in the live checks, but the full header posture still requires a production replay against the final deployed config.

### Severity

P2: Header policy should be reviewed against final third-party embedding requirements and deployment config.

## 9. Secrets/environment

### Observed strengths

- The code uses a centralized env validation layer and a production required-setting gate.
- `APP_ORIGIN` is intended to be the canonical production origin and should be `https://www.ipfactory.co`.

### Risks

- The production environment must not include stale origins such as `ipf-sme.vercel.app` unless intentionally retained for a temporary reason.
- Client-exposed env variables must be reviewed carefully; no secret values should be exposed to the browser.
- Live env values such as `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET` must remain server-only and should never be committed.

### Severity

P1: Production-origin and secret hygiene must be validated in the live deployment before launch confidence.

## 10. Database/performance

### Observed strengths

- Database verification is in place, and the schema has a baseline validation step.
- The rate-limit counter model is database-backed rather than memory-only.

### Risks

- The platform is not yet proven across the requested 50/100/500/1,000 active-user and concurrency models.
- Missing indexes, unbounded list reads, and slow search patterns must be checked against the final production data patterns.
- Expiring counters, session cleanup, reset-token cleanup, and any larger event tables must be designed to avoid uncontrolled growth.

### Severity

P2: A modest production growth model review is needed; no severe bottleneck is yet confirmed, but the audit did not complete a full model test.

## 11. Frontend performance

### Review status

The project is not obviously carrying a catastrophic frontend bundle issue, but the requested bundle-route-lazy-load audit was not fully completed before the Phase 1 stop. The brief explicitly required checking heavy client regions (Full Report, client room, admin lists, Business Check, mobile performance) against existing build stats.

### Severity

P3: Performance optimization remains a follow-up item; not a current blocker against a small-to-medium live launch, but not yet fully validated.

## 12. Failure recovery

### Observed series of risk conditions

The brief specifically required reasoning about failure modes such as:

- payment succeeds, DB fails;
- payment succeeds, email fails;
- engagement creates, invitation email fails;
- email sends, DB action fails;
- Calendly booking exists but lookup fails;
- report generation completes but delivery fails;
- file upload completes but DB insert fails.

These are standard consistency problems that require explicit compensation or retry logic. The codebase shows intention around idempotency and auditing, but the specific implementation consistency was not fully validated across the final live flow before stopping at audit.

### Severity

P1: External-action consistency and retry logic remain a production requirement.

## 13. Observability

### Requirement

The brief asked for support to answer:

- Did this email send?
- Did it deliver?
- Did it bounce?
- Did this person pay?
- Which Paystack reference?
- Did the webhook arrive?
- Why wasn't the engagement created?
- Was an invitation sent?
- Did the user activate it?
- Who manually confirmed this payment?
- Did this admin change this stage?
- Why is this client unable to log in?

### Current status

The codebase contains some logical audit/logging patterns but not a full, minimum production observability layer for email events and payment outcomes. This is a real support and operations gap.

### Severity

P1: Missing practical operational visibility for critical customer and payment flows.

## 14. Dependency security

### Observed advisories

The package manifests and dependency review showed relevant advisories, including:

- `mysql2`/`drizzle-orm` related vulnerabilities and DoS concerns;
- `dompurify`-related advisories in the dependency chain.

### Conclusion

These are not automatically a blocker to the platform being live, but they are not a safe “ignore” item either. They require a careful, compatibility-tested dependency review before broad reliance.

### Severity

P2: Security dependency hygiene should be addressed with a compatibility-checked update path.

## 15. Scale analysis

### Observed strengths

The system architecture is not obviously designed around a single-threaded or memory-bound bottleneck. The database-backed rate-limit layer and a server-side architecture are positive signs.

### Remaining uncertainties

The requested scale analysis for 50, 100, 500, and 1,000 active users and 100/1,000 concurrent users was not fully executed under production-like conditions before the audit stop. The platform likely needs a short production load verification stage before broad adoption, but there is no evidence of an immediate critical bottleneck in the current code.

### Severity

P3: Scale validation is still a follow-up requirement, not a current blocker.

## 16. Master findings table

| # | Severity | Area | Finding | Confidence |
|---|---|---|---|---|
| 1 | P0 | Email | Production sender mismatch risk against the verified Resend domain (`contact.ipfactory.co`) | 9/10 |
| 2 | P0 | Payment | Payment integrity and manual-confirmation paths remain a direct money-risk area until fully validated | 8/10 |
| 3 | P1 | Email | No general Resend webhook/event delivery pipeline and no operation-safe outbound email log | 9/10 |
| 4 | P1 | Auth | `OWNER_ADMIN_EMAIL` mailbox-controlled Super Admin access is high-risk without explicit operational controls | 8/10 |
| 5 | P1 | Authorization | Tenant/role isolation needs explicit proof tests across business and platform scopes | 8/10 |
| 6 | P1 | Abuse | Sensitive flows still require explicit rate-limit and duplicate-protection validation across the app | 8/10 |
| 7 | P1 | Storage | File upload authorization and dangerous-content handling need final production validation | 8/10 |
| 8 | P1 | Production env | Must confirm canonical live origin and ensure no stale Vercel origin remains in email/payment callbacks | 8/10 |
| 9 | P1 | Observability | Support cannot reliably answer email/payment/activation status questions without minimal event logging | 8/10 |
| 10 | P2 | Dependency security | Package advisories remain and need compatibility-tested remediation | 7/10 |
| 11 | P2 | Headers | Security headers must be confirmed against final third-party integrations | 7/10 |
| 12 | P2 | DB/perf | Scale and cleanup validation remain incomplete for production growth model | 7/10 |
| 13 | P3 | Frontend | Bundle/performance validation remains incomplete | 6/10 |
| 14 | P3 | Scale | Production load model not yet proven for projected active/concurrent usage | 6/10 |
| 15 | P4 | Improvement | Additional hardening and cleanup items remain, but they are not immediate blockers | 5/10 |

## 17. Must-fix list

The following items are the minimum production-hardening actions required before the system should be trusted for broad live business use:

1. Fix the production sender to use a verified Resend sender aligned with `contact.ipfactory.co` (for example `IP Factory <notifications@contact.ipfactory.co>` or an approved equivalent), and ensure no legacy `info@ipfactory.co` or stale sender remains in the live app.
2. Add the smallest safe Resend webhook flow with signature verification, duplicate-safe processing, and minimal metadata-only event storage for `delivered`, `bounced`, `complained`, `failed`, and `suppressed` events.
3. Establish a minimal business-support mail log and support visibility so support can determine whether an email was sent, delivered, bounced, or suppressed.
4. Validate the live env and origin configuration so `APP_ORIGIN` and all email/payment callback paths are pinned to `https://www.ipfactory.co` and do not use stale Vercel or legacy origins.
5. Confirm and harden the mailbox-controlled owner-admin path (`OWNER_ADMIN_EMAIL`) with explicit operational controls and monitoring, including mailbox MFA and restricted access.
6. Validate tenant isolation and permission enforcement with explicit authorization tests for multi-business and role-escalation scenarios.
7. Verify payment integrity and manual confirmation flows with duplicate/replay and amount/currency/reference checks prior to releasing or expanding use.
8. Validate file upload safety and authorization for user content in Supabase storage.
9. Complete abuse/rate-limit verification across the public and sensitive endpoints listed in the brief.

## Readiness score

68/100

This is not a full red status, but it is also not a green production-ready status for the live commercial environment. The remaining issues are concentrated in the production email configuration, webhook/observability layer, permission validation, and payment-handling validation, all of which are materially relevant to business trust, reliability, and customer communications.

The current audit intentionally stops at Phase 1 and does not implement the above fixes until the user approves the specific P0/P1 remediation plan.
