# 6. Implementation plan

**What gets built, in what order, and how we know each piece is done.** Rewritten on 9 November 2026 to follow the
release order in the [PRD](01-prd.md) (section 10a). It replaces the October plan (phases 0 to 5), which is complete or
carried into the releases (section 7). Updated on 10 November 2026: Release 0 is built but for batch C, and Release 1 is
planned in full (section 4).

**The rule (PRD, rule 8):** nothing is built before it is in the PRD and the [App flow](03-app-flow.md). This plan turns
each release into tasks; the code follows the tasks. A new need goes into the PRD and the App flow first, then here.

**How to read a task:** the requirement it builds, what changes, the test that proves it, and whether it needs a
migration, a preview for ET or something from ET. Effort is build days for one builder, with tests and documents, not
counting time spent waiting on a decision or a migration.

---

## 1. Where we are (10 November 2026)

| Live on `main` | Requirements |
|---|---|
| The public site, the free Business Health Check, the Discovery Call on Calendly, the Full Report | R1 to R6 |
| Opening an engagement of any type with its fee schedule; paying online with Paystack: the Full Report, the Business Review and every engagement fee, each with its own pay link; the first payment opens the room | R7, R8, R10, R11, R24 (in advance) |
| The client's room (its third version): Overview, Content, Work Plan, Data Request, Sessions, Business, Founder, Deliverables, Payments; many projects per client; the owner's staff seat; Preview as client; asking for the next fix | R14, R15, R17 to R23, R25, R28 (asking) |
| The admin console in five tabs; Finance; Team by level with two-step sign-in; branded email from IP Factory | R29 to R32 |
| Release 0 (9 November): every screen says what is happening on a weak connection; the room on a phone; footage and voice notes by link; WhatsApp to the right person; the Digital Marketer and Content Producer roles; Getting started and What we will do; taking a file back | R43 to R47, R61, R69, R71 |
| Release 0 (9 November): speed and search: each public page rendered at build time and loading its own code (Home 0.9 s on a throttled phone, was 4.3 s); one main heading and one share card per page | R70, R73 |
| The design review fixes: the room fits a phone, readable health labels, 44 px taps (B1, B4, B10 to B12) | Design brief |

Migrations are applied through **0021**. Release 0 still waits on the timed phone run with ET or Marcelle (B6) and the
team's WhatsApp numbers (I1); batch C was built on 10 November. The document tests (`test/docs/productDocs.test.ts`) fail the build
if a page, a table, a server action, a permission, a project role, an email or an audit action is added without being
documented.

## 2. Before and alongside the build (no code)

| # | Item | Owner | Needed for | Status |
|---|---|---|---|---|
| K1 | Paystack live keys and the live webhook in Vercel | ET, Lewis | Real money on every pay page | To confirm |
| K2 | The sending domain (`contact.ipfactory.co`) verified in Resend | DG, Lewis | Email that reaches outside inboxes; every reminder (Release 2) | To confirm |
| K3, K4 | Supabase on a paid plan with daily backups; the old Supabase project secured | ET | Every client record | To do |
| K7 | A second owner on Google Search Console | ET | Search (R2, R73) | To do |
| I1 | Marcelle's Digital Marketer and Content Producer: names, and each one's WhatsApp number with their agreement to show it to clients (K11) | ET | R44, R45 (Release 0, batch B) | Waiting |
| I2 | The legal name a client sees on their bank statement (decision D1, with counsel, K5) | ET | R72 (Release 0, batch C) | Enzo Krypton & Co., through its Paystack (ET, 10 November); the exact statement wording to confirm in Paystack |
| I3 | IP Factory's office WhatsApp number, for pay pages and links with no lead yet | ET | R72; R44 for the office | Given (ET, 10 November) |
| I4 | Marcelle's fee dates moved to 30, 60 and 90 days from kickoff, and saved in Fees | ET or the lead | Marcelle's Payments tab | Waiting; or set by her terms with Release 1 (E6) |

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

### Batch B: the Digital marketing room (migration 0021, about 8 days): built 9 November 2026, but the timed phone run (B6)

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

### Batch C: paying with confidence (about 2 days): built 10 November 2026

| # | Task | Builds | Acceptance and test | Input |
|---|---|---|---|---|
| C1 | **Every pay page** (`/pay/:token/:item`, `/pay/fee/...`), the pay-page part of R38, shows before **Pay**: who is paid (the legal name on the statement), what for, the amount in full, the reference, that the receipt comes by email, and a WhatsApp button to the lead or the office. The Pay button uses the gradient and the page moves to 8 px corners (Design brief, section 4) | R72 | UI tests on both pay pages | I2 (the name), I3 (the office number). Built 10 November 2026: Enzo Krypton & Co. collects (ET); the office WhatsApp is +234 810 160 3638 |

### Batch D: speed and search (about 6 days, alongside): built 9 November 2026

| # | Task | Builds | Acceptance and test |
|---|---|---|---|
| D1 | **Each public page loads its own code;** the room and the admin console stay separate. A budget check at the end of `pnpm build` fails it when a public page's JavaScript passes 170 KB compressed | R70 | The budget check in the build. Built 9 November 2026: 123 to 142 KB per public page (276 KB before) |
| D2 | **Pre-render the real page:** `scripts/prerender.ts` renders each public page as it looks (today it writes text for search engines only), and the browser takes it over without redrawing; nothing in the first screen fades in | R70 | A test that each pre-rendered page holds its visible heading and first section; Lighthouse's mobile profile: Home, the check and a guide show their main content within 2.5 s (Home 4.3 s today). Built 9 November 2026: Home 0.9 s, the check 0.8 s, a guide 0.9 s; the hydration test renders and takes over every public page |
| D3 | **One heading per page:** How we work and the check get their own main heading; the promise stays the home page's heading and a line elsewhere | R73 | A test over every public page: no two share an `h1`. Built 9 November 2026: How we work with your business; Free Business Health Check |
| D4 | **A share card for each guide and service** (1,200 × 630, its title on the brand card), made by a script and kept in `client/public/share/`; each page points to its own | R73 | A test: every guide and service has its card and uses it. Built 9 November 2026: a card for every public page (31), not only guides and services, so none shares one (R73); the brand card now says See the shift |

**Release 0 in total:** about 22 build days. The order: A, then B once 0021 is applied and I1 is in, then C, with D
alongside. Each batch is previewed at phone and laptop width before ET says "push it".

## 4. Release 1: payment terms and one payment model

**Requirements:** R36, R24 (the monthly dates), R37, R42, R51 (the pause screen and the resumed email), the groundwork for
R53. The App flow already sets out the behaviour: payment terms (section 3), the Fee and Payment states (section 5),
journey step 7b (work paused) and the emails (section 6). **Moves:** cash collected on its date; Finance's numbers trusted
without a spreadsheet; no client surprised by a pause.

**Done when:** every engagement's fees follow what was bought, with no terms negotiated one by one; a new client sees
only the first part until it is paid; sharing a service's main output dates its second half seven days ahead and
emails the owner the pay link; Finance counts every unpaid fee as owed, late once its date passes, and reads one ledger, in which every naira paid
traces to one fee and one Paystack reference, or to a payment recorded by hand with who recorded it; a fee seven days
late pauses the work, with a banner in the room saying what to pay; a refund is recorded against the payment it
returns; and a Paystack notification the server could not process reaches the office the same day.

**Decided on 10 November (ET):** there is no arrears limit, because no engagement chooses its own terms (D4): a product
is paid before we start, a service agreed on a call half to start and half on delivery (the Six-Week Fix too),
Digital marketing monthly and a Monthly Service by the quarter (R36). Work pauses seven days after a missed date, the
client told at three (D6). Batch E needs no migration: the terms come from what is bought, and the dates sit on the fees.

**Needs first:** K5 (counsel adds to the Terms who collects payments, Enzo Krypton & Co., and the pause period).

One migration, **0022**, for batch F (the ledger, refunds and receipt numbers), written on the branch with its guarded
apply script; ET runs it and replies "0022 done".

### Batch E: payment terms by what is bought (no migration, about 3 days)

| # | Task | Builds | Acceptance and test | Preview or input |
|---|---|---|---|---|
| E1 | **The schedule from what is bought.** A product: one fee before we start. A service agreed on a call: *half to start* and *half on delivery*, in whole naira that add up to the price; the Six-Week Fix moves from 50/25/25 to 50/50 (paying in full at the start still saves 5%). Digital marketing: three monthly fees on day 0, 30 and 60. A Monthly Service: the first quarter. The first part is dated the start day; the second half has no date until delivery | R36, R24 | Unit tests for every product, service and type | — |
| E2 | **The Business Review's first half.** Its payment details ask for half (₦300,000 of ₦600,000); paying it opens the engagement with the second half as a fee; an older request paid in full adds nothing. The room's Payments tab shows the first half paid | R36 | PGlite: the request, the confirmation, the balance fee; the older request | — |
| E3 | **Delivery dates the second half.** Sharing the main output (a Business Review's Findings, a Six-Week Fix's Plan, a Done for You service's work) dates every unpaid fee that has no date yet seven days ahead, and emails the owner its pay link (*{fee}: ₦{amount} due by {date}*) | R36 | PGlite: the date, the email once, nothing for a Digital marketing piece or a second share | — |
| E4 | **The site says how each is paid:** How we work, Services, each service's page, the questions, the journey; the room's What we will do and the welcome email list each part | R36, R47 | UI and copy tests; the words the site avoids | Preview |
| E5 | **The pause (D6).** Seven days after an unpaid fee's date the engagement shows *Paused* to the team and the room shows what to pay to continue, with **Pay**; paying, or a new date, lifts it | R51 | Unit and room UI tests | Preview |

### Batch F: one payment model (about 4 days)

| # | Task | Builds | Acceptance and test | Preview or input |
|---|---|---|---|---|
| F1 | **The ledger (`payments`).** One row for each attempt to pay a fee: on Paystack (started, then paid or failed, with its reference and mode) or by hand (a bank transfer or cash: amount, date, a note and who recorded it, which replaces the bare *Paid* tick). A fee is paid when its paid payments add up to its amount, so a fee can be paid in parts by hand. Each paid payment gets the next receipt number (`TS-RC-000001`) and each fee an invoice number, ready for the PDFs of R53 | R37, R53 | PGlite: opening Paystack records the attempt; the webhook and the return page together record one payment and one receipt; two part payments settle a fee; a second Paystack payment for a paid fee *needs a look*; receipt numbers are unique and in order | — |
| F2 | **Refunds.** After the team refunds in Paystack, the refund is recorded against the payment it returns (amount, date, reason, who); the fee is owed again unless the lead writes it off, which is also recorded | R37, R51 | PGlite: a refund reopens the fee; a write-off closes it; the audit rows; Finance shows both | — |
| F3 | **The Business Review moves onto the ledger.** Sending its payment details opens its engagement awaiting the first payment, with its fee, so it is paid through the fee pay page like any fee; paying it still moves the check to *Won*, opens the room and invites the owner. The Full Report records each payment in the same ledger until orders arrive (Release 3); payment requests from before stay as history | R37 | PGlite: the check-to-Business-Review route end to end; *Won* on payment; the owner's invitation; an older request still reads correctly | Preview of the changed admin step |
| F4 | **Finance reads one source:** money in from the ledger, money owed from the fees; every naira paid opens to its fee and its reference | R37 | Finance test: the totals equal the ledger | Preview |

### Batch G: when a fee is late, and alerts (about 2 days)

| # | Task | Builds | Acceptance and test | Preview or input |
|---|---|---|---|---|
| G1 | **Work paused** (moved to E5 on 10 November; kept here for the record). Seven days after an unpaid fee's date (D6) the engagement shows *Paused* to the team, on the list and the record, and the room shows a banner saying what to pay to continue, with **Pay**; the room stays readable and uploads stay open. Paying lifts it at once. Moving the fee's date gives more time, lifts it and tells the owner (built: *Your fees have changed*) | R51 | Unit: the pause date from the terms and the dates; room UI: the banner and **Pay**; PGlite: a payment or a new date lifts it | D6; preview |
| G2 | *Work on {engagement} has resumed*, to the owner and the lead, when a payment lifts a pause | R51 | Email test; the document test checks the email is in the App flow | — |
| G3 | **Alerts.** A Paystack notification the server could not process (answered 500, so Paystack sends it again) emails the office at once, once per reference; a client email that failed shows at the top of the console's first tab until someone opens it. A daily summary joins the scheduled jobs in Release 2 | R42 | PGlite or unit: the failing webhook emails the office once; console UI test for the failed-email line | — |

**Release 1 in total:** about 10 build days. The order: E1, then E2 to E6 once 0022 is applied and D4 is in, then F,
then G once D6 is confirmed. Each batch is previewed at phone and laptop width before ET says "push it".

## 5. Later releases (outline)

Each release is planned in full, like sections 3 and 4, before it starts.

| # | Release | Requirements | Needs first | Size |
|---|---|---|---|---|
| 1 | Payment terms and one payment model | R36, R37, R24, R42; the pause screen of R51; the groundwork for R53 | Planned in full in section 4 | M |
| 2 | Fee, Data Request and Session reminders | R12, R16, R48, R57, R59, R64 | A scheduled job on Vercel; the sending domain verified (K2); quiet hours | M |
| 3 | Buy now and the trust layer | R13, R38 (R35 built early, 10 November 2026) | Paystack live (K1) | M |
| 4 | Close, the Day-30 Review and the next fix | R26, R27, R28 | A migration for the close record | M |
| 5 | The room and the team's day, after the usability test | R49, R50, R52, R54, the rest of R51 | The usability test with a live client (A4) | L |
| 6 | Tracking, the measures page, receipts | R39, R34, R53 | Decision D5 (the analytics tool); a consent notice (K9) | M |
| 7 | Sign-in links and the rest | R41, R55, R56, R58, R60, R62, R63, R65 to R68 | — | L |
| Alongside | Search | R40, R2 | A Google Business Profile; Search Console (K7) | S |

S is under a week, M one to two weeks, L more.

## 6. How each piece is delivered

1. **In the documents first:** the requirement is in the PRD and the App flow before the code (rule 8).
2. **Tests first for access:** a client cannot reach another client's records; a person outside an engagement cannot
   reach it; then the behaviour.
3. **Migrations on the branch,** with a guarded apply script in `drizzle/supabase/`. ET runs it in the Supabase SQL Editor
   and replies "00NN done"; only then does the code reach `main` (`docs/database-migrations.md`).
4. **`pnpm verify` passes;** anything people see is previewed at phone and laptop width, with the accessibility check on
   the changed screens; `main` only on ET's word.
5. **The documents change in the same commit** as the code; the document tests enforce it.

## 7. Carried from the October plan

The October phases built the room, the Sessions, the Data Request and the check-ins. What was left is carried here:

| October item | Now |
|---|---|
| 4.4 Close and the Day-30 Review | Release 4 (R26, R27) |
| 4.5 The Monday scorecard | R34, Release 6 |
| Privileged access, phase 2: the access review, the audit log as a screen, a recovery runbook | R66 (Release 7); the runbook with the access review |
| Q5 Full Report links that expire after delivery; Q6 the check's token stored as a hash (migration); Q7 the shadcn colour roles mapped to the theme | Small fixes, taken with the next release that touches each |
| Phase 5: referral codes, transcript import, a settings screen for prices and copy, retiring the JUMP tables | PRD: R33 (settings), section 10 (not in this release); the JUMP tables once nothing reads them (Backend schema, section 3) |
