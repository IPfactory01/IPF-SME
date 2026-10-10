# 1. Product requirements (PRD)

**Product:** The Shift, by IP Factory (`BRAND.productEndorsement` in `shared/brand.ts`)
**Promise:** Find it. Fix it. See the results.
**Status:** v0.1 live at https://ipf-sme.vercel.app, built up to the start of the Current State Assessment. Last reviewed 9 October 2026.
**Source:** *Business Support Concept Note and Launch Blueprint v0.8.1* (6 October 2026), referred to below as "the concept note" with its section numbers, plus the decisions taken while building (section 9).

This document says what the product does, feature by feature, and the status of each feature. How it is built is in
[2. Technical requirements](02-technical-requirements.md); what happens on each click is in [3. App flow](03-app-flow.md).

---

## 1. The product in one page

Business owners at this size know roughly what to do and cannot get it done (concept note §2). The Shift gets into the
business with the owner, names the problem, tells them what to do, hands over the tools and checks the work every week
until one agreed number moves. **The business owner does the work; IP Factory prescribes, equips, reviews and tracks.**
Analysts and AI do most of the analysis under a named IP Factory consultant, and we say so.

| | |
|---|---|
| **Who it is for** | Owner-run businesses trading at about ₦5,000,000 a month or more, two years or older, typically 5 to 50 staff, who can give two to four hours a week (§4) |
| **Not for** | Pre-start founders (founder readiness only), businesses under ₦1,000,000 a month with no staff (training), businesses over ₦25,000,000 a month or 50+ staff (IP Factory Advisory) |
| **The pilot** | 20 paying clients between 9 October and 10 December 2026; about ₦34,000,000 at list by 31 December (§9, §11) |
| **Second job of the pilot** | Build the working parts (problem taxonomy, business check, method per problem area, check-in template, engagement record) that become the "Strategy in a Box" portal in January 2027 (§8) |

## 2. Users

One person has one identity; roles and assignments are added to it (see `AGENTS.md` and [5. Backend schema](05-backend-schema.md)).

| User | Who | What they need from the product |
|---|---|---|
| **Visitor / prospect** | A business owner who has not paid. Not signed in | A free business check that names their gap, a way to book a call, and the option to buy the full report |
| **Client (business owner)** | A paying owner with a client account | One place to see where the engagement is, what we need from them, what was agreed and what they have received |
| **Desk lead** | Lewis Osako | Run the desk: every lead, call, payment, engagement and sign-off |
| **Analyst** | Richard Kehinde, Collins Tobenna, Olamide Akin-Alamu, Lovelyn Nzubechukwu | Their assigned clients only: preparation, check-ins, the record |
| **Partner** | Mr Tarfa (ET), Victor Anagor | Current State Assessment calls and key reviews for clients above ₦10,000,000 a month |
| **Subject-matter expert** | Group co-founders and partners | Access to one engagement or problem area when invited |
| **Finance** | To be named | Payment requests, proof, confirmation and reconciliation, without the diagnostic detail |
| **Admin / Super Admin** | Lewis (Super Admin), Richard (admin) per D5 | Staff, roles, permissions and platform settings |
| **System actors** | The AI summary, the report builder, scheduled reminders | Server-controlled and audited; never an interactive account |

## 3. The journey and the prices

The whole journey is shown up front with prices (concept note D1). Prices live in `shared/businessSupport.ts` (`PRICES`, `JOURNEY`).

| # | Step | Price | What the owner gets | Status |
|---|---|---|---|---|
| 1 | Free business check | Free | Ten minutes on a phone; a colour-coded outline of the ten problem areas; one of four gaps; a summary | **Built** |
| 1a | Full report (optional) | ₦100,000 | A business-plan-depth report, built from the check and a 17-question form, emailed as a PDF the moment the form is finished | **Built** |
| 2 | Discovery call | Free, 20 minutes at most | An honest answer: can we help, and with what | **Built** (booking and outcome) |
| 3 | Payment for Current State Assessment | ₦500,000 (fixed) | Paid after the call, within 48 hours. Paystack is the agreed method; until it is set up, bank transfer with manual confirmation | **Built** (manual confirmation, interim) |
| 4 | Getting set up (onboarding) | Included | Three working days: client account, welcome note, data request, analyst assigned, both Current State Assessment calls booked | **Partly built** (account only) |
| 5 | Current State Assessment | Included in step 3 | Two weeks, one 90-minute call a week; ends with proceed, fix the basics first, or refer to Advisory | **Not built** in the platform |
| 6 | The six-week fix | ₦1,200,000 | One problem; what to do and the tools; a weekly 45-minute check-in; one measure tracked | **Not built** |
| 7 | The plan | Standard engagement stops at about ₦2,500,000 | A plan in the owner's hands; ongoing support agreed per client | **Not built** |
| — | Day-30 follow-up | Included | Check that the output is still in use and the measure held | **Not built** |
| — | Referral | 10% off the next invoice per paying referral, up to 30%, never on a first payment | Rewards staying as well as referring | **Not built** in the new flow (a JUMP module exists) |

## 4. Features

Each feature lists what it must do, the rules it follows and its status. "Built" means it is live, tested and on `main`
(or on the working branch awaiting "push to main", marked *branch*).

### F1. Public site

- Home page in the owner's words (concept note §16): hero, the problem in their words, what we are and are not, how it
  works with prices, the ten places a business gets stuck, who it is for, who you work with, questions, the ask.
- Copy rules: second person, short sentences, naira in full, no consulting words, never "door", "sprint", "playbook"
  or "retainer" (§3 front matter; `AGENTS.md`).
- No "book a Current State Assessment" button: the call comes first and the payment request follows it.
- **Status: Built** (`client/src/pages/Home.tsx`, content from `shared/businessSupport.ts`). Gap: the "Client sign in"
  link still opens the JUMP participant sign-in instead of `/login` ([App flow §10](03-app-flow.md)).

### F2. Free business check

- Asks who the owner is first (name, email, WhatsApp with a country code, how they heard), then saves a lead before any
  business question.
- A decision tree, not a questionnaire (§15): profile (stage, business name and one-line description, both required,
  age, kind of business, sector from twelve options, staff, revenue, trend), founder readiness (hours, team, education,
  money basics, DISC-style read of how they lead under pressure and how others see them), then only the problem areas
  that apply to the stage and age. No path is longer than about 30 questions.
- Routing: idea stage → founder readiness and the idea; side business → areas 1, 3, 5, 7 (and 6 with three or more
  staff); full-time under 5 years → areas 1 to 8; 5 to 10 years → adds 9; over 10 years → all ten, business model first;
  over ₦25,000,000 a month or 50+ staff → stops after the profile and goes to an adviser; under ₦1,000,000 a month with no
  staff → founder readiness only.
- Examples under each area match the owner's sector; "Other" falls back to examples by kind of business.
- Result: a colour-coded outline (clear, watch, stuck) with a "Start here" area, one of four gaps (clarity, know-how,
  resources, strategy), founder readiness in words, up to three services from the catalogue that fit, the full report
  offer, and the call booking. Areas the check did not ask about are shown greyed as "Not assessed" with the reason,
  and "The Current State Assessment looks at all ten" (*branch*).
- The summary is AI-written and checked against the service catalogue; if the AI fails, a rules summary is used. The
  owner's description is the main source for tailoring; when it is unclear or does not fit the sector, the sector wins
  (*branch*). Scoring, routes and colours are deterministic and never changed by the AI.
- Trading businesses end with **the problem to fix** (concept note §15, block 3): what they have already tried
  (optional), roughly what the problem costs each month, and who decides on spending to fix it. These prepare the
  discovery call and never change the outline, the route or the score. Ideas, very small and very large businesses
  skip it.
- Progress is saved on the device and on the server; a returning owner resumes where they stopped.
- Emails: the owner gets their summary; the office gets a notice with every answer.
- **Status: Built** (`client/src/pages/BusinessCheck.tsx`, `shared/businessCheck/*`, `server/businessCheck.ts`,
  golden snapshots in `test/server/businessCheck.profiles.golden.test.ts`).

### F3. Full report (₦100,000)

- Independent of Current State Assessment: it is simply the report, and it is never credited against later fees.
- Request from the result page → payment details emailed (with a reference such as `TS-R-000123`) → owner sends proof
  → the team marks proof received and confirms payment → the owner is emailed a private link to a 17-question form.
- The form is about 12 minutes. Question 3 asks how each product is charged: a set price, a percentage of the deal
  (commission or success fee, with an optional typical deal size), or a price that varies. When any line is a percentage,
  the money questions ask about fees, not deal money passed on. The owner can type a margin instead of choosing a band
  (*branch*).
- **Fully deterministic:** no AI and no analyst. The report is built by fixed rules and emailed as a branded PDF the moment
  the form is submitted; the owner can also download it on the page. Same answers, same report, word for word.
- Structure: a one-page answer, then eleven parts (business today, where it is going, market, offer and model, customers
  and sales, how it runs, risks, numbers, diagnosis, 90-day plan, how we can help) and an appendix of every answer.
- The team can see the report status, resend the form link (the old link stops working) and download the report.
- **Status: Built** (`shared/fullReport/*`, `server/fullReport/*`, `client/src/pages/FullReportPage.tsx`).

### F4. Discovery call

- From the result page the owner books a 20-minute call in the embedded Calendly calendar (name and email filled in).
  The call counts as booked only when Calendly confirms. Without a booking page the button records a request and the
  team emails.
- The team records the outcome: **Opportunity** (we can help), **Refer** (to IP Factory Advisory or a specialist) or
  **Lost**; "Move to" sets any other stage, such as **Nurture** (pipeline stages in `shared/businessCheck/pipeline.ts`).
- **Status: Built.**

### F5. Payments (manual confirmation until Paystack is set up)

- Items: full report (₦100,000) and Current State Assessment (₦500,000). References `TS-R-` and `TS-CS-` with a six-digit number.
- Statuses: awaiting payment → proof received → paid. Only `manage_payments` (finance, Super Admin) can send details, mark
  proof or confirm.
- Bank details come from the hosting settings. Until all three are set, emails show a test account marked
  "TEST DETAILS - DO NOT PAY".
- **The 48-hour window** (concept note §7): payment details hold for 48 hours, and the email says when to pay by, in
  Lagos time. After that the team sees "48 hours passed" and either sends the details again (a new 48 hours) or moves
  the business to Lost. The stage never moves on its own, and money that still arrives can always be confirmed.
- Confirming Current State Assessment moves the business to Won and sends the client account invitation.
- **Paystack is the agreed way to pay** (concept note §11): the owner pays online and the payment confirms itself, with the
  same effects as "Confirm payment". Manual confirmation is the interim method only because the Paystack account is not
  set up yet; once it is, manual confirmation stays as a fallback for direct transfers.
- **Status: Built** (manual confirmation). **Paystack: not built**, waiting for the account and its keys
  ([implementation plan §4](06-implementation-plan.md)).

### F6. Client account and onboarding

- Invitation only: no public sign-up. The invitation is single-use, expires, and creates the person, the business, the
  owner membership and the first session in one transaction.
- One person, one identity: an existing account is never merged or given a new business here.
- If a browser is signed in as someone else, the invitation page says so and offers "Sign out and continue" (*branch*).
- **Status: Built** (`server/clientOnboarding.ts`, `client/src/pages/OnboardingPage.tsx`). The rest of onboarding
  (welcome note, data request, analyst assigned, calls booked) is **not built**: see F7.

### F7. Client dashboard: the engagement room

What the client sees while the engagement runs, on `/dashboard`. Built around the questions an owner asks:

| The owner asks | The room shows | Concept note |
|---|---|---|
| **Where are we?** | The journey (getting set up, Current State Assessment week 1 and 2, the fix week 1 to 6, the plan, day 30), the next session and its date, the named team | §7 |
| **What do you need from me?** | Data requests with due dates, an upload against each (PDF, photos, spreadsheets, Word; up to 25 MB), and a status (to do, sent, received, needs more) | §7 onboarding: data request list |
| **What did we agree?** | Each session with its notes, decisions and actions (who does what by when); in the fix, the measure with its baseline, target and weekly reading | §7: notes reach the owner the same day; §17 check-in rows |
| **What have I got?** | Deliverables: the problem statement, Current State Assessment findings, the prescription and tools, the plan, the full report, invoices and receipts | §8, §17 |

Rules:

- Nothing reaches the client until a team member shares it. Deliverables (prescriptions, plans) need the desk lead's
  sign-off first (concept note: "Lewis signs off every prescription").
- Session notes reach the owner the same day (ET's precision rule, §7).
- A client sees only their own business. Staff see only the engagements they are on unless they hold
  `view_all_businesses`.
- Session notes and findings go to the owner by default; the owner decides what their staff see (decided 9 October:
  owners speak frankly on our calls). One staff seat is included, as Full or Contributor (`shared/engagement.ts`).
- Bookings stay on Calendly and are recorded in the room; conversation stays on WhatsApp; the team's internal tasks stay
  in ClickUp.
- AI-drafted notes and summaries are system output and are reviewed by a person before sharing.
- **Status: Built (9 October), live once migration 0008 is applied:** where we are (journey, next call, team), what we
  need from you (data requests from the template, "I have sent this"), what we have found (shared notes and
  deliverables, comments, the owner's sign-off, the owner's share-with-my-team choice). **Built 10 October:** uploads against a
  data request and files on deliverables, straight from the browser to a private bucket, opened only through short-lived
  links the server issues after checking who is asking; switched on by the storage settings in Vercel. **Built 10
  October:** the one number we watch (where it started, this week, where it is going, week by week with the next step),
  shown to the owner and their full-access staff once the team sets it. The owner's **Your team** card
  invites one person as Full or Contributor, changes their access or removes them. **Designed 10 October:** the room in the
  site's dress (design brief §9): the business, the stage, the next call and what to send first at the top, the journey bar,
  two columns on a desktop; account details moved to the settings pages. **Built 10 October (migration 0009):** the Debrief
  record (written up in the admin, shared to the owner as a separate step) and the Work Plan (every request, action and call
  placed in a week, in order, tagged internal or external), the two things the room brief (document 07) needs. **Rebuilt 10 October to the room brief:** now, the next
  action, the next Session, the Engagement timeline 1 to 7 with the Work Plan by week, in the method's vocabulary.

### F8. Engagement record and check-ins (internal)

One record per client from the free check to day 30 (concept note §17): identity, business check, funnel, onboarding and
Current State Assessment (analyst, data request sent and received, calls, chosen problem area, sub-problem, problem statement,
partner involved), fix (measure name and definition, baseline, target, method version, tools issued), one weekly
check-in row (progress, blockers, next step, measure reading, questions asked, hours by role, AI used) and close (final
value, moved, extension, plan delivered, next problem area, ongoing support defined, day-30 check).

- The record is what the January portal is built on, and the evidence for the pilot's pass marks (§13).
- **Status: Partly built (9 October).** The engagement starts with the template when the Current State Assessment is
  paid; the admin Engagements section holds the stage, the team, the one problem, the calls with client and internal
  notes, requests and actions, and deliverables with approval. The measure (set in fix week 1) and the weekly check-in (the five
  questions, the reading, questions asked, hours by role, AI used) are recorded in the Engagements section, one week at a
  time and in order (10 October). **Not built yet:** the close and the day-30 check, which need their own table
  (migration 0009), planned for December when the first fixes close.

### F9. Internal workspace (admin console)

- Leads: every business check with stage, contact, answers, outline, the summary and history.
- Pipeline: discovery call outcome (Opportunity, Refer, Lost), any stage by "Move to", onboarding invitation, Won.
- Payments panel and full report line on each check (F3, F5).
- Staff sign-in with email and password; staff invitations; capability-based permissions; audit trail.
- The JUMP-era views (registrations, participants, scheduling, receipts) remain for history and are not part of the new
  flow.
- **Status: Built** for leads, pipeline, payments, report, staff and engagements (F8, once migration 0008 is applied).

### F10. Emails

- Branded with the IP Factory logo and palette; plain-text content turned into headings, detail tables, bullets and one
  button. Sent from `EMAIL_FROM` (default `IP Factory <info@ipfactory.co>`), replies to info@ipfactory.co.
- Sent: business check summary (owner) and notice (office); payment details; payment confirmed; report form link;
  report delivered with the PDF; client account invitation; staff and seat invitations (`/join`) and password reset;
  "Engagement update" when Session notes or a Deliverable are shared (the title and a link only, to the people who can see it).
- Delivery uses Resend. Until the `ipfactory.co` sending domain is verified, Resend refuses most outside addresses;
  every failure is recorded and the office notice says so.
- **Status: Built.** Domain verification is an operational task (DG).

## 5. Rules that apply everywhere

1. **Client isolation:** a client can never reach another client's records by changing a URL, id, token or payload.
   Authorisation is on the server; hiding a button is never a control.
2. **Deterministic where it matters:** routes, colours, gaps and the full report come from fixed rules. AI writes words
   around them and can never change them.
3. **Honest about AI:** the owner is told that analysts and AI do the analysis under a named consultant.
4. **Phone first:** every owner-facing screen works at phone width.
5. **Copy:** British English, second person, short sentences, naira in full (₦100,000).
6. **No secrets and no real personal data in the repository.**
7. **Every behaviour change ships with tests**, and `pnpm verify` passes before anything is pushed (`AGENTS.md`).

## 6. Out of scope for v0.1 (parked for v0.2 or later)

From concept note §15: subscription pricing for ongoing support; cohort pricing made cheaper by AI; a recruitment partner
pool; head-of-operations placements; the AI tool as a separate product; internal AI workflow work; the training timetable
on the site. Also not in v0.1: instalments, second-business creation, team members inside a client
business, and an in-platform message thread (see section 10).

## 7. What success looks like (the numbers the platform must report)

From concept note §13. The platform must make these countable without a spreadsheet:

| Measure | Pass mark | Where it will come from |
|---|---|---|
| Free business checks completed | 150 by 10 December | `business_checks` (available today) |
| Discovery calls held | 60 over nine weeks | Pipeline stage and Calendly booking (available today) |
| Paying clients | 20 by 10 December | `payment_requests` confirmed for the Current State Assessment (available today) |
| Fixes whose measure moved by week 6 | 70% or more | Engagement record (F8, not built) |
| Outputs still in use at day 30 | 80% or more | Engagement record (F8, not built) |
| Engagements fully logged | 100% | Engagement record (F8, not built) |
| IPF hours per fix, by problem area | Trending down | Check-in hours by role (F8, not built) |

## 8. Glossary

| Term | Meaning |
|---|---|
| Problem area | One of the ten places a business gets stuck, numbered 0 to 10 (`PROBLEM_AREAS`). Never "door" on the site |
| Gap | What is missing: clarity, know-how, resources or strategy |
| Outline | The colour-coded list of problem areas on the result: clear, watch, stuck |
| Current State Assessment | The paid two-week assessment that names the one problem to fix first |
| Fix | Up to six weeks of weekly work on one problem, ending with a plan. Never "sprint" on the site |
| Measure | The one number watched together |
| Ongoing support | Help beyond the plan, defined per client. Never "retainer"; not priced |
| Engagement record | One record per client from the check to day 30 (F8) |
| Engagement room | The client's view of their engagement (F7) |

## 9. Decisions taken while building (8 and 9 October 2026)

| Decision | Taken by |
|---|---|
| The full report is a condensed business plan: twelve parts, delivered as a PDF | ET |
| The full report is fully deterministic: no consultant or analyst reviews it; it goes out the moment the form is finished | ET |
| The report form (intake) comes after payment; no five-day turnaround | ET |
| The full report is independent of the Current State Assessment and is not credited against it | ET |
| Manual payment confirmation (details by email, proof, the team confirms) is the interim method because Paystack is not set up yet; placeholder details until real ones are set | ET |
| Built up to the start of the Current State Assessment; the engagement itself is the next phase | ET |
| The business name and one-line description are required in the check | ET |
| The twelve original sector options stay; Services examples are worded for any service firm | ET |
| Areas the check leaves out are shown greyed as "Not assessed", with "The Current State Assessment looks at all ten" | ET |
| The description is the main source for tailoring the AI summary; the sector wins when the description does not fit | ET |
| The report form asks how each product is charged, so commission and margin businesses get a true report | ET |
| The brand palette is fixed and enforced by tests; the IP Factory logo is on every email to clients | ET |
| The Current State Assessment is ₦500,000, fixed: no price grades (closes the concept note's Open 1) | ET |
| Payment details hold for 48 hours; the team sends fresh details or moves the business to Lost | ET |
| The check asks trading businesses what they have tried, what the problem costs and who decides | ET |
| The check stays rules-driven: fixed questions and scoring, with AI writing only the summary | ET |
| Younger businesses are not asked about exit (under 5 years) or owner transition (under 10 years); those areas show as "Not assessed" | ET |
| The client account invitation goes out when the Current State Assessment is paid; staff can still invite by hand at any time | ET |
| The paid assessment is called "Current State Assessment" everywhere: site, emails, admin, the report and these documents | ET |
| The engagement room follows five principles: the fix is one problem with one measure; show only what the team will keep current; notes and findings are for the owner by default; bookings on Calendly, conversation on WhatsApp, internal tasks in ClickUp; one free staff seat, no paid seats in the pilot | ET ("proceed", 9 October) |
| Data requests and actions sit in one list; the client marks what they sent, the team marks it received or asks for more | Built as recommended |
| New staff join by invitation with one role and set their own password; Super Admin is never granted by invitation; an existing account is never merged | Built as recommended |

## 10. Open decisions

| # | Decision | Recommendation | Owner |
|---|---|---|---|
| O1 | **Transcripts in the engagement room.** Notes reach the owner the same day (decided, §7). Should the full transcript also be visible? | Reviewed notes by default; the transcript on request. **Built that way (9 October); say if transcripts should show** | ET |
| O3 | **Who releases what to the client.** | Analysts share notes and data requests; the desk lead approves every prescription and plan. **Built that way and enforced on the server (9 October)** | ET, Lewis |
| O5 | Paystack go-live: who opens the business account, and by when | Open it now; the build starts the day the test keys are in Vercel (implementation plan §4) | ET, Lewis |
| O6 | Ongoing support: content and price after the first fix | Define per client at fix close (D3) | ET |
| O7 | Who signs client terms (IPF, KIP or the venture) and the P&L owner | — | ET |
| O8 | File storage for the engagement room (concept note uses one Google Drive folder per client) | A private Supabase Storage bucket, so files sit behind the same access rules as the record. **Proceeding (ET, 9 October); needs the bucket and its keys in Vercel** | Lewis, Richard |

O4 (one Current State Assessment price or two grades) was decided on 9 October: ₦500,000, fixed.
O2 and O9 were decided on 9 October as recommended: conversation stays in the client's WhatsApp group, decisions and
actions are recorded in the room, and the team's internal tasks stay in ClickUp.

## 11. Where we depart from the concept note

The concept note v0.8.1 stays the strategy. Where the built product differs from it, this is the record, with who
decided. "Confirmed" means a change made while building and confirmed by ET on 9 October 2026.

| Concept note v0.8.1 | What The Shift does | Status |
|---|---|---|
| Built on IP Factory's copy of Jump, on Manus (D5, D7, D8) | Vercel, Supabase and GitHub; Manus remains only for the AI summary and old file storage | Decided |
| Product name "Operating Partner [working name]" | "The Shift, by IP Factory" | Decided (Lewis, 7 October) |
| Hero: "You know what your business needs…" | Headline "Find it. Fix it. See the results." | Decided |
| A Paystack link after the call | Bank transfer with manual confirmation until Paystack is set up; Paystack remains the agreed method | Interim |
| Full report "by email", from the check | Paid, then a 17-question form; a deterministic PDF sent the moment it is finished | Decided (ET, 8 October) |
| Discovery calls booked in two blocks a week on the platform | Calendly, embedded on the result | Decided |
| Client area = the Jump portal (uploads, feedback, files) | Invitation-only client accounts; the engagement room is next. The Jump portal is legacy, so uploads wait for phase 3 | Decided |
| Call outcome: fit, refer, decline | Pipeline stages: Lead, Qualified lead, Call booked, Opportunity, Won, Lost, Nurture, Referred | Decided |
| Current State "from ₦500,000", grades to set (Open 1) | ₦500,000, fixed | Decided (ET, 9 October) |
| The step is called "Current State" | "Current State Assessment" everywhere | Decided (ET, 9 October) |
| An AI trained on ET's logic asks the next question (D8, D11) | A fixed decision tree with fixed scoring; AI writes only the summary, checked against the catalogue | Confirmed |
| Owners trading 2 to 10 years are asked every area | Exit and value from 5 years, owner transition from 10 years; skipped areas show as "Not assessed" | Confirmed |
| The problem block: in their words, tried, costing, who decides, hours, how they heard, referral code | All asked, except a referral code (referrals are not built in the new flow yet) | Built (9 October) |
| Payment link with a 48-hour window | Payment details hold for 48 hours | Built (9 October) |
| Lovelyn changes prices and copy without a developer | Prices and copy live in the code, so a change needs a developer; a settings screen is planned | Planned (phase 5) |
| Crossing problems show as two colours on the outline | One colour per area and one main gap | Planned (phase 5) |
| One Google Drive folder per client | A private Supabase Storage bucket | Proposed (O8) |
| One place for actions: ClickUp | Client-facing actions in the engagement room; internal tasks in ClickUp | Proposed (O9) |
| Richard's locked flow: Fit → onboarding invitation | Fit → Current State Assessment payment → invitation (the concept note's pay-then-set-up order); a manual invitation is still possible at Fit | Confirmed; `Instruction.md` to be updated by Richard |

