# 6. Implementation plan

**What gets built, and in what order.** Last reviewed 9 October 2026. This replaces the "Phase 2 plan" in
`docs/ipf-factory/MIGRATION_CHECKLIST.md` §9, which was written for Manus and v0.6.

**The sequencing rule:** build each part just ahead of the first paying client who needs it. The pilot calendar
(concept note §9) sets the pace: the first clients pay in week 2 (from 16 October), the Current State Assessment starts in week 3
(from 23 October) and the first fixes start in week 5 (from 6 November).

---

## 1. Where we are

| Done (live on `main`) | Tests |
|---|---|
| Public site in the owner's words, journey and prices | `test/shared/businessSupport.test.ts`, `test/shared/brand.test.ts` |
| Free business check: details first, decision tree, outline, four gaps, AI summary with rules fallback, saved progress | `test/shared/businessCheck/*`, golden snapshots |
| Discovery call booking (Calendly) and outcome (Fit, Refer, Decline, Nurture) | `test/server/businessCheck*`, `test/db/*` |
| Staff sign-in, roles and permissions, invitations, audit trail | `test/server/accountAuth.test.ts`, `test/shared/platformPermissions.test.ts`, `test/db/*` |
| Payments by bank transfer: details, proof, confirmation (full report, Current State Assessment) | `test/server/payments.test.ts`, `test/db/payments.db.test.ts` |
| Full report: 17-question form, deterministic PDF emailed at once, admin status and download | `test/shared/fullReport/*`, `test/server/fullReport/*` |
| Client account by invitation after Current State Assessment is paid; Won stage | `test/server/clientOnboarding.test.ts`, `test/db/payments.db.test.ts` (whole journey) |

**The engagement room v1 (9 October, live once migration 0008 is applied):** the engagement starts with the template
when the Current State Assessment is paid; the team's Engagements section (team, stage, the one problem, calls and notes,
requests and actions, deliverables with approval); the client's room on `/dashboard` (where we are, what we need from
you, what we have found). Tests: `test/db/engagements.db.test.ts`, `test/server/engagements.test.ts`,
`test/client/components/engagement*.ui.test.tsx`.

Also on `main` since 9 October: the original twelve sectors; "Not assessed" areas on the result; the report form asking
how each product is charged; the invitation page asking someone else signed in to sign out first; the 48-hour payment
window; the problem questions at the end of the check.

## 2. Phase 0: operational, no code (this week)

| # | Task | Owner | Blocks |
|---|---|---|---|
| 0.1 | Add the Resend DNS records for `ipfactory.co`; then set `EMAIL_FROM` to `IP Factory <info@ipfactory.co>` in Vercel | DG, then Lewis | Every email to an owner |
| 0.2 | Set `PAYMENT_BANK_NAME`, `PAYMENT_ACCOUNT_NAME`, `PAYMENT_ACCOUNT_NUMBER` in Vercel (until then emails say "TEST DETAILS - DO NOT PAY") | ET, Lewis | Real payments |
| 0.3 | Push the branch to `main` | ET ("push to main") | The four branch changes |
| 0.4 | Name the finance person and grant roles to the analysts on the platform | Lewis | Phase 1 assignments |
| 0.5 | Open IP Factory's Paystack business account; put the test keys, then the live keys, in Vercel (`PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`) | ET, Lewis | Online payment (section 4) |
| 0.6 | ✅ **Done 10 October.** **Apply migration 0008** (`drizzle/supabase/apply-0008-engagement-room.sql` in the Supabase SQL Editor, or `pnpm db:migrate`) before the first Current State Assessment payment is confirmed | Lewis | The engagement room |
| 0.7 | Create the private storage bucket `engagement-files` in Supabase → Storage; set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel, then redeploy; the Engagements tab then says "File uploads: on" or names what is still missing; upload one test file from a client account | Lewis | File uploads in the room |

## 3. Quick fixes found while writing these documents (this week, small)

Each is one focused change with a test. None needs a migration except Q6.

| # | Fix | Why | Source |
|---|---|---|---|
| Q1 | Map `--font-sans` and `--font-serif` to Plus Jakarta Sans and Playfair Display; check with screenshots | The site shows the system font and Georgia, not the brand fonts | Design brief §3 |
| Q2 | ~~Point Home's "Client sign in" at `/login`~~ **Done 9 October**; JUMP participants still reach their sign-in from `/portal` and from a link on `/login` | A returning client landed in the JUMP participant sign-in | App flow §10 |
| Q3 | **Replaced by 1.0 below.** The JUMP and Gmail wording sits in the legacy Google staff flow, which cannot create a new staff account on Vercel; staff invitations on the email-and-password sign-in replace it | Rewording a flow that is being replaced adds nothing | App flow §10 |
| Q4 | ~~Ask to confirm "Invite to onboard" before the assessment is paid~~ **Done 9 October**: Won invites at once; any earlier stage asks first | A lead could be invited before paying | App flow §10 |
| Q5 | Expire full report links after delivery (or cap downloads) and rate-limit the report procedures | A forwarded link works forever | Backend schema §6 |
| Q6 | Store the business check token as a hash | Every other token is hashed | Backend schema §6 (**migration**) |
| Q7 | Map the shadcn colour roles to the theme, or remove their use | Components that rely on them render without colour | Design brief §4 |
| Q8 | ~~Show staff who hold only platform roles on the Admin Team screen~~ (done 9 October); decide one permission for the report | Admin Team undercounts; finance can resend but not download | Backend schema §6 |

## 4. Paystack (starts the day the test keys are in Vercel)

Manual confirmation is the interim method only because Paystack is not set up. The confirmation logic already exists
(`confirmPayment` in `server/payments.ts`), so Paystack plugs into it rather than replacing it.

| # | Build | Acceptance |
|---|---|---|
| P1 | **Checkout:** a "Pay now" link in the payment email (and on the result page for the full report) that opens Paystack for the exact amount and reference | The owner can pay the full report or Current State Assessment by card or bank on Paystack |
| P2 | **Webhook:** Paystack's signed notification confirms the payment request automatically, after checking the signature, the amount, the currency and the reference | The same emails and effects as "Confirm payment": the report link, or Won plus the client invitation. A forged or mismatched notification changes nothing |
| P3 | **Admin:** payments show "Paid by Paystack" with Paystack's reference; manual "Proof received" and "Confirm payment" stay for direct transfers | The team can tell at a glance how each payment arrived |
| P4 | **Copy:** payment emails lead with "Pay now"; bank details stay as the alternative | No email asks for proof when the owner paid on Paystack |

Tests mock Paystack: no real keys in tests. Webhook signatures are checked with `PAYSTACK_SECRET_KEY`.

## 5. Phase 1: foundation for the engagement room (needed by 23 October)

Goal: when a client pays for the Current State Assessment, an engagement exists, a team is assigned, and both the client and the team can
see where it stands.

| # | Build | Acceptance | Notes |
|---|---|---|---|
| 1.0 | ✅ **Built 9 October.** **Staff invitations** on the email-and-password sign-in: the Super Admin invites by email with a platform role; the person sets a password from a single-use link | A new analyst can be added and assigned without Google sign-in | Found 9 October: roles can only be granted to existing accounts |
| 1.1 | ✅ **Built 10 October**, live once `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the private bucket exist (`docs/vercel-env-inventory.md`). **File storage** on a private Supabase Storage bucket, with short-lived signed links issued by the server after an access check | A file uploaded for client A cannot be read by client B or an unassigned analyst; links expire | Replaces the Manus storage proxy (old R3). New env names only in `.env.example` |
| 1.2 | ✅ **Built 9 October.** **Engagement table**: created when the Current State Assessment payment is confirmed; linked to the business when the client creates their account | Confirming payment creates exactly one engagement; accepting the invitation links it | **Migration**: dedicated branch per `AGENTS.md` |
| 1.3 | ✅ **Built 9 October.** **Engagement assignments** (engagement × person × role: lead, analyst, partner, expert) and the scope check | Analysts see only assigned engagements; `view_all_businesses` sees all | Permissions `manage_engagements`, `assign_engagements`, `review_engagements` already exist in `shared/platformPermissions.ts` |
| 1.4 | ✅ **Built 9 October** (the Engagements section). **Internal engagement page**: stage, team, and the getting-set-up checklist (welcome note sent, data request sent, WhatsApp group created, analyst assigned, both Current State Assessment calls booked) | The desk lead can run onboarding from one screen in three working days | Concept note §7 onboarding |
| 1.5 | ✅ **Built 9 October.** **Client room v1: "Where are we?"** on `/dashboard`: the journey with the current step, the next session date, the named team | A client sees only their own engagement | Replaces the profile-only dashboard |

## 6. Phase 2: sessions, notes and deliverables (needed by 23 October, the first Current State Assessment call)

| # | Build | Acceptance |
|---|---|---|
| 2.1 | ✅ **Built 9 October** (booked on Calendly, recorded in the room). **Sessions**: date, type (Current State Assessment call 1 and 2, check-in, review), attendees, link | Both Current State Assessment calls can be booked from the engagement page |
| 2.2 | ✅ **Built 9 October.** **Notes and actions** per session: client version and internal version; actions with owner and due date | Notes are shared with the client the same day; internal notes are never visible to the client |
| 2.3 | ✅ **Built 9 October** (text; files wait for 1.1). **Deliverables**: upload, version, share; prescriptions and plans need desk lead approval before sharing | An unapproved prescription cannot be shared; every share is audited |
| 2.4 | ✅ **Built 9 October.** **Email notices** to the client when something is shared with them | Branded email, link to the room, no content in the email body beyond the title |

Built with O1, O2 and O3 as recommended (PRD §10), and the owner's seat invitation (one included seat, Full or Contributor). 2.4 email notices are built too.

## 7. Phase 3: data requests (needed by 23 October, getting set up)

| # | Build | Acceptance |
|---|---|---|
| 3.1 | ✅ **Built 9 October**; list, agendas and findings outline drawn from IP Factory's assessment proposals on 10 October. **Data request list** from a template (the concept note's onboarding list), per engagement, with due dates | The desk lead sends a list in one step |
| 3.2 | ✅ **Built 10 October.** The client uploads against a request (or says they sent it another way); the team accepts or asks for more. **Client upload** against each request; status requested → received → accepted (or "needs more") | The analyst sees what is missing at a glance; the client sees what is still owed |

## 8. Phase 4: the fix, check-ins and the record (needed by 6 November)

| # | Build | Acceptance |
|---|---|---|
| 4.1 | **Problem statement** from Current State Assessment: chosen problem area, sub-problem, the owner's words | Exactly one problem per fix (D3) |
| 4.2 | ✅ **Built 10 October.** **Measure**: name, definition, baseline, target, recorded in fix week 1 | The client can see the measure and where it stands |
| 4.3 | ✅ **Built 10 October** (week N needs week N-1 first). **Weekly check-in**: the five-question template, measure reading, questions asked, hours by role, AI used | A check-in cannot be closed without last week's actions reviewed |
| 4.4 | Needs `engagement_closes` (**migration 0009**, on its own branch when the first fixes approach week 6, December). **Close and day 30**: final value, moved, extension weeks, plan delivered, next problem area, ongoing support defined, day-30 check | The PRD §7 pass marks are countable from the record |
| 4.5 | **Monday scorecard** for the desk: funnel, active fixes, measures, record completeness, hours | Replaces the spreadsheet export |

## 9. Phase 5: later (v0.2)

- Referral codes on the new flow: 10% off the next invoice per paying referral, up to 30%, never on a first payment.
- Transcript import and AI-drafted session notes for review (system actor, audited).
- A message thread in the room, only if O2 says so.
- A settings screen for prices and key copy, so Lovelyn can change them without a developer (concept note §14).
- Two colours on the outline for problems that cross areas (concept note §15).
- Retire the JUMP-era screens and tables once nothing reads them (see [5. Backend schema](05-backend-schema.md) §4).
- The January portal: the record with the methods attached (concept note D4).

## 10. How each phase is delivered

1. A short design note in the PR description that names the tables, procedures and permissions it adds.
2. Tests first for the access rules: a client cannot reach another client; an analyst cannot reach an unassigned
   engagement.
3. Migrations on a dedicated branch, applied to Supabase by the guarded script method used for 0006 and 0007
   (`docs/database-migrations.md`).
4. `pnpm verify` passes; a preview link or screenshots for review; "push to main" only on the owner's word.
5. These documents are updated in the same PR when the product changes.
