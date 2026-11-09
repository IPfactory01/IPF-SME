# 6. Implementation plan

**What gets built, in what order, and how we know each piece is done.** Rewritten on 9 November 2026 to follow the
release order in the [PRD](01-prd.md) (section 10a). It replaces the October plan (phases 0 to 5), which is complete or
carried into the releases (section 6).

**The rule (PRD, rule 8):** nothing is built before it is in the PRD and the [App flow](03-app-flow.md). This plan turns
each release into tasks; the code follows the tasks. A new need goes into the PRD and the App flow first, then here.

**How to read a task:** the requirement it builds, what changes, the test that proves it, and whether it needs a
migration, a preview for ET or something from ET. Effort is build days for one builder, with tests and documents, not
counting time spent waiting on a decision or a migration.

---

## 1. Where we are (9 November 2026)

| Live on `main` | Requirements |
|---|---|
| The public site, the free Business Health Check, the Discovery Call on Calendly, the Full Report | R1 to R6 |
| Opening an engagement of any type with its fee schedule; paying online with Paystack: the Full Report, the Business Review and every engagement fee, each with its own pay link; the first payment opens the room | R7, R8, R10, R11, R24 (in advance) |
| The client's room (its third version): Overview, Content, Work Plan, Data Request, Sessions, Business, Founder, Deliverables, Payments; many projects per client; the owner's staff seat; Preview as client; asking for the next fix | R14, R15, R17 to R23, R25, R28 (asking) |
| The admin console in five tabs; Finance; Team by level with two-step sign-in; branded email from IP Factory | R29 to R32 |
| The design review fixes: the room fits a phone, readable health labels, 44 px taps (B1, B4, B10 to B12) | Design brief |

Migrations are applied through **0020**. The document tests (`test/docs/productDocs.test.ts`) fail the build if a page,
a table, a server action, a permission, a project role, an email or an audit action is added without being documented.

## 2. Before and alongside the build (no code)

| # | Item | Owner | Needed for | Status |
|---|---|---|---|---|
| K1 | Paystack live keys and the live webhook in Vercel | ET, Lewis | Real money on every pay page | To confirm |
| K2 | The sending domain (`contact.ipfactory.co`) verified in Resend | DG, Lewis | Email that reaches outside inboxes; every reminder (Release 2) | To confirm |
| K3, K4 | Supabase on a paid plan with daily backups; the old Supabase project secured | ET | Every client record | To do |
| K7 | A second owner on Google Search Console | ET | Search (R2, R73) | To do |
| I1 | Marcelle's Digital Marketer and Content Producer: names, and each one's WhatsApp number with their agreement to show it to clients (K11) | ET | R44, R45 (Release 0, batch B) | Waiting |
| I2 | The legal name a client sees on their bank statement (decision D1, with counsel, K5) | ET | R72 (Release 0, batch C) | Open |
| I3 | IP Factory's office WhatsApp number, for pay pages and links with no lead yet | ET | R72; R44 for the office | Waiting |
| I4 | Marcelle's fee dates moved to 30, 60 and 90 days from kickoff, and saved in Fees | ET or the lead | Marcelle's Payments tab | Waiting |

## 3. Release 0: the first client's experience

**Requirements:** R43, R44, R45, R46, R47, R61 (the product design review); R69, R70, R71, R72, R73 (the design brief
review). **Moves:** time to first value, trust, records in on time, visitors who stay.

**Done when:** a new Digital marketing client opens the room on a phone, sees who their experts are with a WhatsApp button
for each, sends the week's footage in under two minutes, and never meets a blank or misleading screen on a weak
connection; and a visitor on a phone sees the home page's content within 2.5 seconds.

Built in four batches. A and B are for the clients already in the room, so they go first; C waits on one decision for
one line; D can run alongside.

### Batch A: the room on a weak connection and a phone (no migration, about 6 days): built 9 November 2026

| # | Task | Builds | Acceptance and test | Status |
|---|---|---|---|---|
| A1 | **The four states as shared parts** (`client/src/components/states.tsx`): Loading (the outline in `paper-sunken`), Empty (what will appear and who adds it), Failed (the message, **Try again**, the last copy kept with its time), Partly done. Reads retry twice before failing; a refusal is never retried; no read turns retries off | R69 | Component tests for each state; a source test fails if a read sets `retry: false` | Built |
| A2 | **The room and the dashboard** use them: a failed load of the room says so and keeps what was there; "Your room opens here when…" shows only when the server says there is no engagement | R69 | UI tests: a failed read never shows the empty message; Try again reloads; the last copy stays | Built |
| A3 | **Account, sign-in, joining and pay pages** use them (`/settings/*`, `/onboarding`, `/join`, `/reset`, `/pay/*`) | R69 | UI test per page for loading, failed and empty | Built |
| A4 | **The admin console** uses them in every tab and in the engagement record | R69 | UI tests per tab | Built |
| A5 | **The room on a phone:** the header shrinks to one line (the project and its day) once the owner scrolls or leaves the Overview; the tab bar scrolls the selected tab into view and fades at the edge where more tabs sit | R71 | UI tests: the compact header off the Overview; the selected tab asked into view on every change; checked at 390 px in Chromium (the review's script) | Built |

### Batch B: the Digital marketing room (migration 0021, about 8 days)

| # | Task | Builds | Acceptance and test | Preview or input |
|---|---|---|---|---|
| B1 | **Migration 0021**, on the branch with a guarded `drizzle/supabase/apply-0021-*.sql`: `users.whatsapp` and `users.whatsappConsentAt` (a staff member's number and when they agreed to show it); the project roles `digital_marketer` and `content_producer` on `engagement_team_role`; `engagement_tasks.responseLink` (a link that answers an item). ET runs it in the Supabase SQL Editor and replies "0021 done"; then `main` | R43, R44, R45 | PGlite tests for each column and role; `pnpm db:verify` after it is applied | Applied 9 November 2026 (`apply-0021-staff-whatsapp-marketing-roles-response-link.sql`) |
| B2 | **A WhatsApp number on each staff profile:** set in People (`manage_users`) or by the person in Account settings, with the agreement tick ("My number may be shown to clients I work with"); entered with +234 by default; shown to a client only when agreed, and only to clients on that person's engagements | R44 | DB tests: no number without the agreement; a client sees numbers only for their own engagement's team; audit on change | Built; numbers from I1 |
| B3 | **WhatsApp in the room:** each team member with **WhatsApp {first name}** (a chat with a line naming the business and the project); an item assigned to one person offers **Send on WhatsApp to {name}**, naming the item, then **Mark as sent another way** | R44 | UI tests: the button only with a number; the message names the item | Built |
| B4 | **Send on WhatsApp beside every link the team sends:** the invitation, the sign-in link and each fee's pay link, to the client's WhatsApp number, with the message filled in | R44 | UI tests on Fees, the client record and Team | Built |
| B5 | **Digital Marketer and Content Producer** as project roles: labels, the order on the team, shown to the client with their WhatsApp; approval follows the person's level, as for every other role (App flow 4.6) | R45 | Room and admin UI tests; the document test checks both roles are in the App flow | Built |
| B6 | **Footage and voice notes:** audio files upload like any file (m4a, mp3, ogg and opus, aac, wav; 25 MB); any item can be answered with a link to a shared folder (Google Drive, Dropbox, WeTransfer, iCloud), which the team opens from the item; video is never stored | R43 | Upload type tests; DB test for the link answer and who can see it; a timed run on a phone with ET or Marcelle: footage sent in under two minutes | Built, but the timed run on a phone with ET or Marcelle |
| B7 | **The first visit:** on Overview until the kickoff is held, a welcome naming the experts with their WhatsApp buttons, the first three things to do this week (book the kickoff, the first records, any fee) and what happens next | R46 | UI tests: shown before the kickoff, gone after; each of the three links to its place | Built (Getting started) |
| B8 | **What we will do** (not "Your plan", which the method uses for the plan handed over at the end): a read-only card on Overview and in the owner's welcome email: what we will do (the service's or type's description), the team, the start date and each fee with its date (the payment terms join it with R36). A change to the fees after the owner has the room is recorded and emails the owner the new schedule | R47 | UI test for the card; email test; the document test checks the new email is in the App flow | Built (*Your fees have changed: {engagement}*) |
| B9 | **Removing a file:** the client removes a file they sent until the team has matched it; the team removes any file with a reason; the stored object is deleted and the removal recorded (`engagement_file_removed`) | R61 | DB tests: a client cannot remove a matched file or another client's; the object is deleted; the audit action is declared and documented (document test) | Built |

### Batch C: paying with confidence (about 2 days)

| # | Task | Builds | Acceptance and test | Input |
|---|---|---|---|---|
| C1 | **Every pay page** (`/pay/:token/:item`, `/pay/fee/...`), the pay-page part of R38, shows before **Pay**: who is paid (the legal name on the statement), what for, the amount in full, the reference, that the receipt comes by email, and a WhatsApp button to the lead or the office. The Pay button uses the gradient and the page moves to 8 px corners (Design brief, section 4) | R72 | UI tests on both pay pages | I2 (the name), I3 (the office number) |

### Batch D: speed and search (about 6 days, alongside): built 9 November 2026

| # | Task | Builds | Acceptance and test |
|---|---|---|---|
| D1 | **Each public page loads its own code;** the room and the admin console stay separate. A budget check at the end of `pnpm build` fails it when a public page's JavaScript passes 170 KB compressed | R70 | The budget check in the build. Built 9 November 2026: 123 to 142 KB per public page (276 KB before) |
| D2 | **Pre-render the real page:** `scripts/prerender.ts` renders each public page as it looks (today it writes text for search engines only), and the browser takes it over without redrawing; nothing in the first screen fades in | R70 | A test that each pre-rendered page holds its visible heading and first section; Lighthouse's mobile profile: Home, the check and a guide show their main content within 2.5 s (Home 4.3 s today). Built 9 November 2026: Home 0.9 s, the check 0.8 s, a guide 0.9 s; the hydration test renders and takes over every public page |
| D3 | **One heading per page:** How we work and the check get their own main heading; the promise stays the home page's heading and a line elsewhere | R73 | A test over every public page: no two share an `h1`. Built 9 November 2026: How we work with your business; Free Business Health Check |
| D4 | **A share card for each guide and service** (1,200 × 630, its title on the brand card), made by a script and kept in `client/public/share/`; each page points to its own | R73 | A test: every guide and service has its card and uses it. Built 9 November 2026: a card for every public page (31), not only guides and services, so none shares one (R73); the brand card now says See the shift |

**Release 0 in total:** about 22 build days. The order: A, then B once 0021 is applied and I1 is in, then C, with D
alongside. Each batch is previewed at phone and laptop width before ET says "push it".

## 4. Later releases (outline)

Each release is planned in full, like section 3, before it starts.

| # | Release | Requirements | Needs first | Size |
|---|---|---|---|---|
| 1 | Payment terms and one payment model | R36, R37, R24, R42; the pause screen of R51; the groundwork for R53 | Decisions D4 (arrears limit) and D6 (when work pauses); a migration for each engagement's terms and refunds | M |
| 2 | Fee, Data Request and Session reminders | R12, R16, R48, R57, R59, R64 | A scheduled job on Vercel; the sending domain verified (K2); quiet hours | M |
| 3 | Buy now and the trust layer | R13, R38, R35 | Paystack live (K1) | M |
| 4 | Close, the Day-30 Review and the next fix | R26, R27, R28 | A migration for the close record | M |
| 5 | The room and the team's day, after the usability test | R49, R50, R52, R54, the rest of R51 | The usability test with a live client (A4) | L |
| 6 | Tracking, the measures page, receipts | R39, R34, R53 | Decision D5 (the analytics tool); a consent notice (K9) | M |
| 7 | Sign-in links and the rest | R41, R55, R56, R58, R60, R62, R63, R65 to R68 | — | L |
| Alongside | Search | R40, R2 | A Google Business Profile; Search Console (K7) | S |

S is under a week, M one to two weeks, L more.

## 5. How each piece is delivered

1. **In the documents first:** the requirement is in the PRD and the App flow before the code (rule 8).
2. **Tests first for access:** a client cannot reach another client's records; a person outside an engagement cannot
   reach it; then the behaviour.
3. **Migrations on the branch,** with a guarded apply script in `drizzle/supabase/`. ET runs it in the Supabase SQL Editor
   and replies "00NN done"; only then does the code reach `main` (`docs/database-migrations.md`).
4. **`pnpm verify` passes;** anything people see is previewed at phone and laptop width, with the accessibility check on
   the changed screens; `main` only on ET's word.
5. **The documents change in the same commit** as the code; the document tests enforce it.

## 6. Carried from the October plan

The October phases built the room, the Sessions, the Data Request and the check-ins. What was left is carried here:

| October item | Now |
|---|---|
| 4.4 Close and the Day-30 Review | Release 4 (R26, R27) |
| 4.5 The Monday scorecard | R34, Release 6 |
| Privileged access, phase 2: the access review, the audit log as a screen, a recovery runbook | R66 (Release 7); the runbook with the access review |
| Q5 Full Report links that expire after delivery; Q6 the check's token stored as a hash (migration); Q7 the shadcn colour roles mapped to the theme | Small fixes, taken with the next release that touches each |
| Phase 5: referral codes, transcript import, a settings screen for prices and copy, retiring the JUMP tables | PRD: R33 (settings), section 10 (not in this release); the JUMP tables once nothing reads them (Backend schema, section 3) |
