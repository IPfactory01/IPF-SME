# IP Factory (IPF) — Migration Checklist & Baseline Audit

> **History.** This note describes the move from JUMP and the Manus launch (October 2026). The current product, its
> plan and its open decisions are in [`docs/product/`](../product/README.md).

**Prepared:** 6 October 2026 · **Updated:** 6 October 2026 (decisions revised for concept note v0.8.1: v0.1 on Manus on 9 Oct, ipf-gradient brand; see §0 and `LAUNCH_ON_MANUS.md`)
**Scope:** Take-over audit of the migrated JUMP 2026 platform and the plan to turn it into the IP Factory Business Support client area.
**Companion to:** `IPF_FACTORY_HANDOVER_PLAN.md` (the seven-step route). This document is the engineering view of Steps 2, 4 and 5.

## 0. Status at a glance

**Decided (6 October 2026)**

| # | Decision |
|---|---|
| D1 | The organisation is **IP Factory (IPF), Intellectual Property Factory**. "IPF Factory" in the original handover documents is a misnomer. The product name ("Operating Partner", "Growth Desk" or "Next Monday") is set separately per the concept note, by 7 October. **Decided 7 October: "The Shift", written in full as "The Shift, by IP Factory".** |
| D3 | Brand variant **ipf-gradient** (Option 1 stacked logo), per concept note v0.8.1. *Changed from ipf-teal-navy on 6 Oct.* |
| D7 | **Start clean.** No JUMP participant data is migrated. JUMP contacts are reached through the warm list instead. |
| D9 | **One code base: v0.1 launches on Manus on Friday 9 Oct, then hosting moves off Manus.** Code stays Manus-compatible until then. See `LAUNCH_ON_MANUS.md`. *Revised on 6 Oct, from "leave Manus completely".* |
| — | **Platform role (v0.8.1):** this code base is IPF's copy of Jump, launching as v0.1 on **Friday 9 October**, with the January portal built on it. |
| D5 | **Lewis Osako is Super Admin, Richard Kehinde admin** (v0.8.1, D5). |

**Done**

| Step | Commit | Result |
|---|---|---|
| 0 Hygiene | `918638e` | Tests green without secrets; real participant data removed from fixtures; README, `.env.example` and CI added |
| 1A Brand settings | `432a8af` | All programme and facilitator identity read from `shared/brand.ts`; 37 files verified value-identical |
| 1B Deployment identity | `dfb55ba` | `APP_ORIGIN`, `APP_ALTERNATE_ORIGINS` and `OWNER_ADMIN_EMAIL` drive links, origin checks and Super Admin; the Paystack callback no longer points at a Manus preview host |
| 1C Colour tokens | `712fc9c` | 1,002 hard-coded colours become 41 role-named tokens; 0 pixels changed on 18 screenshots |
| Security | `229bab1` | The public admin sign-in page no longer discloses the Super Admin email |
| B1–B2 Brand | `926ee23` | ipf-teal-navy palette, IP Factory logo in the headers, favicon |
| R1 Manus removal | `ccf6cbe` | Unused Manus code and plugins removed; `*.manus.*` no longer trusted; production `index.html` 368 kB → 1 kB |
| R4–R5 | `9570ed3` | Desk notifications by email; scheduled reminders authenticated by `CRON_SECRET` |

---

> This file deliberately does **not** reproduce secrets, bank account numbers, or participant personal data. It points to where they live (`file:line`) so they can be dealt with.

---

## 1. Baseline health (as received)

| Gate | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | ✅ Clean (pnpm 10.4.1, Node 22). Build scripts for `esbuild` / `@tailwindcss/oxide` are not approved, but the build still succeeds. |
| Typecheck | `pnpm check` | ✅ 0 errors |
| Build | `pnpm build` | ✅ Passes. Client bundle is 898 kB (233 kB gzip), over Vite's 500 kB warning. Server bundle is 278 kB. |
| Tests | `pnpm test` | ⚠️ **145 pass / 6 fail / 4 skipped** (54 files) |

### The 6 failing tests

| Test | Cause | Classification |
|---|---|---|
| `server/resend.secret.test.ts` (1) | Calls the live Resend API and needs `RESEND_API_KEY` | Live-credential integration test that is not gated by an env flag. Expected to fail without secrets. |
| `server/calendar.credentials.integration.test.ts` (1) | Calls the live Google Calendar API and needs the Google OAuth env vars | Same as above |
| `server/participantPasswordFlow.test.ts` (4) | `TypeError: records.find is not a function` | **Real test drift.** `findEligibleParticipantByEmail` (`server/participantAuth.ts:128`) now runs `db.select().from(registrations)` with no `.where()`. The test's fake DB only supports `from().where()`. The code changed and the mock did not. |

Note on `server/participantAuth.ts:128`: the eligibility lookup loads **every registration row** to match one email. That is fine at cohort scale. Revisit it before IPF scales the programme, for performance and to keep data exposure low.

---

## 2. Platform dependency map

The app is a **Manus WebDev template**: React 19 + Vite + tRPC + Express + Drizzle/PostgreSQL (migrated from MySQL). Several core capabilities are provided by the Manus platform rather than by the code:

| Capability | Provider today | Where | Portable? |
|---|---|---|---|
| Admin identity (OAuth) | Manus OAuth portal (`OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID`, `OWNER_OPEN_ID`) | `server/_core/sdk.ts`, `server/_core/oauth.ts`, `client/src/const.ts` | Only inside a Manus workspace. Leaving Manus means replacing admin login. |
| File storage (receipts, briefs, assignments, portrait) | Manus Forge → S3 presign (`BUILT_IN_FORGE_API_URL/KEY`), served at `/manus-storage/*` | `server/storage.ts`, `server/_core/storageProxy.ts`, `server/routers/participant.ts:439,500` | Only inside Manus. The stored file keys must be migrated with the DB. |
| LLM (AI consulting chat, diagnostic) | Manus Forge (`forge.manus.im`) | `server/_core/llm.ts:218,440` | Only inside Manus |
| Owner notifications, maps, image gen, voice | Manus Forge | `server/_core/notification.ts`, `map.ts`, `imageGeneration.ts`, `voiceTranscription.ts`, `client/src/components/Map.tsx:92` | Only inside Manus |
| Scheduled jobs (24h reminders) | Manus heartbeat → `POST /api/scheduled/*` | `server/_core/heartbeat.ts`, `server/_core/index.ts:101` | Only inside Manus |
| Dev tooling | `vite-plugin-manus-runtime`, debug collector, `*.manus.computer` allowed hosts | `vite.config.ts`, `client/public/__manus__/` | Harmless outside Manus |
| Analytics | Umami (`VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID`) | `client/index.html` | Portable |
| Database | PostgreSQL / Supabase (`DATABASE_URL` runtime, `MIGRATION_DATABASE_URL` migrations); one baseline migration, inherited MySQL history archived in `drizzle/mysql-archive/` | `drizzle/` | Portable |

**Implication:** the handover plan assumes a **new IPF-owned Manus workspace**. On that path, the items above are re-provisioned, not rewritten. Moving IPF off Manus would mean replatforming auth, storage, LLM and scheduling. That is a separate decision with a separate budget (see §6, D9).

---

## 3. Environment variables (names only — recreate under IPF ownership)

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection (Supabase Transaction Pooler) | New IPF database |
| `JWT_SECRET` | Session cookie signing | **Generate fresh.** Do not reuse JUMP's. All existing sessions will be invalidated, which is the intended effect. |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | Manus OAuth | Issued by the IPF Manus workspace |
| `OWNER_OPEN_ID` | Super Admin identity | Set to the IPF owner's Manus openId |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | Manus storage/LLM/notifications | Issued by the IPF Manus workspace |
| `RESEND_API_KEY` | Primary email delivery | IPF Resend account with the IPF sending domain verified |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | Sender identity | **Currently overridden in code.** See §4.3. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Google Calendar (+ Gmail fallback) | IPF Google Workspace OAuth client |
| `JUMP_GMAIL_REFRESH_TOKEN` | Programme mailbox reply sync | Rename for IPF. The name itself is JUMP-specific. |
| `GOOGLE_CALENDAR_ID` | Session calendar | Defaults to `primary` |
| `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` | Paystack verify flow | IPF Paystack merchant account |
| `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` | Umami | Optional |
| `VALIDATE_RESEND_SENDER`, `VALIDATE_RESEND_CREDENTIALS` | Opt-in live tests | Test-only flags |

There is no `.env.example` in the repo. Phase 0 should add one with names only.

---

## 4. Hard-coded configuration inventory

Volume (excluding lockfile): **JUMP** 616 matches in 100 files. **Emmanuel/Tarfa** 653 in 78. **emmanueltarfa** domain 128 in 42. **manus** 114 in 31. **gmail** 230 in 44. **paystack** 111 in 28. Of these, **24 test files** assert on JUMP/Emmanuel strings, so any rebrand has to update code and tests together.

### 4.1 Domain & origin (production-critical)
- [ ] `server/security.ts:3-4`: `PRIMARY_ORIGIN` / `WWW_ORIGIN` = emmanueltarfa.com. These drive CSRF origin checks and the trusted app origin used to build every emailed link.
- [ ] `server/security.ts:6`: `*.manus.space` trusted in production
- [ ] `server/routers/registration.ts:823`: Paystack `callback_url` hard-coded to `jumpreg26-…manus.space`
- [ ] `server/ics.ts:20`: calendar UID domain `jumpreg26.manus.space`
- [ ] `server/routers/referrals.ts:15`: referral link host falls back to emmanueltarfa.com
- [ ] `shared/paymentInstructionTemplates.ts:49`: portal URL in payment emails

### 4.2 Ownership & admin governance (handover success criterion)
- [ ] `server/adminSecurity.ts:12`: `OWNER_ADMIN_EMAIL` is a personal Gmail address
- [ ] `server/db.ts:58`: Super Admin auto-granted to `OWNER_OPEN_ID` **or** that personal Gmail address
- [ ] `server/_core/trpc.ts:79`, `shared/adminPermissions.ts:45`: permissions model and copy assume Emmanuel holds Super Admin
- [ ] Copy in the admin invitation and reset emails (`server/routers/adminAccess.ts:111,205`, `client/src/pages/AdminInvitationPage.tsx:26`)

### 4.3 Email identity
- [ ] `server/email.ts:4-8`: programme mailbox, sender display name, admin mailbox and monitoring BCC are **constants**. `getJumpProgrammeSender()` deliberately **ignores** `EMAIL_FROM` unless it matches the JUMP mailbox, and `getJumpProgrammeReplyTo()` ignores `EMAIL_REPLY_TO` entirely. Setting env vars alone will not rebrand outbound mail.
- [ ] `server/_core/env.ts:11,19`: JUMP/emmanueltarfa defaults
- [ ] `server/gmail.ts:179`, `server/ics.ts:41`: reply-to and ICS organiser
- [ ] `server/workspaceMailbox.ts`: JUMP mailbox sync (inbound replies)
- [ ] `server/emailTemplates.ts` (33 JUMP refs): all participant templates, written in Emmanuel's first-person voice
- [ ] `server/participantAuth.ts:81`, `server/scheduledReminder.ts:29,119`, `server/routers/participant.ts:680`, `shared/engagementBrief.ts:154,168`: transactional email bodies

### 4.4 Payments (highest-risk item — wrong beneficiary = lost money)
- [ ] `server/paymentGuidance.ts:20-25`: six live Paystack payment-page links tied to the current merchant account
- [ ] `server/paymentGuidance.ts:59-75` and `shared/paymentInstructionTemplates.ts:24-82`: **personal bank account details** (NGN and GBP/IBAN) shown in the portal and in emails
- [ ] `shared/engagementBrief.ts:18`, `server/paymentGuidance.ts:20+`: package fees (Foundation / Engine Room / Boardroom), the 40/30/30 instalment structure, and the 10% upfront discount
- [ ] `shared/referrals.ts:4`: referral credit policy copy
- [ ] Test fixtures mirror these values (`server/paymentGuidance.test.ts`, `shared/paymentInstructionTemplates.test.ts`)

### 4.5 Programme content & brand
- [ ] `client/index.html`: page title, fonts, analytics
- [ ] UI copy: `ParticipantDashboard.tsx` (12), `Admin.tsx` (10), `Home.tsx` (9), `AdminLoginPage.tsx` (9) and 7 more components
- [ ] Facilitator identity: portrait `/manus-storage/jump-emmanuel-tarfa-portrait_*.jpeg` (`Home.tsx:187,221`, `FacilitatorVideo.tsx:15`), Instagram reel (`FacilitatorVideo.tsx:13`)
- [ ] PDF footers (`server/routers/participant.ts:885,1123`), AI persona prompt (`participant.ts:907,1023`)
- [ ] Registration source option "Emmanuel directly" (`server/diagnostic.ts:14`, `DiagnosticRegistrationDialog.tsx:23`). This is a Zod enum persisted in data, so changing it is a data-compatibility change, not just copy.
- [ ] Dates and schedule copy (for example, "opens Friday, 4 September 2026", `shared/engagementBrief.ts:127`)
- [ ] **Colours are not tokenised:** `#1F4E79` appears 305×, `#6A6760` 143×, `#E6E2D8` 102×, and so on, as literal hex in TSX. A palette swap is currently a 1,000+ line find-and-replace.
- [ ] `package.json` name `jump-2026-registration`, User-Agent strings

### 4.6 Data-model naming (leave alone in Phase 1)
- `registrations.package` enum (`Foundation`, `Engine Room`, `Boardroom`), `businessModel` and `cohortGroup` enums, and the `paymentStructure` enum are stored values. Renaming them requires a DB migration plus a data backfill. Treat them as internal identifiers and change only their **display labels**.

---

## 5. Data protection findings (action before anyone else is given repo access)

The repository is **private**. No API keys, tokens or connection strings were found in the working tree or git history ✅. However:

| # | Finding | Location | Risk |
|---|---|---|---|
| P1 | **Personal bank account details** (account numbers, sort code, IBAN) in source and tests | `server/paymentGuidance.ts`, `shared/paymentInstructionTemplates.ts` (+ tests) | Every collaborator can see them, and they persist in git history. They also bind IPF's payment flow to an individual's account. |
| P2 | **Real participant names and personal email addresses** (~15 individuals) | `todo.md`, `participant_reply_review.md`, `project_brief_delivery_roster.md`, `docs/*-review.md` (4 files), `docs/information-session-invitation-review.md`, and 3 test files (`workspaceMailbox.test.ts`, `participantPasswordAuth.test.ts`, `pathwayReconciliation.test.ts`) | Participant PII is being processed in a code repo, with no stated lawful basis for transfer to IPF (handover plan, Step 3) |
| P3 | Participant-specific operational scripts | `scripts/sendMarcelleReconciliationClarification.ts`, `scripts/sendApproved*.ts` | One-off JUMP operations. They should not be run against an IPF database. |
| P4 | Root-level operational notes (14 `.md` files: audits, email drafts, OAuth status, DNS) | repo root | Clutter plus some PII. They belong in an archive, not the product repo. |

**Recommendation:** move P2–P4 material to an IPF-controlled secure archive. Replace real addresses in tests with `@example.com` fixtures. Treat P1 as part of the payments workstream. Deleting files does **not** remove them from history. Whether to rewrite history is a separate, explicit owner decision (it is disruptive and needs a force-push).

---

## 6. Decisions (owner: IP Factory leadership)

| # | Decision | Blocks |
|---|---|---|
| D1 | ✅ **Decided:** IP Factory (Intellectual Property Factory). Product name still to set (concept note, 7 Oct). | Phase 1D copy |
| D2 | Production domain and the programme mailbox (sender + reply-to) | Phase 1D, email cutover |
| D3 | ✅ **Decided:** ipf-gradient. Typography still open. | — |
| D4 | Facilitator model. The concept note implies **IPF-institutional**: roles, not names, unless agreed (§15). Confirm. This drives roughly 60% of the copy. | Phase 2 copy |
| D5 | ✅ **Decided:** Lewis is Super Admin, Richard admin. Set `OWNER_ADMIN_EMAIL` and `OWNER_OPEN_ID` accordingly. | Launch |
| D6 | IPF payment entity: Paystack merchant and bank-transfer fallback. The price ladder itself is decided in the concept note (§8). Who signs client terms is open (concept note, 8 Nov). | Payments workstream |
| D7 | ✅ **Decided:** start clean, so no participant data is transferred | — |
| D8 | PII clean-up approach, including whether to rewrite git history | Phase 0 |
| D9 | ✅ **Decided:** v0.1 on Manus from this code base; move off Manus afterwards (§9, workstream R) | — |

---

## 7. Migration checklist (consolidated)

**Phase 0: Hygiene** ✅
- [x] Fix the stale DB mock in `participantPasswordFlow.test.ts`
- [x] Gate the two live-credential tests behind opt-in env flags
- [x] Add `README.md` and `.env.example` (names only)
- [x] Replace real participant data in test fixtures
- [ ] Relocate the root-level JUMP operational notes, which contain PII, to an IPF-controlled archive (D8)
- [x] Add CI (GitHub Actions: check, test, build)

**Phase 1: Centralise, then rebrand**
- [x] 1A Brand settings module, behaviour-identical
- [x] 1B Domain, origin and owner identity read from environment
- [x] 1C Colour tokens, visually identical
- [ ] 1D Apply IPF identity: ipf-teal-navy palette and logo now; product name and copy once set (§9, workstream B)

The remaining phases are replaced by the Phase 2 plan in §9. Data migration (old Phase 5) is dropped by D7.

---

## 8. How the concept note maps onto the platform

> Written against v0.6. v0.8.1 replaces the paid diagnostic with a **free AI business check** plus a paid **Current State**, the sprint with a **six-week fix**, and removes the priced retainer (ongoing support is unpriced). The structural mapping below still holds.

Source: *IPF Business Support — Concept Note and Launch Blueprint v0.6 (final, 4 Oct 2026)*. The concept adds layers to the existing structure rather than replacing it.

| Concept note | Existing platform | Change needed |
|---|---|---|
| Ten-minute form: 12 questions, banded answers | Staged registration (`DiagnosticRegistrationDialog`), which already uses ranges | Re-word to the 12 questions; add sector, staff, revenue, decision-maker and hours bands |
| Price ladder: diagnostic ₦500k, sprint ₦1.2m, retainer ₦400k a month | Packages Foundation, Engine Room and Boardroom; payment guidance; Paystack links; receipt upload with owner review | New product values (DB enum migration); retainer is monthly; Paystack pages per product |
| Referral: 10% off the next invoice per paying referral, capped at 30%, never on the first payment | Referral module with owner-reviewed credit % and a credit cap | Configure the values; enforce "never on the first payment" |
| Diagnostic instrument across the ten doors | Structured diagnostic plus the working-diagnostic PDF | Rebase the questions on the ten doors and add scoring (instrument content from the IPF team) |
| **Engagement record** (identity, funnel, diagnostic, sprint, weekly check-ins, close, day 30) | Registration, programme record, append-only milestone events | **New tables:** engagement (door, sub-problem, measure, baseline, target, playbook version), weekly check-in (progress, blockers, next step, measure reading, questions asked, hours by role, AI used), close (final value, moved, extension, next door, retainer, day-30 check) |
| Client area: problem statement, measure, check-in log, files | Participant portal: briefs, uploads, progress tracker, sign-in | Add measure and check-in views; briefs become problem statements and tools |
| Desk lead and analysts; desk lead signs off prescriptions | Capability-scoped admins with invitations and an audit trail | Analyst permission profile; client allocation; sign-off step |
| Terms: owner implements, AI disclosed, one door at a time, consent for anonymised cases | Versioned consent acknowledgement | New terms content and version |
| Weekly check-ins and sessions | Slot scheduling, calendar events, `.ics` invitations, 24-hour reminders | Session kinds become discovery, diagnostic and check-in |
| AI (Claude) for scoring, analysis and drafts, disclosed | Manus LLM plumbing, which is unused | Anthropic API, when the scoring is built |

---

## 9. Phase 2 plan: client area live on an IPF domain by 8 November 2026

> Superseded in timing by v0.8.1: v0.1 launches on Manus on 9 October (see `LAUNCH_ON_MANUS.md` §4 for the v0.1 gaps). Workstream R now runs after the launch.

Four workstreams. R and B can start now. P depends on the instrument and record content from the IPF team. A closes.

**R. Replatform off Manus (target: by 23 Oct)**
- [x] R1 Delete unused Manus code: LLM, image, voice, map and data API helpers, `ManusDialog`, `ComponentShowcase`, the Manus Vite plugins and debug collector, the `*.manus.*` allowed hosts and origin trust.
- [ ] R2 Admin sign-in: replace Manus OAuth with Google sign-in on IPF's Workspace, keeping the existing admin password second factor. *Needs an IPF Google Cloud OAuth client.*
- [ ] R3 File storage: S3-compatible bucket (Cloudflare R2 or AWS S3; the SDK is already a dependency). Replace `/manus-storage/` and move the facilitator and brand assets into the repo.
- [x] R4 Owner notifications: replace Manus `notifyOwner` with email to the desk mailbox via the existing sender.
- [x] R5 Scheduled reminders: replace Manus heartbeat authentication with a shared-secret cron call (`CRON_SECRET`) from the host.
- [ ] R6 Hosting and deploy: Node host plus managed PostgreSQL (Supabase), deploying from GitHub; staging and production. *Needs a hosting choice and an IPF-owned account.*
- [ ] R7 Secrets under IPF ownership: database, `JWT_SECRET`, Resend (IPF sending domain), Google, Paystack, storage, cron.

**B. Brand and copy (visual by 16 Oct, copy once the name is set)**
- [x] B1 ipf-teal-navy palette into the colour tokens (brand-kit roles: primary `#174579`, deep `#0F2E52`, accent `#23807B`, teal `#57C3BD` for fills only, tint `#EDF7F6`, line `#CFE6E4`, body `#404040`).
- [x] B2 Logo files into `client/public/brand/` (full, mark, white and mono; used as supplied, never recoloured).
- [x] B3a Public home page rewritten from the concept note (hero, problem, fit, ten doors, how it works, pricing, team roles, FAQ) in an institutional voice; catalogue in `shared/businessSupport.ts`; working product name in `BRAND.productName`.
- [ ] B3b Final product name (7 Oct), desk mailbox and sender (D2), Apply link (`BRAND.applyUrl`, e.g. Calendly) and contact details.
- [ ] B4 Email templates and PDF footers in the IPF voice; AI disclosure line.

**P. Product layer (target: by 2 Nov)**
- [ ] P1 Products and payments: diagnostic, sprint and retainer; Paystack pages; referral rule; IPF bank-transfer details (D6).
- [ ] P2 Engagement record tables and admin desk views (the §8 schema), with weekly check-in entry by analysts.
- [ ] P3 Client area: problem statement, measure and trend, check-in log, files.
- [ ] P4 Intake: the 12-question form, either native or imported from the Calendly booking. *Decision needed.*
- [ ] P5 Analyst role, client allocation, prescription sign-off.
- [ ] P6 Terms v1 with AI disclosure and consent; versioned acknowledgement.
- [ ] P7 Ten-door diagnostic instrument and scoring (content from the team's Appendix D).

**A. Acceptance and launch (3–8 Nov)**
- [ ] A1 UAT script across sign-in, intake, payment, receipts, record, check-ins and the client area, on staging.
- [ ] A2 Security review: auth, uploads, origin checks, secrets, data retention.
- [ ] A3 IPF domain, TLS, mail sending domain (SPF, DKIM, DMARC) and analytics.
- [ ] A4 Go-live on 8 Nov; Monday desk-review metrics available from the record.

**Open inputs needed**

| Input | Needed for | By |
|---|---|---|
| Product name | B3, B4 | 7 Oct (per concept note) |
| IPF domain and desk mailbox (D2) | R6, R7, B3, A3 | 13 Oct |
| Super Admin and desk admins (D5) | R2 | 13 Oct |
| Hosting choice and IPF accounts (host, Google Cloud, Resend, Paystack, storage) | R2–R7 | 13 Oct |
| Intake model: native form or Calendly import (P4) | P4 | 16 Oct |
| Diagnostic instrument and engagement record definitions | P2, P7 | 16 Oct |
| Terms text, and the entity that signs | P6 | 23 Oct |
