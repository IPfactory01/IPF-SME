# IPF SME Platform: Current Capabilities Report

**Audited:** `main` at commit `fd423a1` ("Admin console: Apple-style review (theme colours, drawer motion, press feedback)"), 14 October 2026.
**Update note (14 October):** this report was first written at `316422a` (13 October). It has been brought up to date for the 13 commits since (`316422a..fd423a1`, 77 files). That update was made by reading the diff, the new code and the updated product documents; **the build and test gates in section 23 were not re-run** and still describe `316422a`. Changed or new items are marked **(new 14 Oct)**.
**Method (original audit):** read the code, schema, migrations, tests and config as they are on `main`; ran the build gates. I did not call any live service, so anything that depends on what is set in Vercel, Supabase, Resend, Calendly or Paystack is marked **"cannot verify from code"**. No application files were edited, nothing was committed or pushed. This report is the only new file, and it is untracked.

---

## Phase 1: Sync result

| Item | Result |
|---|---|
| Repository | `/Users/macbook/Documents/Sotware Dev Projects/IPF/SME-Programme` (the git repo is this subfolder; the parent `IPF` folder is not a repo) |
| `origin` | `https://github.com/IPfactory01/IPF-SME.git` (correct). A second remote, `old-origin` (`IP-factory/SME-Programme`), is still configured |
| Working tree before sync | Clean, no uncommitted or untracked work |
| Before | local `main` = `b570110`, **0 ahead / 46 behind** `origin/main` (purely behind) |
| Action | `git fetch`, then `git merge --ff-only origin/main`. No reset, clean, force or merge commit |
| After | branch `main`, latest commit `316422aab312440b7f95a423dbe1b105a019c2a0`, message *"Full Report: consulting layout with an executive summary and charts"* |
| Match | `main` == `origin/main`: **yes** |
| **Re-sync, 14 Oct** | `git pull` fast-forwarded `316422a → fd423a1` (13 commits, 77 files, +7,856 / −3,427 lines; 7 new components/modules, 6 new test files). `main` and `origin/main` agree; `origin/claude/ipf-factory-sme-takeover-fugq1o` moved to the same commit. `old-origin` is still configured |

A branch `origin/claude/ipf-factory-sme-takeover-fugq1o` also exists; its tip is the same commit.

---

# 1. Executive summary

**What the app does end to end.** A business owner takes a free ten-minute Business Check on their phone and gets a colour-coded result with a summary. They can book a free 20-minute Discovery Call through an embedded Calendly calendar, or pay ₦100,000 on Paystack for a Full Report (a 17-question intake, then a PDF emailed automatically). After the call the team records Fit / Refer / Decline. For a Fit, the team emails a Paystack link for the ₦500,000 Current State Assessment. When Paystack confirms payment, the system marks the business Won, starts an engagement, and emails the client an invitation to create a password account. The client then lands in an "engagement room" where they see what is needed from them, upload files, see sessions and shared findings, and (in the fix phase) see the one number being tracked and the weekly check-in. The team runs all of this from an admin console.

**Added on 14 October (13 commits) (new 14 Oct):**
- **"Forgot your password?"** on `/login` and `/admin/login`: self-service reset links by email. The Super Admin can also set a first password this way, with no database access.
- **"Send sign-in link"** button on a client's record in the console (fresh invitation or a reset link, whichever fits).
- **Client room tabs: Founder · Business · Plan**, built from the owner's own Full Report (or Business Check result), plus a desktop layout and tappable area sheets.
- **Booking the two Current State Assessment Sessions on Calendly from the room**, with times recorded automatically (needs `CALENDLY_SESSION_URL` and `CALENDLY_API_TOKEN`).
- **Full Report v4**: the partner-style strategic plan with a 12-month revenue target and a 12-month work plan.
- **Home page trust content**: track record, evidence for the problem, Enzo Krypton & Co. named, named clients, sectors.
- **Business Check feel**: phone back gesture steps back one question; reduced-motion, transparency and contrast respected.
- **Admin console visual pass** to theme tokens, with drawer motion and press feedback.

**Earlier additions (9–12 October, 46 commits):**
1. Paystack online payment: hosted checkout, signed webhook, return page, a single confirmation path. Bank transfer and proof-of-payment were built and then removed within days.
2. The paid Full Report: intake form, deterministic PDF, instant email.
3. The engagement room for clients and staff, with the Work Plan, files, deliverables with approval, and the fix measure and weekly check-in.
4. Calendly embedded on the result page, with booking times read back into the admin console.
5. Resend email with branding as "The Shift, by IP Factory", with a retry and duplicate-send protection.
6. Hardening: shared rate limits, password-reset links issued by staff, account suspension, JUMP public forms closed, security headers, DB pool and timeouts.
7. A full set of product documents in `docs/product/`, with tests that fail if code and docs drift.

**What is still missing or incomplete:** automated reminders of any kind for Business Support; Calendly webhooks (cancel/reschedule/no-show are not tracked); the close-out and day-30 review (migration 0011 is not written); a payments list/ledger in the console; refunds; in-app notifications; a client-facing Business Check/payments/reports area; and the AI summary still depends on the Manus "Forge" service.

**Live vs partial.** Fully built in code: Business Check, Full Report, Paystack payment, onboarding, accounts, roles, admin console, engagement room, files. Whether each is *live in production* depends on Vercel/Resend/Paystack/Calendly/Supabase settings that I cannot see (see section 22 and "What I Need to Know Right Now").

---

# 2. Current end-to-end journey

Legend: ✅ Fully implemented · 🟡 Partial · ❌ Not implemented · 🕰 Legacy

| # | Step | Status | What happens |
|---|---|---|---|
| 1 | **Visitor on `/`** | ✅ | Public home page ("Find it. Fix it. See the results.", journey with prices, "Client sign in" link). **(new 14 Oct)** Now also a track-record strip (250+ clients, 50+ years of partner experience, since 2011), sourced evidence for the problem, "The experience behind The Shift" (IP Factory as the delivery arm of Enzo Krypton & Co., with a link), sectors, and three named clients (Ruff 'n' Tumble, SKLD, MAX) described by the work only. A JUMP participant sign-in dialog still exists in the page code (🕰, closed on the server unless `LEGACY_JUMP_ENABLED`). |
| 2 | **Start Business Check (`/check`)** | ✅ | First screen collects name, email, WhatsApp (international format picker, Nigeria default), "heard from". Saved as a **Lead** immediately (`business_checks`, stage `lead`, public token). No email at this point. Rate limited: 20 starts/15 min per IP, 5 per IP+email. |
| 3 | **Answer the check** | ✅ | Business name and description are required. A decision tree asks only the relevant areas. Progress is saved to the server after each answer, so an abandoned check still shows where the owner stopped. Back/Next reach every earlier answer. |
| 4 | **Submit and result** | ✅ | Server evaluates by fixed rules, writes a summary (AI, or rules fallback), stores result JSON, moves stage to **Qualified lead**, and emails the owner and the office (`info@ipfactory.co`). The page states whether the email was really sent (`Sent / Failed / Simulated`). |
| 5a | **Book Discovery Call** (button on result) | ✅ | Calendly event is embedded; if blocked, it opens in a new tab. When Calendly reports a booking, the server reads the real time from Calendly's API (if `CALENDLY_API_TOKEN` is set) and stores `callScheduledFor`. Stage moves to **Call booked**. Office is emailed. Calendly itself emails the invitee. |
| 5b | **Full Report** (button on result or link in the summary email) | ✅ | Creates a payment request (₦100,000), emails payment details with a "Pay online" link, and tells the office. |
| 6 | **Discovery Call held** | 🟡 | The call happens on Calendly/phone, outside the app. The team writes it up in a "Discovery Call record" (what was heard, problem in owner's words, what success looks like, what was tried, next steps) and can share it with the client. No automated reminders to anyone. |
| 7 | **Fit / Refer / Decline** | ✅ (manual) | Admin records the outcome: Fit → **Opportunity**, Refer → **Referred**, Decline → **Lost**. Also "Nurture". Audited. **No email is sent to the owner on any outcome.** |
| 8 | **Send Current State Assessment payment link** | ✅ (manual) | Admin (needs `manage_payments`) sends the ₦500,000 payment email. For a business at Lead/Qualified/Call-booked stage this also moves it to Opportunity. Link holds 48 hours (display rule, sending again opens a new window). |
| 9 | **Pay on Paystack** | ✅ in code | Pay page `/pay/<token>/<item>` → Paystack hosted checkout (card, bank transfer, USSD) → `/pay/return`. Confirmed by whichever arrives first, the signed webhook or the return page. Test/live mode follows the key prefix. |
| 10 | **Automatic consequences of a Current State payment** | ✅ | In one path: payment confirmed → stage **Won** → confirmation email → **engagement created** (stage "Getting set up", with the assessment template of data requests) → **client account invitation emailed** → office emailed "Paid online". |
| 11 | **Onboarding / activation (`/onboarding/<token>`)** | ✅ | Client sets name, business name, password. Creates user, business, owner membership and session, and links the engagement to the business. Link: single use, 7 days. |
| 12 | **Client dashboard (`/dashboard`)** | ✅ | Before the engagement exists: welcome + "finish your business profile" prompt. After: the engagement room (section 11). |
| 13 | **Current State Assessment** | 🟡 | A two-week, two-session engagement run by the team inside the room (data requests, sessions, notes, findings). **(new 14 Oct)** The owner books Session 1 and Session 2 on Calendly from the room and the times are copied onto the engagement automatically (when configured). It is a service workflow, not a client-fillable assessment form. |
| 14 | **The Fix** | 🟡 | Prescription (needs desk-lead approval), tools, the one measure with baseline and target, weekly check-ins recorded by staff in order. Stage changes are manual. |
| 15 | **Plan / close / day-30 / follow-up** | ❌ | The "Plan" stage and "Closed" exist as labels; the close-out record, final value, extension weeks and day-30 check (migration 0011) are **not built**. |

**Full Report sub-journey** (✅; the report is now **version 4**, see section 3a): payment confirmed → email with a one-time Report Intake link (`/report/<token>`) → owner completes the 17-question form (≈12 min) → report built by fixed rules, rendered as PDF, **emailed immediately with no human review (by design)** → office notified → owner can download it again from the same link (5 downloads/day). Admin can see status, download the PDF and resend the intake link.

---

# 3. Free Business Check

- **Collected:** name, email, WhatsApp (`+` international format validated), how they heard of us; then business name and description (required), stage (idea / side business / main business, years trading), sector (the original 12 sectors), staff band, monthly revenue band, founder-readiness answers, and per-area questions. About 57 question definitions in `shared/businessCheck/questions.ts`.
- **Routing and scoring** (`shared/businessCheck/engine.ts`, deterministic): routes `idea`, `foundation` (very small), `programme`, `advisory` (over ₦25m/month or over 50 people; ends after the profile and goes to a conversation). Areas 1–8 are asked for early/main businesses; exit and value from 5+ years; owner transition for 10+. Follow-ups open only when an owner says an area is not clear. Outputs per-area health (clear / watch / stuck), one of four gaps, a primary area, founder readiness (advanced / intermediate / nascent), and recommended services from a catalogue. Covered by golden snapshot tests.
- **Summary:** an AI write-up is attempted (through the Manus "Forge" LLM endpoint, 25-second time budget), validated against the catalogue, and the **rules summary is used if the AI is unavailable or the key is missing**. The AI may only word the findings.
- **Persistence:** answers, result and summary JSON, `completedAt`, route, readiness, primary area. A finished check is final; later edits are ignored.
- **Email:** owner copy (summary, pay link for the Full Report) and an office copy to `info@ipfactory.co`, each with an idempotency key so retries cannot double-send. `notificationStatus` records the office delivery result.
- **Repeat submissions:** completion is claimed in a single conditional update, so a double click records once and emails once; later calls return the stored result. Limit 3 submits/hour per check. **Starting a new check with the same email creates a new, separate lead** (there is no de-duplication by email).
- **CTAs:** "Book my free Discovery Call" and "Get my Full Report".
- **Admin visibility:** Business Checks tab (section 10).
- **New since the earlier implementation:** Calendly embed and time read-back; Full Report CTA; required name/description; sector-fitted examples and "areas a check leaves out"; Paystack pay link in the summary email; IP Factory branding of the email; rate limits; Back/Next reaching every answer; Discovery Call naming.

---

# 3a. Full Report v4 (new 14 Oct)

The PDF changed from the earlier consulting layout to the layout of IP Factory's partner-written strategic plans (`REPORT_VERSION` 4): cover and contents; a **Background** (where the business stands, the scorecard, two framing facts, and the gap to the owner's **12-month revenue target** split into price, conversion and reach); nine numbered sections (Founder readiness, Strategic intent, Market and industry, Offer and proposition, Operational plan, The financial case with the target bridge, Risk, The work plan in three phases with a gate after Phase One, Outstanding items); and an appendix of every answer. Sections carry numbered Recommendations that the work plan refers to. Charts are drawn only when the owner gave the numbers. The intake gained one optional question, the monthly sales wanted in 12 months; if skipped, Section Nine asks for it. Delivery is unchanged: instant, emailed, no human review. Golden snapshots were regenerated (`build.test.ts.snap`).

---

# 4. Calendly / discovery booking

**Implemented (partially): embed + API lookup. No webhooks.**

| Question | Answer (from code) |
|---|---|
| Where | Result page of the Business Check (`client/src/pages/BusinessCheck.tsx`), via `shared/booking.ts` |
| Event | `https://calendly.com/ipfactory-info/ipf-free-20-minute-discovery-call` (default in `shared/brand.ts`); override with `DISCOVERY_CALL_URL`. A non-Calendly URL opens in a new tab |
| Embedded or external | Embedded inline with name/email prefilled; if blocked, a button opens Calendly in a new tab |
| Link to the prospect | The embed is prefilled with the owner's name and email; the Business Check's token identifies the record when the page calls `requestNext` |
| Time saved in our DB? | **Yes**, `business_checks.callScheduledFor`, but only if `CALENDLY_API_TOKEN` is set. The browser passes only the Calendly event URI (regex-validated); the server fetches the event and the invitee from Calendly and checks it is **active** and booked with the **same email** as the check. Without a token, the call shows as "Call requested" with no time |
| Booking made elsewhere | When the admin console opens, calls still without a time are looked up by invitee email (up to 10 per load) and filled in |
| Webhook | **None.** No Calendly webhook endpoint exists |
| Rescheduling / cancellation / no-show | **Not tracked.** If the owner reschedules or cancels in Calendly, the stored time is not updated unless the admin console's email lookup happens to re-read it (it only fills calls that have no time) |
| Reminders | **None from the app.** Calendly's own emails are the only reminder. The JUMP 24-hour reminder job is legacy and hard-disabled |
| Admin visibility | Discovery Calls tab shows "Discovery Call booked" with date/time; drawer shows "Booked on Calendly for …"; audit action `business_check_call_booked` |
| Old manual scheduling | Still exists: admin can "record a time" for a call agreed another way (`scheduleCall`). The older JUMP slot-booking (`/schedule`, `schedule_slots`, `schedule_bookings`) is also still present (legacy) |
| Fallback if Calendly fails | The call is still recorded as requested and the office is emailed; the time is simply blank. Calendly API calls time out after 5 seconds and log a warning; they never block the owner |
| Engagement sessions **(changed 14 Oct)** | **Now read from Calendly, when configured.** A second, separate booking page (`CALENDLY_SESSION_URL`, one 90-minute event type booked twice) is offered to the owner in the room as "Book Current State Assessment Session 1", then "Session 2", opening Calendly with name and email prefilled. Whenever the room or the team's record opens (at most once per 15 seconds per engagement), the server asks Calendly for the owner's active bookings of that event type and copies the time, length and meeting link onto the next Session still without a time, in order. Already-timed Sessions are left alone; audited as `engagement_session_booked` by the system. Discovery Call lookups now skip Session bookings, so the two are never confused. Needs both `CALENDLY_SESSION_URL` and `CALENDLY_API_TOKEN`; otherwise staff still enter times by hand. Still **no webhook**: a cancelled or rescheduled Session is not updated |

---

# 5. Resend / email

**Resend is the only transport that the Business Support flow uses** (`server/email.ts`). Gmail (`server/gmail.ts`) and Google Workspace code remain for the JUMP era.

| Trigger | Recipient | Purpose | Sender | Automated? | Logged? |
|---|---|---|---|---|---|
| Business Check submitted | Owner | Result summary + Full Report pay link | IP Factory (business_support) | Yes | `business_checks.notificationStatus` (office copy status only) |
| Business Check submitted | Office `info@ipfactory.co` | New completed check | business_support | Yes | same |
| Discovery Call requested / booked | Office | Call request, with Calendly time if known | business_support | Yes | Audit row only when a time is booked |
| Full Report requested | Office | Notice, includes payment-email status | business_support | Yes | Audit |
| Payment link sent (Full Report or Assessment) | Owner | Amount, reference, "Pay online" link | business_support | Report: automatic. Assessment: admin clicks | `payment_requests.deliveryStatus` + audit `payment_details_sent` |
| Payment confirmed | Owner | Receipt-style confirmation (+ Report Intake link for Full Report) | business_support | Yes | Audit `payment_confirmation_sent` with delivery status |
| Payment confirmed online | Office | "Paid online: nothing to do" + what ran (engagement, invitation) | business_support | Yes | Not stored |
| Payment mismatch / second payment | Office | "Paystack payment needs a look" | business_support | Yes | Audit `payment_online_refused` |
| Report Intake link resent | Owner | New intake link | business_support | Admin click | Audit |
| Full Report finished | Owner (PDF attached) and Office | Delivery of the report; "Full Report sent" notice | business_support | Yes | Audit `full_report_delivered` |
| Current State payment confirmed | Owner | Client account invitation (7-day link) | business_support | Yes | Invitation row + audit |
| Staff invite / client team-seat invite | Invitee | Account creation link | business_support | Admin/owner click | Invitation row |
| Password reset issued by team | Person | Reset link (single use) | business_support | Admin click | Reset-token row + audit |
| **"Forgot your password?" (new 14 Oct)** | Person who asked | Reset link, or "Set your password" for the owner's first password | business_support | Person's own request | Reset-token row + audit `account_password_reset_requested`. Never returned to the browser |
| **"Send sign-in link" (new 14 Oct)** | Client | Fresh invitation, or a reset link | business_support | Admin click | Invitation or reset row + audit |
| Notes or deliverable shared with client | Client | "Engagement update" | business_support | On share | Not stored |
| JUMP registration, portal links, pricing requests, reminders, admin invitations | JUMP participants / admins | Legacy programme mail | JUMP mailbox (`jump@emmanueltarfa.com`) | Only if `LEGACY_JUMP_ENABLED` | `email_logs` (JUMP tables only) |

- **FROM:** `EMAIL_FROM` is honoured for Business Support mail, **except** any value containing `emmanueltarfa.com`, which is ignored in favour of `IP Factory <info@ipfactory.co>`. **Reply-To** is always `info@ipfactory.co`. JUMP mail always uses the JUMP mailbox.
- **Domain assumptions:** `ipfactory.co` must be verified in Resend, otherwise Resend's test sender `onboarding@resend.dev` only delivers to the Resend account owner. **I cannot tell from code whether the domain is verified or whether `RESEND_API_KEY` is set in production.** The code does require `RESEND_API_KEY` in production (`/api/health` returns 503 without it).
- **Failure handling:** `deliverEmail` never throws. 8-second timeout, **one retry** on 429/5xx/timeout (respecting a short Retry-After), no retry on refusals. Results are `Sent / Simulated / Failed`; the UI and office notices report failures with the reason.
- **Duplicate protection:** Resend `Idempotency-Key` on each record+message (kept 24 hours by Resend), plus application-level claims (check completion, payment confirmation are one conditional statement).
- **Logging:** There is **no general outbound email log** for The Shift. Delivery state lives in a few columns and the audit log (above). The `email_logs` table serves JUMP only.
- **Resend/retry from admin:** payment details, payment confirmation (Assessment), Report Intake link and invitations can be re-sent from the console. There is no inbound Resend webhook, so **bounces and complaints are not tracked**.
- Tests never send; the live Resend tests are opt-in (`VALIDATE_RESEND_*`).

---

# 6. Paystack / payment

**Business Support payment: implemented and complete in code, Paystack only.**

- **What can be paid for:** the Full Report (₦100,000) and the Current State Assessment (₦500,000). The Fix (₦1.2m) and plan/ongoing support are **not** payable in the app.
- **Where:** Full Report: from the result page or the link in the summary email (the owner can start it themselves, any time after finishing the check). Assessment: only after the team sends payment details following the Discovery Call.
- **Amount source:** `PRICES` in `shared/businessSupport.ts`, stored on the `payment_requests` row. The browser never supplies an amount. Sent to Paystack as kobo (`amountNaira × 100`).
- **Initiation:** `/pay/<businessCheckToken>/<item>` → server calls Paystack `transaction/initialize` → redirect to hosted checkout. Each attempt gets its own reference `TS-R-000123-<8 hex>` (Paystack refuses duplicate references).
- **Callback and webhook:** `/pay/return` asks the server for status; `POST /api/paystack/webhook` is registered **before** the JSON parser and outside the browser-origin guard so the HMAC can be checked on the raw bytes.
- **Signature verification:** HMAC-SHA512 of the raw body with the secret key, constant-time compare; bad or missing signature → 401, nothing happens.
- **Verification:** the server never trusts the webhook or return page. It calls Paystack `transaction/verify` and requires: reference matches the request, status `success`, currency NGN, amount exactly equals the request's kobo amount.
- **States:** requested → confirmed (plus legacy `proof_received`). "Expired" is a display state computed after 48 hours without payment; it is not stored.
- **Idempotency and duplicates:** confirmation is claimed by one conditional `UPDATE … WHERE status <> 'confirmed'` inside a transaction with the audit row and the report link; the webhook and the return page can race safely. A second payment on an item already paid triggers an office alert ("paid twice").
- **Failed/pending:** Paystack "ongoing/pending/processing" is shown as pending; failures show as failed; an amount/currency/reference mismatch is shown to the owner as pending and the office gets "needs a look" (nothing is confirmed).
- **If the platform fails to update after money moves:** webhook returns 500 when the DB or Paystack cannot be reached, so Paystack retries; the return page can also settle it; the admin has "Confirm by hand" (needs `manage_payments`) as a fallback. There is **no scheduled reconciliation job** that sweeps unconfirmed payments.
- **Admin visibility:** payment chips and actions live inside the Business Check / Discovery Call drawers (send link, confirm by hand, resend confirmation). **There is no standalone payments list, ledger, export or finance dashboard.**
- **Receipts:** only our "Payment received" email. Paystack's own receipt is outside our control. **Refunds: none in the app**; they would be done in the Paystack dashboard, with the alert emails prompting a person.
- **Test mode:** a `sk_test_` key makes every pay page and email carry a "TEST MODE – NO REAL MONEY MOVED" notice, and the office emails are prefixed "TEST:".
- **Is it live?** Code requires `PAYSTACK_SECRET_KEY` in production. Whether it is a test or live key, and whether the webhook URL `https://ipf-sme.vercel.app/api/paystack/webhook` is set in Paystack, **cannot be verified from code**. The README says "Paystack goes live once `PAYSTACK_SECRET_KEY` is in Vercel and the webhook is set in Paystack (test key first)".

**Legacy JUMP payment functionality (separate, not wired into Business Support):** participant payment milestones, payment instructions, bank-transfer receipt uploads (`participant_payment_receipts`, `/api/payment-receipt-upload`), `paymentInstructions` router, `us-to-nigeria` research docs, and Paystack callbacks in `registration.ts`. These are gated by `LEGACY_JUMP_ENABLED` (public ones) or the legacy admin permissions. Note: a **bank-transfer-with-proof flow was built on 10–11 October for Business Support and then removed** in `f145324`; `proof_received` remains only as an enum value for old rows.

---

# 7. Onboarding

- **Who can invite:** anyone with `manage_client_onboarding` (Super Admin, or an admin granted it via the legacy permission profile). Platform staff invitations and client seat invitations are separate (below).
- **Eligibility:** the Current State Assessment payment must be confirmed. Before payment the server **refuses unless the admin gives a recorded reason** (≥5 characters, stored in the audit log with the invitation). An address that already has an account or is reserved for an admin is refused.
- **Automatic:** confirming the Assessment payment (by Paystack or by hand) sends the invitation automatically unless one is pending/accepted. The admin can re-send from Client Onboarding.
- **Generation:** 256-bit random token; only its SHA-256 is stored; the raw token exists only in the emailed URL. Issuing a new invitation revokes any pending one.
- **Expiry:** 7 days. **Revocation:** admin can revoke from Client Onboarding. Single use.
- **Activation (`/onboarding/<token>`):** client confirms name and business name, sets a password (≥10 chars, letter + number, ≤128), same-origin checked, rate limited.
- **What is created:** a `users` row, credentials, a `businesses` row, an **owner** `business_memberships` row, a session, and the engagement is linked to the business.
- **First login → dashboard:** signed in at once; `/dashboard` shows the engagement room (or a "room opens when your Current State Assessment starts" message).
- **Newly added:** Paystack-triggered invitations (recorded as a system actor), the "reason to invite before payment" rule, and the owner's team-seat invitation.
- **Also new:** `/join/<token>` invitations for IP Factory staff (invited by the Super Admin with a platform role) and for the owner's one free team seat (access "full" or "contributor").

---

# 8. Authentication and accounts

- **One identity per person** (`users` + `user_credentials`), password-based. Sessions are database-backed (`user_sessions`), cookie `ipf_session`, 14 days. Passwords hashed server-side.
- **Routes today:** clients `/login` (with "Forgot your password?"); staff `/admin/login` (same universal account, "internal only", also with "Forgot your password?"); `/dashboard`, `/settings/account`, `/settings/business`; reset `/reset/<token>`; invitations `/onboarding/<token>` and `/join/<token>`.
- **Lockout/rate limits:** 5 failed attempts → 15-minute lock; shared rate-limit counters now live in the database (`rate_limit_counters`) so limits hold across serverless instances.
- **Password reset (changed 14 Oct):** **"Forgot your password?" now exists** on both `/login` and `/admin/login` (`account.requestReset`). The person types their email; the page always answers the same ("If an account uses that email…"), whether or not an account exists, and the link is only ever emailed. Limited to 5 requests an hour per email and per IP. Suspended accounts and accounts with no password get nothing. The link is single use, 20 minutes, hash-only, and signs the person out everywhere when used. A person with `manage_users` (Super Admin) can still issue a link from People, and anyone with `manage_client_onboarding` can send a **client** a sign-in link from the client's record (this never reaches a staff account). Suspension revokes all sessions at once.
- **Owner's first password (new 14 Oct):** for the address in `OWNER_ADMIN_EMAIL`, the same form creates the owner's account if the database has none, and the emailed link sets the first password and stores the `super_admin` role. `pnpm owner:bootstrap` is therefore no longer the only way in. **Security consequence worth knowing:** control of that mailbox is control of the platform.
- **Change password:** available in account settings (checks the current password).
- **Logout:** `account.signOut` and `auth.logout` (clears both cookie types).
- **Workspace switching:** supported (`account.switchWorkspace`, `WorkspaceSwitcher`); a person can belong to several businesses, and an active business is stored on the session.
- **Legacy paths still in code:** `/admin/login/legacy` (admin credentials / Google, `admin_credentials`, `admin_invitations`, `/admin/invite`, `/admin/reset`), Manus OAuth (`/api/oauth/callback`, needs `VITE_APP_ID` etc.), and the JUMP participant portal (`/portal`, `/portal/password`, participant tokens/credentials). The Super Admin is recognised by `OWNER_ADMIN_EMAIL` or a stored `super_admin` role (`pnpm owner:bootstrap`).

---

# 9. Roles and permissions

**Platform roles** (`user_platform_roles`; a person can hold several): `super_admin`, `admin`, `desk_lead`, `analyst`, `partner`, `subject_matter_expert`, `finance`. **Business membership roles:** `owner`, `business_admin`, `member`. Note `client` is *not* a stored role; a client is simply someone with a business membership.

| Role | Platform permissions granted by the role (`shared/platformPermissions.ts`) |
|---|---|
| super_admin | everything (all 15), including manage_roles, manage_users, manage_admins |
| admin | **nothing by itself**; capability-based via the legacy admin permission profile (e.g. manage_client_onboarding, manage_payments, manage_scheduling) |
| desk_lead | view_all_businesses, manage_engagements, assign_engagements, review_engagements, manage_scheduling, manage_communications |
| analyst | view_assigned_businesses, manage_engagements |
| partner | view_assigned_businesses, review_engagements |
| subject_matter_expert | view_assigned_businesses |
| finance | manage_payments, view_financials |

| Business role | Capabilities inside their business |
|---|---|
| owner | view, dashboard, edit profile, manage members, invite team members, manage billing |
| business_admin | view, dashboard, edit profile, manage members |
| member | view, dashboard |

Team-seat staff additionally carry "full" or "contributor" client access (contributors see only what is assigned to them).

**Capability matrix (what the admin console actually lets each role do, by code):**

| Capability | Super admin | Admin (with grants) | Desk lead | Analyst | Partner | SME | Finance |
|---|---|---|---|---|---|---|---|
| Business Checks / Discovery Calls / Client Onboarding tabs (`manage_client_onboarding`) | ✅ | if granted | ❌ | ❌ | ❌ | ❌ | ❌ |
| Change funnel stage / record call outcome | ✅ | if granted onboarding | ❌ | ❌ | ❌ | ❌ | ❌ |
| Send payment links, confirm payment by hand (`manage_payments`) | ✅ | if granted | ❌ | ❌ | ❌ | ❌ | ✅ (but see note) |
| Clients tab (`view_all_businesses`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Engagements: see all | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Engagements: see assigned only | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Work on engagements (tasks, sessions, notes) | ✅ | ❌ | ✅ | ✅ (assigned) | ❌ | ❌ | ❌ |
| Assign team, approve prescriptions/plans | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Grant/revoke roles, invite staff, reset passwords, suspend (`manage_roles`/`manage_users`) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin Team tab | ✅ only | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| JUMP legacy tab (`view_participants`) | ✅ | if granted | ❌ | ❌ | ❌ | ❌ | ❌ |

**Observations from the code (worth confirming with the developer):**
- **Finance has `manage_payments` but no console section is shown for it.** The payment buttons live inside the Business Check/Discovery Call drawers, which require `manage_client_onboarding`. A finance-only person would see an empty console ("no admin responsibilities assigned"). The server would allow the calls; the UI offers no way to reach them.
- **Desk lead, analyst, partner and SME cannot see the sales funnel** at all (no `manage_client_onboarding`); that is by design but confirm it is what you want.
- The `view_assigned_businesses` scope is enforced by `engagement_team` assignment: an engagement outside a person's assignments returns "not found".
- **Multiple roles per person:** supported. **Manage roles:** Super Admin only. **Issue onboarding invitations:** `manage_client_onboarding`. **See payments:** `manage_payments` (and the payment chips in funnel drawers). **Change funnel statuses:** `manage_client_onboarding`; "Won" only ever comes from a confirmed payment. **Access client businesses:** staff via engagement assignment or `view_all_businesses`; a business owner only their own business.

---

# 10. Admin console (`/admin`)

Tabs appear only if the server-resolved permissions allow them. Seven sections:

| Tab | Permission | Purpose and content | Filters / actions |
|---|---|---|---|
| **Business Checks** | `manage_client_onboarding` | All Free Business Checks. Metric cards: Business Checks, Completed, Discovery Calls requested, Ready to onboard, Full Reports requested. Columns: prospect, business, check status, main finding, funnel status, payment chips | Stage tabs (All, Lead, Qualified lead, Discovery Call booked, Opportunity, Won, Lost, Nurture, Referred) with counts; text search (name, business, email, WhatsApp). **Detail drawer:** answers/result, stage history (audit), move stage with note (not to Lead/Won), record call time, Discovery Call record, send payment links, confirm payment, resend confirmation, Full Report status/download/resend intake |
| **Discovery Calls** | `manage_client_onboarding` | Calls requested/booked and outcomes | Status filter (requested, booked, Opportunity, Referred, Lost); record time; record outcome Fit/Refer/Decline; write and share the Discovery Call record |
| **Client Onboarding** | `manage_client_onboarding` | Candidates (Opportunities), invitations, metrics | Invite (with override reason if unpaid), revoke, resend |
| **Engagements** | `view_all_businesses` or `view_assigned_businesses` | Engagement list, "paid assessments with no engagement" safety net, file-storage status (names the missing setting) | Open an engagement: stage, team, problem area and statement, sessions, Work Plan by week (data requests and actions with factor internal/external), notes (client/internal, share with owner or business), deliverables (draft → approval → shared), comments, files, the Fix measure and weekly check-ins |
| **Clients** | `view_all_businesses` | List of onboarded businesses | Read-only list. **(new 14 Oct)** The client's record in Engagements has a **Send sign-in link** button (needs `manage_client_onboarding`) |
| **Admin Team** | Super Admin only | Staff list from platform roles; grant/revoke roles; invite staff; People panel (issue reset link, suspend/reinstate); legacy admin list and invitations | |
| **JUMP Programme (Legacy)** | `view_participants` | The old JUMP registration desk, unchanged | Legacy actions |

There is **no payments tab, no audit-log viewer, no email-log viewer and no settings tab.** The audit trail is written (`admin_access_audit_events`) and shown as stage history inside drawers, but is not browsable on its own.

---

# 11. Client dashboard

`/dashboard` (plus `/settings/account`, `/settings/business`). What exists:

- **Before the engagement starts:** a welcome and a business-profile completion card (name, description, year founded, sector, website).
- **Three tabs (new 14 Oct): Founder · Business · Plan**, opening on Plan, for the owner and full-access staff (a contributor sees Plan only; links `#founder`, `#business`, `#plan` work; swipe or arrow keys move between tabs). **Founder** shows Sections One and Two of the owner's Full Report (founder readiness, money basics, strategic intent, the 12-month target and how the gap closes). **Business** lists every other area with its health and finding; tapping one opens a sheet (a side panel on desktop) with the reading, the numbered Recommendation (First move, This week, Number to watch) and benchmarks. Without a delivered Full Report the tabs show the Business Check result instead. They are rebuilt from stored answers (`shared/fullReport/insight.ts`) and sent by the server only to those allowed. A report buyer who never paid for the Assessment has no account and so no room.
- **Desktop layout (new 14 Oct):** on a laptop or desktop the room spreads across the page: where you are beside what to do next, with a side column holding "Waiting on you" and Deliverables; lines in it jump to the relevant timeline step. Numbered questions in Data Requests display as a real list.
- **Book Session 1 / 2 (new 14 Oct):** the owner's Calendly booking button, see section 4.
- **Engagement room (after the Assessment is paid):** where we are (journey: Getting set up → Current State Assessment → The Fix → Your Plan → Closed); what we need from you (data requests and actions, grouped by week, due dates, mark as sent, upload files); your team; next Session with link; session list with shared notes; the Discovery Call write-up once shared; the Problem Statement; deliverables you can comment on and accept; files; **the one number** (baseline, target, readings) and the weekly check-in once the Fix starts; Full Report status.
- **Owner extras:** manage one free team seat (invite, set Full/Contributor, remove) and choose what their staff see.
- **Settings:** account (name, password) and business profile (owner/business admin).
- **Not present:** a client view of their Business Check result, past emails, payment history/receipts, a downloadable reports area (the Full Report is reached via its emailed link), messaging (conversation is on WhatsApp/email by design), notifications, or a general document library.

---

# 12. Current State

Largely implemented as a **service-delivery workspace**, not a self-serve assessment.

- **UI:** team side (EngagementDetail) and client side (EngagementRoom).
- **Data model (migrations 0008/0009):** `engagements`, `engagement_team`, `engagement_sessions`, `engagement_tasks` (data_request / action; internal / external factor; week; order; status open → received → accepted / needs_more / done), `engagement_deliverables`, `engagement_files`, `engagement_comments`, plus `debriefs`.
- **Template:** a new engagement starts with a Current State Assessment template of data requests (week 1 due in 3 working days, week 2 in 8), request/agenda/finding outlines drawn from IP Factory's proposals; the team edits it.
- **Admin actions:** start by hand if missing, assign team, set stage, set problem area/statement, create sessions (two assessment calls), save notes, create/approve/share deliverables (findings, problem statement), request/confirm uploads.
- **Client actions:** mark data requests sent, upload files (if storage is configured), comment on and accept deliverables, choose who in their team sees notes.
- **Progress:** a stage journey and counted days/weeks against the 2-week assessment.
- **Emails:** only the "Engagement update" when notes or a deliverable are shared. No due-date reminders, no overdue chasers.
- **Remaining:** automatic reminders; assessment scoring or reports generated from client data; a client questionnaire; calendar integration for the two Sessions; AI assistance. The older **JUMP "Current Status Assessment"** (`current_status_assessments`, `StructuredDiagnostic`, consulting chat/report tables) is unrelated legacy.

---

# 13. Fix / intervention

**Partially implemented (the tracking half exists, the closing half does not).**

- **Engagement stages** `fix`, `plan`, `closed` exist and are set manually by staff.
- **Team assignment:** engagement lead, analyst, partner, specialist (expert) roles on `engagement_team`.
- **Prescription / Tools / Plan deliverables:** prescription and plan **require desk-lead approval** before they can be shared.
- **The Fix:** one measure per engagement (name, definition, unit, baseline, target) and **weekly check-ins** recorded in order (week N needs week N-1): the five-question template, measure reading, questions asked, hours by role, whether AI was used. The client sees the reading, not the hours.
- **Tasks/actions** exist (side: client or IP Factory).
- **Not built:** close-out record (final value, what moved, extension weeks, next problem area, ongoing support defined), the day-30 review, sign-off, and "migration 0011 `engagement_closes`". Milestone/progress reporting beyond the check-in list and a completion/outcomes report do not exist. Ongoing support and the ₦1.2m Fix are not invoiced or paid in-app.

---

# 14. Notifications and reminders

| System | Status |
|---|---|
| Transactional email (Resend) | ✅ Active in code (section 5) |
| In-app notifications | ❌ None |
| Scheduled reminders for Business Support (call reminders, payment-link expiry, overdue data requests, check-in reminders, Fix updates) | ❌ None |
| Cron jobs | `vercel.json` defines **no crons**. The only scheduled endpoint is `POST /api/scheduled/sendReminder`, the JUMP 24-hour session reminder; it needs `CRON_SECRET` and is **hard-disabled** (`OWNER_APPROVAL_REQUIRED_FOR_REMINDERS = true`): it answers "approval required" and sends nothing |
| Admin/office notifications | ✅ Email to `info@ipfactory.co` for checks, call and report requests, payments, alerts |
| Client notifications | ✅ Payment, report, invitation, engagement-update emails |
| Calendly reminders | Handled by Calendly itself, not by us |

Note `docs/vercel-env-inventory.md` describes `CRON_SECRET` as "required for scheduled reminders"; in practice nothing in The Shift uses it.

---

# 15. Data / database

PostgreSQL (Supabase) via Drizzle. **11 migrations (0000–0010)**; `pnpm db:verify` reports the connected database has 11 applied migrations matching the journal. Migrations 0005–0010 were applied to Supabase by hand-run scripts in `drizzle/supabase/` according to the repo docs. **0011 (`engagement_closes`) is planned, not written.** About 51 tables (52 `pgTable` definitions in the schema file), of which the JUMP-era ones remain.

| Entity | Tables | Used for |
|---|---|---|
| Users, sessions, credentials | `users`, `user_credentials`, `user_sessions`, `user_password_reset_tokens`, `rate_limit_counters` | Universal accounts, 14-day sessions, reset links, shared rate limits |
| Businesses and membership | `businesses`, `business_memberships`, `business_member_access` | Client workspaces, owner/admin/member roles, seat access level |
| Platform roles | `user_platform_roles` | Internal roles, many per person |
| Business Checks (the funnel) | `business_checks` | Lead through Won/Lost; answers, result, summary, call times, report request, Calendly time |
| Discovery Call record | `debriefs` | The call write-up and whether it is shared with the client |
| Payments | `payment_requests` | One row per check + item: amount, reference, status, delivery status, who confirmed, note with the Paystack reference |
| Full Report | `full_reports` | Intake link hash, stored intake answers, delivered time |
| Invitations | `client_onboarding_invitations`, `account_invitations` | Client onboarding and staff/seat invitations (token hashes only) |
| Engagement | `engagements`, `engagement_team`, `engagement_sessions`, `engagement_tasks`, `engagement_deliverables`, `engagement_files`, `engagement_comments`, `engagement_measures`, `engagement_checkins` | The room and the Fix |
| Audit | `admin_access_audit_events` | Who did what (stage changes, payments, invitations, sign-ins) |
| Legacy JUMP | `registrations`, `participant_*`, `schedule_*`, `scheduled_reminder_deliveries`, `current_status_assessments`, `consulting_*`, `pricing_requests`, `email_logs`, `inbound_email_replies`, `admin_*` | Old programme; not used by Business Support |

Files for the room go to a **private Supabase Storage bucket**; the metadata is in `engagement_files`.

---

# 16. External integrations

| Integration | Purpose | Current status | Where used | Required env vars | Notes |
|---|---|---|---|---|---|
| Supabase (Postgres) | Database | Live architecture | `server/db.ts`, drizzle | `DATABASE_URL` (runtime, pooler 6543), `MIGRATION_DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_SSL_CA` | Pool of 5, 8s query timeout |
| Supabase Storage | Engagement-room files | Built; **off until all 3 vars are set** | `server/fileStorage.ts` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Admin Engagements tab names what is missing |
| Vercel | Hosting, one function `api/index.js` (60s) | Live (`ipf-sme.vercel.app`) | `vercel.json`, `api/` | `APP_ORIGIN`, system vars | `api/index.js` is generated and committed |
| Resend | All Business Support email | Code complete; domain/key state unverifiable | `server/email.ts` | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | No inbound webhook |
| Calendly | Discovery Call booking, and (new 14 Oct) the two Assessment Sessions | Embed + API read-back, no webhook | `shared/booking.ts`, `server/calendly.ts`, `server/engagements.ts` | `DISCOVERY_CALL_URL` (optional), `CALENDLY_API_TOKEN` (optional), `CALENDLY_SESSION_URL` (optional, new) | CSP allows `calendly.com` frames |
| Paystack | Online payment | Complete in code, Paystack-only | `server/paystack.ts`, `onlinePayment.ts` | `PAYSTACK_SECRET_KEY` (required), `PAYSTACK_PUBLIC_KEY` (unused) | Webhook `/api/paystack/webhook` |
| Google Calendar / Gmail / Workspace | JUMP sessions and mail | Legacy | `calendar.ts`, `gmail.ts`, `workspaceMailbox.ts` | `GOOGLE_*`, `JUMP_GMAIL_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` | Not used by Business Support |
| AI provider | Business Check summary wording | **Manus "Forge" LLM endpoint**, with rules fallback | `server/_core/llm.ts`, `businessCheck.ts` | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | The same Manus keys also serve legacy storage, maps, image/voice |
| Manus platform | Legacy admin OAuth, legacy file proxy | Legacy | `server/_core/oauth.ts`, `storage.ts`, `storageProxy.ts` | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID` | Hosting has moved off Manus; some code has not |
| Instagram embed | Home page reel | Present | `vercel.json` CSP | none | Legacy marketing |
| Analytics | Optional site analytics | Optional | `vite.config.ts`, CSP | `VITE_ANALYTICS_*` | |
| WhatsApp, ClickUp | Referenced in docs as the working channels | **No code integration** | | | Done by hand |
| AWS S3 SDK | In `package.json` | Dependency only; storage goes through Forge/Supabase | | | Possibly unused |

---

# 17. Recent changelog (since the earlier Business Support implementation)

**14 October 2026, 13 commits (`316422a..fd423a1`) (new):**
- **Forgot password and owner bootstrap by email:** `056d098` (self-service reset, owner's first password), `db89fd9` ("Send sign-in link" on the client's record).
- **Calendly Sessions:** `83d3bd2` (book the Current State Assessment Sessions from the room, recorded automatically).
- **Client room:** `ae2990f` (Founder · Business · Plan tabs), `e9e55b0` (desktop layout), `5bb57e1` (numbered questions as a list; technical requirements and plan brought current).
- **Full Report v4:** `5c73584` (strategic plan layout with the 12-month target).
- **Home and check:** `bb70116`, `7de153d`, `2f243e2` (track record, evidence, Enzo Krypton & Co., named clients, sectors), `85f60e8` (fluid answers, overlapping screens, back gesture), `13a251f` (reduced motion, transparency, contrast; tap prompts on touch).
- **Admin console:** `fd423a1` (theme colours instead of hard-coded ones, drawer motion, press feedback; a test now guards against hard-coded colours).
- **Docs and tests:** product documents 01–06, `authentication.md` and the env inventory updated; new tests for forgot-password, session booking, insight, engagement helpers, reduced motion, admin craft. No new migration and no schema change.
- `api/index.js` was regenerated (large diff, generated file).

**9–12 October 2026, 46 commits since `b570110`. Themes:**

- **Payments (largest change):** bank transfer + proof of payment + manual confirmation (`912e056`) → replaced by Paystack hosted checkout, signed webhook, return page and one confirmation path (`1246105`, `f145324`, `b5091dd`, `41fa25e`). Payments hold for 48 hours (`78466e1`). Confirm once, with its report link in the same transaction.
- **Full Report:** intake, deterministic rules, branded PDF, instant delivery, admin status/download (`cfd88a9`, `f1f9e4d`); consulting layout with executive summary and charts (`316422a`); a per-product charging question so commission/margin businesses get a true report (`7f8ec1d`).
- **Scheduling (Calendly):** default event (`d86565a`), new-tab fallback (`54ca837`), "Call booked" with time in admin (`faaf05f`), fill-in by email (`98482bf`), pick up bookings made from the email link (`f40e7ab`).
- **Email:** IP Factory sender and branding, "The Shift" layout, logo, office copy to `info@ipfactory.co` (`e2aad00`, `98ae169`, `8f212b9`, `40eafd7`, `c9935d4`); bound provider calls and Resend retry/keys (`527bfac`).
- **Engagement room / Current State / Fix:** v1 team desk + client room (`7f17e2b`), assessment template (`22758df`), file uploads on a private Supabase bucket (`952d2d8`), "the fix in the room" (`bce7957`), Discovery Call record and Work Plan (`1061c47`), rebuilt client room (`2ff25e4`).
- **Accounts and onboarding:** staff and seat invitations (`405b5cd`), client sign in at `/login` (`194a08e`), invitation requires a recorded reason before payment (`c3da1a4`), "Won" only by confirming payment, sign-out prompt for already-signed-in people (`ef88124`).
- **Security and platform hardening:** shared rate limits (migration 0010), password-reset links and suspension (`35f2c8f`), JUMP public forms closed (`3ef9d48`), DB pool/timeouts/identity from environment (`216abc2`), HSTS, claim-before-email (`41fa25e`), no Vercel `engines` field (`24b07c7`), `db:verify` improvements (`f3320cc`).
- **Business Check content/UX:** original 12 sectors restored, sector-fitted examples, required name/description, area omissions shown, Back/Next reach every answer.
- **Vocabulary and docs:** one named method (Business Check, Discovery Call, Full Report, Current State Assessment, Work Plan…) enforced by tests; six product documents plus the engagement-room brief, checked against the code by `test/docs/productDocs.test.ts`; cleanup of root clutter (`todo.md`, temp scripts removed).

---

# 18. Genuinely production-functional (in code and tested)

| Feature | Notes |
|---|---|
| Free Business Check, result and rules summary | Golden-snapshot tested |
| Lead capture and server-side progress saving | |
| Admin funnel console (stages, search, detail drawers) | |
| Discovery Call record and Fit/Refer/Decline outcome | Manual |
| Paystack payment, webhook, verification, idempotent confirmation | Pending live-key set-up |
| Full Report intake → PDF → email | No human review |
| Won → engagement → client invitation chain | Automatic |
| Account creation, login, lockout, change password, workspace switch | |
| Staff roles, permission resolution, engagement assignment scoping | |
| Engagement room (team and client sides), file uploads when storage is on | |
| The Fix measure and weekly check-ins | |
| Audit trail writing | |
| Rate limits, security headers, CSRF origin guard | |

---

# 19. Partially implemented

| Feature | What is missing |
|---|---|
| Calendly | No webhook; cancellations, reschedules and no-shows are not tracked (Discovery Calls or Sessions); times depend on an optional API token; Session booking also needs `CALENDLY_SESSION_URL` |
| Resend | No delivery/bounce webhook; no general email log; domain verification unverifiable |
| Payments | No ledger/list, refunds or receipts; no reconciliation sweep; 48-hour expiry is only a display rule and does not automatically move a prospect to Lost |
| Current State Assessment | Service workflow only; no automated reminders, no client questionnaire or generated assessment report |
| The Fix | No close-out, final value, day-30, sign-off or outcomes report |
| Finance role | Permission exists but there is no console section for it |
| Admin Team | Only the Super Admin can manage people |
| Audit | Written but not browsable |
| Client dashboard | No payment history, check result, report library or notifications |
| AI | Summary wording depends on Manus Forge |

---

# 20. Not yet implemented

- Automated reminders (calls, payment links, data requests, check-ins).
- Calendly webhooks and cancellation/no-show handling.
- Email delivery/bounce tracking and an email log for The Shift.
- Refunds, receipts and a payments ledger/finance dashboard.
- Close-out, day-30 review and sign-off (migration 0011).
- Payment for The Fix, the plan or ongoing support; referral discount mechanics (the 10%-off rule is copy only).
- In-app notifications and messaging.
- Programme/outcome analytics across clients.
- De-duplication of repeat Business Checks from the same email.
- Retiring the Manus dependencies and the JUMP tables.

---

# 21. Legacy functionality

- **Reachable:** `/portal`, `/portal/password`, `/schedule`, `/admin/login/legacy`, `/admin/reset`, `/admin/invite`, and the **JUMP Programme (Legacy)** admin tab (for people with `view_participants`). The home page still contains a participant sign-in dialog.
- **Closed unless `LEGACY_JUMP_ENABLED`:** JUMP registration, portal sign-in links, pricing requests, JUMP Paystack callbacks, emailing a diagnostic to any address.
- **Dormant:** the 24-hour reminder cron (hard-disabled), Google Calendar/Gmail routes, JUMP payment-receipt upload, consulting chat and reports tables, `mysql-archive/`.
- **Confusing for developers:** `package.json` name is still `jump-2026-registration`; `shared/brand.ts` still holds JUMP programme names and facilitator details beside the new brand; `email.ts` has JUMP and Business Support senders side by side; `participant.ts` (≈1,100 lines) and `registration.ts` (≈900 lines) are the biggest routers and are legacy; `docs/` and the repo root contain many JUMP-era notes (`platform_audit.md`, `participant_*`, `todo-qacvxixo.md`, etc.); AGENTS.md says email is "temporarily deferred" while the code now sends it; `old-origin` remote still exists.

---

# 22. Production configuration (names only)

| Group | Variable | Status |
|---|---|---|
| Database | `DATABASE_URL` | **Required** (health fails without it) |
| | `MIGRATION_DATABASE_URL` | Required to migrate (tooling only) |
| | `DATABASE_POOL_MAX`, `DATABASE_SSL_CA` | Optional |
| Authentication | `JWT_SECRET` | **Required** |
| | `OWNER_ADMIN_EMAIL` | **Required** |
| | `OWNER_OPEN_ID`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | Legacy (Manus OAuth) |
| App URL | `APP_ORIGIN` | **Required** |
| | `APP_ALTERNATE_ORIGINS` | Optional |
| | `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA` | Automatic |
| Email | `RESEND_API_KEY` | **Required** |
| | `EMAIL_FROM`, `EMAIL_REPLY_TO` | Optional (default `info@ipfactory.co`) |
| Calendly | `DISCOVERY_CALL_URL` | Optional (has a default) |
| | `CALENDLY_API_TOKEN` | Optional but needed for booking times |
| | `CALENDLY_SESSION_URL` | Optional (new 14 Oct); booking page for the two Assessment Sessions. Needs the token too |
| Paystack | `PAYSTACK_SECRET_KEY` | **Required** (also verifies the webhook) |
| | `PAYSTACK_PUBLIC_KEY` | Optional/unused |
| Files | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Required for uploads (optional otherwise) |
| Google | `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `JUMP_GMAIL_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` | Legacy |
| Cron | `CRON_SECRET` | Legacy (only the disabled JUMP reminder uses it) |
| AI | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Optional for The Shift (rules fallback); legacy for storage/maps |
| Other | `LEGACY_JUMP_ENABLED` | Optional (legacy switch, leave off) |
| | `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID`, `VITE_FRONTEND_FORGE_API_*` | Optional |
| Tests only | `TEST_DATABASE_URL`, `VALIDATE_*` | Never in production |

`/api/health` returns 503 and lists any of the six required names (`DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN`, `OWNER_ADMIN_EMAIL`, `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`) that are missing in production.

---

# 23. Test and build status

**These results are from `316422a` (13 October) and were not re-run for `fd423a1`.** Run `pnpm verify` to refresh them. The repo's own docs say the 14 October commits added tests for every change above. Node `v22.23.3`, pnpm `10.4.1`; nothing was fixed.

| Gate | Result |
|---|---|
| `node -v` | v22.23.3 ✅ |
| `pnpm check` | **Pass** (exit 0) |
| `pnpm check:tests` | **Pass** (exit 0) |
| `pnpm test` | **1 failure on the first full run** (exit 1): 123 of 124 active files pass; 1,178 tests passed, 1 failed, 370 skipped (1,549 total, 5 files skipped: the opt-in DB/live tests). Failed test: `test/server/businessCheck.ui.test.tsx › saves progress to the server shortly after each answer` (expected `answers: {p_stage: "operating"}`, got `{}`). **I re-ran that file three times on its own: 24/24 passed each time.** It was the only suite running at that moment, whereas the first run shared the machine with a typecheck/build, so this looks like a timing-sensitive test (a debounced save) rather than a code defect. It is flaky on a loaded machine; I cannot rule out that it also flakes in CI |
| `pnpm build` | **Pass** (exit 0); `api/index.js` regenerated with no diff against the committed file |
| `pnpm db:verify` | **Pass**, 27/27 checks (28 indexes, 55 foreign keys, 44 critical columns, 11 applied migrations match the journal). It ran read-only against whichever database the local `.env` points to |
| `pnpm dlx vercel build` | **Pass** (exit 0), with a warning: `PATH TO REGEXP ERROR: Can not repeat "path" without a prefix and suffix` for a `:path*` rewrite pattern. It did not fail the build but is worth a look |

`git status` after all gates: clean (the new report file is the only untracked file).

---

# 24. Capability scorecard

| Capability | Status | Confidence | Notes |
|---|---|---|---|
| Free Business Check | Fully implemented | High | Tested, golden snapshots |
| Business Check results | Fully implemented | High | Rules summary always; AI optional |
| Resend/email | Partially implemented | Medium | Code complete; no log/bounce handling; domain/key state unverifiable |
| Calendly booking | Partially implemented | Medium | Embed + API read-back; no webhook/cancel/reschedule |
| Discovery Calls | Partially implemented | High | Admin record, outcome and write-up work; no reminders or owner email |
| Fit/Refer/Decline | Fully implemented | High | Manual; no owner notification |
| Paystack/payment | Fully implemented (code) | Medium | Live key/webhook set-up unverifiable; no refunds/ledger |
| Client onboarding | Fully implemented | High | |
| Account activation | Fully implemented | High | |
| Authentication | Fully implemented | High | Self-service "Forgot your password?" added 14 Oct; owner's first password by email |
| Admin roles | Fully implemented | Medium | Finance has no console section |
| Business memberships | Fully implemented | High | |
| Client dashboard | Partially implemented | High | Room only; no payments/reports/messages |
| Current State | Partially implemented | Medium | Service workspace; Sessions now bookable in the room (config needed); no reminders or generated assessment |
| Client room insight (Founder/Business/Plan) | Fully implemented (new 14 Oct) | Medium | Derived from the Full Report or Check; tested; not yet a dashboard |
| Full Report | Fully implemented | Medium | v4 strategic plan layout, 14 Oct; still no human review |
| Fix/intervention | Partially implemented | High | Measure and check-ins yes; close/day-30 no |
| Notifications/reminders | Partially implemented | High | Transactional email only |
| Audit logging | Partially implemented | High | Written, not browsable |
| File handling | Partially implemented | Medium | Works when Supabase storage vars are set |
| Legacy JUMP | Legacy | High | Gated or dormant, still in code |

---

# What I Need to Know Right Now

**0. What changed since the last version of this report (14 October)?** Thirteen commits, no schema change. The biggest items: self-service "Forgot your password?" (and the owner can set a first password from their inbox); the owner books the two Assessment Sessions from the room on Calendly and the times are recorded automatically; the room gains Founder · Business · Plan tabs and a desktop layout built from the owner's own Full Report; the Full Report is now the partner-style strategic plan with a 12-month target; the home page now names Enzo Krypton & Co., its track record and three clients; the admin console was restyled to theme tokens. Two new optional settings matter: `CALENDLY_SESSION_URL` and, to make bookings appear, `CALENDLY_API_TOKEN`. The repo proposes next "the room as a dashboard" (prototype for review).

**1. What changed most recently?** In four days (9–12 October) the platform went from "Business Check plus a manual funnel" to a nearly complete service: Paystack payments, a paid Full Report, Calendly booking, Resend email under the IP Factory brand, and a full client "engagement room" with the Fix tracking. The last commit adds a consulting-style layout to the Full Report PDF.

**2. What can an SME do today?** Take the free check, see their result, book a free call, buy the ₦100,000 Full Report and get the PDF instantly, pay the ₦500,000 Assessment by Paystack, create an account, and work in their room: see requests, upload files, view sessions, findings and the Fix number, comment on deliverables, and add one team member.

**3. What can an admin do today?** Watch every lead through the funnel, see Calendly bookings, write up the call, mark Fit/Refer/Decline, send payment links, confirm payments by hand if needed, invite clients and staff, run engagements (team, Work Plan, sessions, deliverables with approval, files, measure and check-ins), and manage roles (Super Admin).

**4. What is automated now?** Lead capture; result and summary email; Full Report payment email, intake link, PDF build and delivery; payment confirmation; Won status; engagement creation; the client invitation after Assessment payment; office alerts.

**5. What still requires manual intervention?** Recording the call outcome; sending the Assessment payment link; scheduling the two Sessions and entering them; stage changes through Fix, Plan and Close; sharing notes and deliverables; any refund or reconciliation; all reminders and chasing (WhatsApp/email by hand); password resets (a person must issue the link).

**6. Is Resend actually live?** The code is complete and used for every Business Support email, and production will report unhealthy if the key is missing. Whether `ipfactory.co` is verified in Resend and sending to real recipients is **not something the code can tell me**. Check `/api/health` and send a test check. The earlier docs said it was running on Resend's test address pending verification.

**7. Is Calendly actually live?** Partly. The embed uses IP Factory's real event link and works without any setup. Showing booking *times* in admin needs `CALENDLY_API_TOKEN`; I cannot see whether it is set. There are no webhooks, so cancellations and reschedules are invisible to us.

**8. Is Paystack actually live?** The integration is complete and safely built (signature check, server-side verification, exact-amount match, one-time confirmation). Whether production uses a **test or live** key, and whether the webhook URL is registered in Paystack, is unverifiable from code. The README still describes going live as a pending step. Do not assume real money is flowing until a ₦ test payment is seen end to end.

**9. Can a real client complete the full journey without developer help?** Up to the Discovery Call and Full Report: yes, if Resend, Paystack and Calendly are configured. Through to onboarding and the room: yes, once the Assessment is paid, with the team doing the manual steps listed above. The journey cannot be completed *to a closed engagement* because close-out and day-30 are not built, and (as of 14 Oct) a client who loses their password can reset it themselves.

**10. Top five unfinished areas:**
1. Reminders and automation for Business Support (calls, payment, data requests, check-ins).
2. Close-out and day-30 review (migration 0011).
3. Calendly webhooks (cancel/reschedule/no-show); Session times now sync in but cancellations do not.
4. Finance: payments ledger, refunds, receipts, and a usable Finance role view; plus an audit/email log viewer.
5. Retiring the Manus dependencies (AI summary, legacy storage and OAuth) and the JUMP legacy code.

**11. What should we work on next?** My recommendation, in order: (a) do one real end-to-end run on production with a test Paystack key and a real inbox to confirm Resend, Paystack, webhook and Calendly token, since that is the main uncertainty; (b) decide the reminder policy and build the minimum (call reminder, payment-link expiry, data-request chaser) with a real cron; (c) fix the Finance role/console gap and add a simple payments list; (d) build 0011 close-out and day-30 before the first fixes reach week 6 in December; (e) replace the Manus AI endpoint so the check summary does not rely on a service you no longer host on.

**12. Changes that materially affect the previously agreed Business Support flow:**
- **Bank transfer with proof of payment was removed; Paystack is now the only way to pay.**
- **A new paid product, the Full Report (₦100,000), runs independently of the Discovery Call**, and the owner can start paying for it themselves from the summary email.
- **"Won" now comes only from a confirmed payment**, and that payment automatically triggers the engagement and the client invitation. Inviting before payment needs a recorded reason.
- Payment links hold for 48 hours (display only; nothing moves the lead to Lost automatically).
- The free call is now called the **Discovery Call** (not the Debrief) and the paid assessment the **Current State Assessment**; the owner receives **no email** on Fit/Refer/Decline.
- Calendly bookings are read by an API token only; there is no webhook, so the app does not know about cancellations.
- Full Reports are emailed **with no human review**, by design.
- ~~Clients have no self-service password reset~~ **Changed 14 Oct:** anyone can request a reset link from the sign-in pages; the team can still issue one.
- **New 14 Oct:** the two Assessment Sessions are booked by the owner on Calendly from the room (separate booking page), not entered by staff, when configured.
- The AGENTS.md text that email is "deferred" is out of date: email is live in code.
