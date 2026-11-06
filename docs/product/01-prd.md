# 1. Product requirements (PRD)

**Product:** The Shift, by IP Factory (`BRAND.productEndorsement` in `shared/brand.ts`)
**Promise:** Find it. Fix it. See the shift.
**Status:** live at https://www.ipfactory.co with paying clients. Rewritten from scratch on 6 November 2026 (ET); the
history of how we got here is in the [decision log](08-decision-log.md).
**Sources:** *Business Support Concept Note and Launch Blueprint v0.8.1* (6 October 2026), "the concept note"; the *IPF
The Shift Operational Business Plan* (22 October 2026), "the operational plan"; ET's decisions since.

This document says what the product must do, for whom, and how we know it works. It states what is true now and what
is required next; it is not a history. How it is built is in [2. Technical requirements](02-technical-requirements.md);
what happens on each click is in [3. App flow](03-app-flow.md); who sees what is in [5. Backend schema](05-backend-schema.md).

---

## 1. The problem

Owner-run Nigerian businesses that already trade know roughly what is wrong and cannot get it fixed (concept note §2–3).
Four things stand in the way, and the product answers each:

| What stands in the way | What it looks like in Nigeria | What The Shift does |
|---|---|---|
| **No clear diagnosis** | The owner is busy every day and cannot say which problem costs the most | A free Business Health Check names the problem area and the gap, in the owner's words |
| **Help that does not fit** | Consultants priced and staffed for corporates; generic courses; advice that ends at a report | Fixed-price products sized for the business, delivered by a named expert, ending in work that is used |
| **Records that are not ready** | Sales in a notebook, POS slips, bank-app PDFs, money through a personal account, esusu and ajo | We ask only for what such a business has, in forms it can send: photos, voice notes, WhatsApp exports |
| **No one checking the work** | Plans that are never carried out | One agreed number, watched every week until it moves |

**The direction (ET, 6 November 2026).** The Shift is a **service business today and a self-serve platform over time**.
Clients keep their access throughout. Each release moves routine work from people to the platform, so the team spends
its time on judgement: the diagnosis, the price, the approval. This is the test every requirement below is held to.

## 2. Product principles

1. **The platform does the routine work; people make the judgements.** Anything that follows from a choice already
   made (the type of engagement, the service bought, a date, a priority) happens without a click. A person decides the
   diagnosis, the price, and what reaches the client.
2. **Nothing reaches a client until a named person releases it.** Every prescription and plan is approved by a lead.
3. **Deterministic where it matters.** Routes, scores, colours and the Full Report come from fixed rules; AI writes
   words around them and never changes them. We tell owners that analysts and AI do the analysis under a named expert.
4. **One client, one place.** Every project, file, fee and decision for a business is in its room.
5. **Built for how Nigerian owners work.** Phone first, low data, WhatsApp for conversation, naira in full, day-first
   dates, plain English, records accepted as they are.
6. **Each person sees what their job needs, and no more.** Enforced on the server by named permissions, never by
   hiding a button.

## 3. Users and their jobs

One person has one identity; levels, roles and project assignments are added to it.

### The public

| User | Their job | Status |
|---|---|---|
| **Website visitor** | Find out quickly whether IP Factory can fix their problem, and trust that it can | Built: problem-led home, Services, Experience, Contact ("Talk to an expert"), five guides, search-optimised titles |
| **Business Health Check taker** | Learn what is holding the business back, free, in about 15 minutes | Built |
| **Enquirer** | Reach an expert without committing to anything | Built (Contact) |

### IP Factory

| User (level) | Their job | Sees |
|---|---|---|
| **Super Admin** | Run the platform: people, levels, settings | Everything |
| **Partner, Vice President, Senior Associate** | Win and lead engagements: open them, staff them, price them, approve the work | Every engagement, and Finance |
| **Associate** | Deliver and, when leading an engagement, approve it | The engagements they are on |
| **Senior Business Analyst, Business Analyst** | Prepare and deliver the work, keep the room current | The engagements they are on |
| **Specialist** | Contribute expert work to one engagement for a set period | Their engagements until an end date; adds team items and drafts the lead shares; never internal notes or fees |
| **Finance** | Know what is owed and paid, without the diagnostic detail | Payments and fees only |

On each engagement a person also has a **project role** the client sees: Engagement Manager, Lead Consultant, Analyst,
Partner or Specialist.

### The client

| User | Their job | Sees |
|---|---|---|
| **Business owner** | Know where the work stands, what is needed from them, what was agreed and what they have received; approve; buy the next fix | Everything the team shares |
| **Owner's staff, full access** | Help run the engagement | What the owner shares with their team |
| **Owner's staff, contributor** | Send the records assigned to them (a bookkeeper, a manager) | Only their own Data Requests and actions |

### System actors

The AI summary, the Full Report builder, Paystack (confirming payments) and Calendly (bookings): server-controlled,
audited, never an interactive account.

### Later (not in this release)

Programme sponsors (a bank or funder following a group of businesses, never their private data), referral partners,
and lenders or investors reading a business's results with the owner's consent.

## 4. The journey

The spine of the product. Every requirement in section 6 belongs to one stage.

| # | Stage | The client | IP Factory | The platform does |
|---|---|---|---|---|
| 1 | **Find** | Searches Google or hears of us; reads a page or a guide | — | Ranks the pages; routes every page to the check or a call |
| 2 | **Diagnose** | Takes the free Business Health Check | Reads the lead | Scores and routes by rule; emails the summary; suggests the first product |
| 3 | **Talk** | Books the 20-minute Discovery Call | Holds the call; records the outcome | Books through Calendly; moves the pipeline stage |
| 4 | **Agree** | Agrees on the Discovery Call, or by paying, under the Terms and Conditions | Opens the engagement | Loads the Data Request, Work Plan, Sessions and fee schedule for the type, without a click |
| 5 | **Pay** | Pays each fee online, from the email or the room | Records payments not made online | Paystack for the Full Report, the Business Review and every engagement fee; marks each paid and sends the receipt |
| 6 | **Onboard** | Accepts the account invitation; sends records | Staffs the engagement | Invites the owner; dates each request by priority |
| 7 | **Deliver** | Uploads, comments, approves reels and Deliverables | Does the work; Specialists hand in drafts; the lead approves and shares | Keeps files private; tells the owner when something is shared |
| 8 | **Measure** | Sees the one number each week | Records the weekly check-in | Shows where the number started, where it is and where it is going |
| 9 | **Close and next** | Signs off; asks to fix the next problem | Closes; proposes the next product | Opens the next project in the same room |

## 5. Products and how each is bought

Every product, its price, delivery, payment terms, intake and next product live in `shared/products.ts`; the site and
the order flow read from it. The prices the payment code charges are in `shared/businessSupport.ts` (`PRICES`):
the Full Report ₦100,000, the Business Review ₦600,000, the Six-Week Fix ₦1,500,000. A test keeps this table, the
catalogue and the code in step.

**Ways to buy:** Assessment (free, or paid before work); Done for You (a fixed price, paid before work); Six-Week Fix
(50% at the start, 25% at the mid-point, 25% at the result, or in full at 5% off); Monthly Service (paid a quarter at a
time, the price held for twelve months, stop at any quarter end). **Online ordering is off** (`ONLINE_ORDERS_OPEN`):
until it opens, every paid product starts with a call or the check.

| Product | Way to buy | Price | Delivery |
|---|---|---|---|
| Free Business Health Check | Assessment | Free | At once |
| Full Report | Assessment | ₦100,000 | When the Report Intake is finished |
| Funding Readiness Assessment | Assessment | ₦150,000 | Three working days from complete records |
| Business Review | Assessment | ₦600,000 | Two weeks, two Sessions |
| Strategy and 90-Day Plan | Done for You | ₦450,000 | Seven working days |
| Business Model | Done for You | ₦300,000 | Seven working days |
| Financial Model | Done for You | ₦350,000 | Seven working days |
| Business Plan | Done for You | ₦750,000 | Fifteen working days |
| Pitch Deck | Done for You | ₦300,000 | Seven working days |
| Pricing and Unit Cost Review | Done for You | ₦400,000 | Seven working days |
| Bookkeeping Catch-Up | Done for You | ₦100,000 a month of records | Five working days for three months |
| 13-Week Cash Flow Forecast | Done for You | ₦300,000 | Five working days |
| Funding Application Pack | Done for You | ₦900,000 | Ten working days |
| Hiring Toolkit | Done for You | ₦300,000 | Five working days |
| Six-Week Fix (Margin, Sales, Cash and Pricing, Delegation and Structure) | Six-Week Fix | ₦1,500,000 | Six weeks |
| Monthly Accounts and Cash Report | Monthly Service | ₦600,000 a quarter | By the 10th of each month |
| Monthly Adviser Review | Monthly Service | ₦450,000 a quarter | One Session a month |
| **Digital marketing** (ET, 6 November 2026; the structure of the first client's engagement) | Monthly service fee, for 90 days, with milestones and a quarter review | ₦470,000 a month, each month paid before it starts, the first at signing | 15 reels, 5 posts and 20 stories a month; nothing published without the owner's approval |

**Delivery promise:** we confirm the delivery date once the records are complete; if we cannot deliver as agreed, we make
it right in line with the Terms (a refund, a service credit or an agreed alternative). The site never promises an
automatic refund. Management accounts only; the monthly tax note states record readiness, not tax advice.

## 6. Requirements by stage

**Priority:** **M** must (the product fails without it), **S** should (this release), **C** could (when there is room).
**Status:** Built, Partly built, To build.

### Stage 1–2: Find and Diagnose

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R1 | A problem-led public site, in Nigerian plain English, with the free check one tap from every page | M | Every page leads to the check or a call; works at phone width | Built |
| R2 | Pages and guides found on Google for the problems owners search | S | Titles and descriptions per page; sitemap submitted; guides indexed | Built; indexing being checked |
| R3 | The Business Health Check: a decision tree of at most about 30 questions, saved on the device and the server | M | A returning owner resumes; scoring and routes never changed by AI | Built |
| R4 | The result: the problem areas by colour, the gap, the first product and the next one, the call booking | M | Same answers, same result | Built |
| R5 | The Full Report: paid, then a short intake, then a fixed-rule PDF the moment it is finished | M | Same answers, same report, word for word | Built |

### Stage 3–4: Talk and Agree

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R6 | Book the Discovery Call from the result; record the outcome on the pipeline | M | A booking counts only when Calendly confirms | Built |
| R7 | Open an engagement of any type for a new or existing client; many projects per client | M | The type's Data Request, Work Plan and Sessions load without a click | Built |
| R8 | No proposals or agreements to sign (ET, 6 November 2026): a client agrees on the call or by paying, under the Terms and Conditions; each engagement keeps a fee schedule filled in from the service's price or the type's monthly fee | M | Nothing for the client to sign; the fees are set when the engagement opens | Built |
| R9 | The legal entity that contracts with clients named in the Terms and Conditions and on invoices and receipts | M | One entity, stated once | To build (decision D1) |

### Stage 5–6: Pay and Onboard

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R10 | Paystack for the Full Report and the Business Review; the payment confirms itself | M | The amount comes from the server, never the browser | Built; live keys to confirm (dependency) |
| R11 | Every engagement fee payable online, with its own Paystack link (emailed by the team, or **Pay** in the room's Payments tab); the first payment opens the room, as the Business Review's does | S | A fee is marked paid without the team touching it; the client gets a receipt | Built (6 November 2026, migration 0020) |
| R12 | Instalments: each later fee (a Six-Week Fix stage, a Digital marketing month, a Monthly Service quarter) emailed to the client with its pay link a few days before it is due, without the team sending it | S | No fee reaches its date without its link having gone out | Partly built: every fee has a pay link; sending it on a schedule is to build |
| R35 | Digital marketing on the public menu, with its own page (ET: yes, 6 November 2026) | S | Shown under the need it answers; previewed before it goes live | To build (next) |
| R13 | Online ordering for the Done for You products that start without a call | C | Order, pay, then the intake, with no call | To build (`ONLINE_ORDERS_OPEN`) |
| R14 | Invitation-only client accounts; the owner adds staff as full access or contributor | M | A client can never reach another business by changing an id | Built |
| R15 | Data Requests dated by priority, loaded from the type or a template, or pasted from Excel | M | Each request shows why we ask and what format is fine | Built |
| R16 | Reminders: the owner (and the assigned staff member) is reminded of a request before and after its due date | S | No request passes its date without a reminder | To build |

### Stage 7–8: Deliver and Measure

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R17 | The room: where we are, what we need, what we agreed, what you have received, for each project | M | The owner never asks "where are we?" | Built |
| R18 | Private files: uploads against a request or into a drop box, matched by the team | M | Files open only through short-lived links after the server checks who is asking | Built |
| R19 | Content approval for Digital marketing: reels, posts and stories approved or sent back by the owner | M | Nothing is published without the owner's yes | Built |
| R20 | Session notes shared the same day; internal notes never reach the client or a Specialist | M | Server-enforced | Built |
| R21 | Specialists hand in team items and drafts; the lead shares them | M | A Specialist's file reaches no client until the lead shares it | Built |
| R22 | Deliverables approved by a lead before the client sees them; the owner signs off | M | Server-enforced | Built |
| R23 | The one number and the weekly check-in (five questions, the reading, hours by role, AI used) | M | Recorded one week at a time, in order | Built |
| R24 | A new Digital marketing engagement's fees fill in at ₦470,000 for each of three months, each payable before it begins | M | The team only checks the dates | Built |
| R25 | Preview as client: staff see the room exactly as the owner does, read only, logged | S | The preview equals the owner's view | Built |

### Stage 9: Close and next

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R26 | Close an engagement: final value, whether the number moved, the plan delivered, the next problem | M | The pass marks in section 7 come from the record | To build |
| R27 | The day-30 check: are the outputs still in use | S | Recorded on the engagement | To build |
| R28 | Fix the next problem: the owner asks from the room; the team opens the next project in the same room | M | One business, many projects, one history | Built |

### Across the journey

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R29 | The admin in five tabs with no overlap: Pipeline, Engagements, Clients, Finance, Team | M | Each task has one home | Built |
| R30 | Finance: what is owed and paid across every client, for Finance and the senior levels | M | A fee counts as owed once it is set, and late once its date passes unpaid | Built |
| R31 | Team: invite by level; Specialists with an end date; two-step sign-in for everyone internal | M | A role is given only by someone ranked above it | Built |
| R32 | Emails branded, from the verified domain, recorded when they fail | M | Every failure is visible to the office | Built; domain verification to confirm (dependency) |
| R33 | Prices and copy changed without a developer | C | A settings screen | To build |
| R34 | The measures in section 7 on one page, without a spreadsheet | S | Each measure computed from its source | To build |

## 7. Measures

**The one number:** **paying clients whose agreed measure moved.** It joins what we sell to what we deliver, and both
halves are already recorded (confirmed payments and paid fees; the measure and its weekly readings).

| Measure | Target | Source |
|---|---|---|
| Free checks completed | 150 by 10 December 2026 (pilot) | `business_checks` |
| Check → Discovery Call booked | Trending up | Pipeline stage, Calendly |
| Call → first payment | 1 in 3 | Payments and `engagement_fee_lines` |
| Paying clients | 20 by 10 December 2026 (pilot) | Confirmed payments and paid fees |
| Days from the first payment to the first records in | 3 or fewer | Fees and files |
| Data Requests in by their date | 80% or more | `engagement_tasks` |
| Days from a Deliverable shared to the owner's sign-off | 5 or fewer | `engagement_deliverables` |
| Fixes whose number moved by week 6 | 70% or more | The measure and check-ins |
| Outputs still in use at day 30 | 80% or more | The close (R27) |
| Clients who buy the next fix within 90 days | 30% or more | Projects per business |
| IP Factory hours per engagement, by type | Falling, release on release | Check-in hours by role |

The last measure is the self-serve direction made countable: each release should cut the hours the team spends per
engagement without hurting the results above it.

## 8. Rules that apply everywhere

1. **Client isolation:** a client never reaches another client's records by changing a URL, id, token or payload.
2. **Authorisation on the server**, by named permissions (`shared/platformPermissions.ts`), never by role names in screens.
3. **Personal data** handled under the Nigeria Data Protection Act 2023: collected for a stated purpose, private by
   default, never in the repository.
4. **Phone first:** every owner-facing screen works at phone width on a slow connection.
5. **Copy:** British English, Nigerian plain English, second person, short sentences, naira in full (₦100,000),
   "expert" over "person", the problem stated before the fix.
6. **Every change ships with tests and updated product documents**, and `pnpm verify` passes before any push (`AGENTS.md`).

## 9. Assumptions, risks and dependencies

| # | Item | Type | Owner | Status |
|---|---|---|---|---|
| A1 | Owners will send records as photos, voice notes and bank-app PDFs if we ask plainly | Assumption | Desk | Holding so far |
| A2 | Business owners will pay online without a meeting once the call has set the work | Assumption | ET | To test with the first Digital marketing client |
| K1 | Paystack live keys and the live webhook in Vercel | Dependency | ET, Lewis | To confirm |
| K2 | The sending domain verified in Resend, so emails reach outside inboxes | Dependency | DG, Lewis | To confirm |
| K3 | Supabase on a paid plan with daily backups | Dependency | ET | To do |
| K4 | The old Supabase project secured | Risk | ET | To do |
| K5 | Counsel's view of the Terms and the signing entity (D1) | Dependency | ET | Open |
| K6 | The desk depends on a few people; levels and assignments must be kept current | Risk | Partners | Ongoing |
| K7 | A second owner on Google Search Console | Risk | ET | To do |

## 10. Not in this release

A self-serve portal with no expert involved (the direction, not this release); programme sponsors, referral partners
and lender access; an in-platform message thread (conversation stays on WhatsApp); paid client seats; training as a
product; the AI tool as a separate product.

## 11. Open decisions

| # | Decision | Recommendation | Owner |
|---|---|---|---|
| D1 | Which legal entity contracts with clients, and who owns the P&L | Name the entity once, in the Terms and on invoices | ET |
| D2 | Full Session transcripts in the room | Reviewed notes by default; the transcript on request (as built) | ET |
| D3 | Ongoing support after a fix: content and price | Offer a Monthly Service at close | ET |

## 12. Glossary

| Term | Meaning |
|---|---|
| Problem area | One of the ten places a business gets stuck (`PROBLEM_AREAS`) |
| Gap | What is missing: clarity, know-how, resources or strategy |
| Engagement | One project for one business, of one type |
| Room | The client's view of all their engagements |
| Data Request | A record we ask the client for, with why we ask, the format that is fine and a date |
| Work Plan | Every request, action and Session, by week |
| Deliverable | Finished work shared with the client: findings, the problem statement, the prescription, tools, the plan |
| Measure | The one number watched together each week |
| Fees | An engagement's fee schedule: each fee, its amount, its due date and whether it is paid. Set when the engagement opens; Finance reads it |
| Fix | Up to six weeks of weekly work on one problem. Never "sprint" |
