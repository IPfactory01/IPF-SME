# 1. Product requirements (PRD)

**Product:** The Shift, by IP Factory (`BRAND.productEndorsement` in `shared/brand.ts`)
**Promise:** Find it. Fix it. See the shift.
**Status:** live at https://www.ipfactory.co with paying clients. Rewritten from scratch on 6 November 2026 (ET), and
reviewed on 8 November 2026 through five lenses (the business, the client, search, product management and engineering);
the history of how we got here is in the [decision log](08-decision-log.md).
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

**How The Shift makes money (8 November 2026).** Two engines share one platform:

| Engine | Products | How it sells | What the platform must do |
|---|---|---|---|
| **Fixed-price products** | The Full Report, the Funding Readiness Assessment and the Done for You products a client can scope alone (`buy: "self"` in `shared/products.ts`) | Found through search and the free check, bought online at a stated price | Let a visitor buy without waiting for us, then start the work at once |
| **Relationships** | The Business Review, the Six-Week Fix, the Monthly Services (Digital Marketing among them) and the larger Done for You products (`buy: "after_call"`) | A Discovery Call, then an engagement the lead sets up | Make setting up, collecting and delivering cost the team as little time as possible |

Four numbers decide whether either engine works: the **cost of winning a client** (kept low by search and the free
check), **conversion** (check or page to paid), **cash collected on time**, and **delivery hours per engagement**
(the margin). Clients buying the next fix (lifetime value) joins the two engines: a fixed-price buyer becomes a
relationship client, and a relationship client buys fixed-price work along the way.
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
7. **Trust where money changes hands.** Nigerian business owners buy from people and are wary of paying online. Every
   page that takes money names the expert behind the work, shows the office address and a WhatsApp line to a person,
   says what happens after paying, and sends a receipt at once.
8. **What we sell, we can count.** Every step from a search to a payment is measured, so each page, product and
   release can be judged by what it earns, not by opinion.

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
| 1 | **Find** | Searches Google, sees a recommendation or hears of us; reads a guide or a product page | — | Ranks the pages with their prices; every page ends in one of two front doors: **Buy now** (fixed-price products) or **Talk to an expert** (a call, or WhatsApp) |
| 2 | **Diagnose** | Takes the free Business Health Check | Reads the lead | Scores and routes by rule; emails the summary; suggests the first product |
| 3 | **Talk** | Books the 20-minute Discovery Call | Holds the call; records the outcome | Books through Calendly; moves the pipeline stage |
| 4 | **Agree** | Buys online, or agrees the work on the call, under the Terms and Conditions | For a relationship: opens the engagement; its payment terms follow what was bought (R36) | For a purchase: opens the engagement itself. For both: loads the Data Request, Work Plan, Sessions and fee schedule for the type, dated from the start |
| 5 | **Pay** | Pays each fee online, from the reminder email or the room | Records only money that came another way | One payment model for everything (order, engagement, fees, payments); sends each fee's link before it is due and reminds when it is late; marks it paid and sends the receipt |
| 6 | **Onboard** | Opens the room from the invitation or a sign-in link; books the kickoff; sends the first records | Staffs the engagement | Invites the owner when the engagement opens; opens the room by the payment terms; shows what happens next within minutes of paying; dates each request and reminds before and after its date |
| 7 | **Deliver** | Uploads, comments, approves reels and Deliverables | Does the work; Specialists hand in drafts; the lead approves and shares | Keeps files private; tells the owner when something is shared |
| 8 | **Measure** | Sees the one number each week | Records the weekly check-in | Shows where the number started, where it is and where it is going |
| 9 | **Close and next** | Signs off; at Day 30 says what is still in use; buys the next fix in the room | Closes with the result; proposes the next product | Records whether the number moved; books the Day-30 Review; offers the next fix with its price, to buy online or to talk about |

## 5. Products and how each is bought

Every product, its price, delivery, payment terms, intake and next product live in `shared/products.ts`; the site and
the order flow read from it. The prices the payment code charges are in `shared/businessSupport.ts` (`PRICES`):
the Full Report ₦100,000, the Business Review ₦600,000, the Six-Week Fix ₦1,500,000. A test keeps this table, the
catalogue and the code in step.

**Ways to buy (R36):** Assessment (free, or paid before work; the Business Review half to start and half on its
Findings); Done for You (a fixed price: paid before work when bought online, half to start and half on delivery when
agreed on a call); Six-Week Fix (half at the start and half at the result, or in full at 5% off); Monthly Service (paid a
quarter at a time, the price held for twelve months, stop at any quarter end; Digital Marketing month by month, each
month before it starts).

**Two front doors (8 November 2026).** A product marked **Buy now** can be bought online, then the work starts with no
call; a product marked **Talk to an expert** starts with a Discovery Call. Every page offers WhatsApp as well, because
some buyers will only pay after speaking to someone. **Online ordering is off today** (`ONLINE_ORDERS_OPEN`), so every
paid product starts with a call or the check until R13 is built.

**Payment terms (ET, 10 November 2026; R36).** Terms follow what is bought, so no engagement chooses its own and there
is no payment in arrears (D4):

| What is bought | When each fee falls due |
|---|---|
| A product bought online | In full, before we start |
| A service agreed on a call (the Business Review, the Business Plan, the Pricing and Unit Cost Review, the Funding Application Pack, the Six-Week Fix) | Half on the start date; the second half seven days after its main output is shared |
| Digital Marketing | Each month before it starts: day 0, 30 and 60 from the kickoff |
| A Monthly Service | A quarter at a time, before the quarter starts |

The room opens on the first payment. Work pauses seven days after a missed date (decision D6; section 22 of the Terms
allows IP Factory to suspend for unresolved payment issues).

| Product | Way to buy | Price | Delivery | Front door |
|---|---|---|---|---|
| Free Business Health Check | Assessment | Free | At once | Free check |
| Full Report | Assessment | ₦100,000 | When the Report Intake is finished | Buy now (from the check) |
| Funding Readiness Assessment | Assessment | ₦150,000 | Three working days from complete records | Buy now |
| Business Review | Assessment | ₦600,000 | Two weeks, two Sessions | Talk to an expert |
| Strategy and 90-Day Plan | Done for You | ₦450,000 | Seven working days | Buy now |
| Business Model | Done for You | ₦300,000 | Seven working days | Buy now |
| Financial Model | Done for You | ₦350,000 | Seven working days | Buy now |
| Business Plan | Done for You | ₦750,000 | Fifteen working days | Talk to an expert |
| Pitch Deck | Done for You | ₦300,000 | Seven working days | Buy now |
| Pricing and Unit Cost Review | Done for You | ₦400,000 | Seven working days | Talk to an expert |
| Bookkeeping Catch-Up | Done for You | ₦100,000 a month of records | Five working days for three months | Buy now |
| 13-Week Cash Flow Forecast | Done for You | ₦300,000 | Five working days | Buy now |
| Funding Application Pack | Done for You | ₦900,000 | Ten working days | Talk to an expert |
| Hiring Toolkit | Done for You | ₦300,000 | Five working days | Buy now |
| Six-Week Fix (Margin, Sales, Cash and Pricing, Delegation and Structure) | Six-Week Fix | ₦1,500,000 | Six weeks | Talk to an expert |
| Monthly Accounts and Cash Report | Monthly Service | ₦600,000 a quarter | By the 10th of each month | Talk to an expert |
| Monthly Adviser Review | Monthly Service | ₦450,000 a quarter | One Session a month | Talk to an expert |
| Digital Marketing (ET, 6 November 2026; the programme of the first client's engagement) | Monthly Service | ₦470,000 a month | 15 reels, 5 posts and 20 stories a month for three months, across Instagram, TikTok, Facebook and the Google Business Profile; nothing published without the owner's approval | Talk to an expert |

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
| R40 | Search: product and service pages marked up for Google with their price in naira and their questions (Product, Offer and FAQ structured data), the business marked up as a local business in Lekki with its hours, a Google Business Profile with reviews, and a page for every product including Digital marketing | S | Each product page passes Google's Rich Results Test; the business shows in local results for its services | To build |
| R39 | Tracking: every step from a search or a referral to a page, the check, a call booked and a payment recorded as an event, with the page and product it came from, and consent asked before any tracking cookie | S | Every measure in section 7 can be counted, by page and by product | To build (decision D5) |
| R2 | Pages and guides found on Google for the problems owners search | S | Titles and descriptions per page; sitemap submitted; guides indexed | Built; indexing being checked |
| R3 | The Business Health Check: a decision tree of at most about 30 questions, saved on the device and the server | M | A returning owner resumes; scoring and routes never changed by AI | Built |
| R4 | The result: the problem areas by colour, the gap, the first product and the next one, the call booking | M | Same answers, same result | Built |
| R5 | The Full Report: paid, then a short intake, then a fixed-rule PDF the moment it is finished | M | Same answers, same report, word for word | Built |

### Stage 3–4: Talk and Agree

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R6 | Book the Discovery Call from the result; record the outcome on the pipeline | M | A booking counts only when Calendly confirms | Built |
| R7 | Open an engagement of any type for a new or existing client; many projects per client | M | The type's Data Request, Work Plan and Sessions load without a click | Built |
| R36 | Payment terms follow what is bought (ET, 10 November 2026), so none is negotiated per engagement: a product bought online is paid before we start; a **service** agreed on a call (the Business Review, the Business Plan, the Pricing and Unit Cost Review, the Funding Application Pack, the Six-Week Fix) is paid **half to start and half on delivery**; Digital marketing is paid monthly; a Monthly Service a quarter at a time. The first part falls due at the start; the second half seven days after the main output is shared in the room (the Findings of a Business Review, the result of a Six-Week Fix, the finished work of a Done for You service), when the owner is emailed its pay link. Work pauses seven days after a missed date (D6, R51) | M | No terms negotiated one by one; a new client sees only the first part until it is paid; every fee has its date once its moment has come | To build (next) |
| R8 | No proposals or agreements to sign (ET, 6 November 2026): a client agrees on the call or by paying, under the Terms and Conditions; each engagement keeps a fee schedule filled in from the service's price or the type's monthly fee | M | Nothing for the client to sign; the fees are set when the engagement opens | Built |
| R9 | The legal entity that contracts with clients named in the Terms and Conditions and on invoices and receipts | M | One entity, stated once | To build (decision D1) |

### Stage 5–6: Pay and Onboard

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R10 | Paystack for the Full Report and the Business Review; the payment confirms itself | M | The amount comes from the server, never the browser | Built; live keys to confirm (dependency) |
| R37 | One payment model for everything: an order or engagement holds fees, and each Paystack transaction is a payment against a fee (attempts, failures, part payments and refunds recorded); the Business Review moves onto it; old payment requests stay as history | M | Finance reads one source; every naira paid traces to one fee and one Paystack reference | To build |
| R42 | Alerts: a Paystack notification or an email that fails, or a payment that needs a look, reaches the office the same day | S | No failure lives only in a log | Partly built (payments that need a look are emailed) |
| R11 | Every engagement fee payable online, with its own Paystack link (emailed by the team, or **Pay** in the room's Payments tab); for an engagement in advance, the first payment opens the room | S | A fee is marked paid without the team touching it; the client gets a receipt | Built (6 November 2026, migration 0020); the in-arrears case comes with R36 |
| R12 | Fee reminders: each fee's pay link emailed five days before its date, on the day, and three and seven days after if unpaid; the lead told at seven days; WhatsApp later (R41) | M | No fee reaches its date without its link having gone out, and nobody on the team chases a fee by hand | Partly built: every fee has a pay link; sending on a schedule is to build |
| R35 | Digital Marketing on the public menu, with its own page (ET: yes, 6 November 2026) | S | Shown under the need it answers; previewed before it goes live | Built (10 November 2026): `/services/digital-marketing`, a Monthly Service under Sales and marketing, paid month by month |
| R13 | **Buy now** for the products marked so in section 5: the product page takes the buyer's name, business, email and WhatsApp, opens Paystack, and on payment opens the engagement, invites the owner and shows what happens next (the room, the first records, a kickoff to book), with no call | S | A visitor buys and receives the first Data Request without anyone on the team acting; the product's intake follows at once; incomplete records stop the delivery clock, and the room counts down to the promised date once they are complete | To build (`ONLINE_ORDERS_OPEN`) |
| R38 | Trust where money changes hands: every product page and pay page names the expert behind the work, shows the office address and a WhatsApp line to a person, says what happens after paying, and links the Terms; a receipt follows every payment | M | No page that takes money lacks a person to talk to | Partly built (receipts, Terms links); pay pages with R72 (Release 0), product pages with R13 |
| R14 | Invitation-only client accounts, the invitation sent when the engagement opens; the owner adds staff as full access or contributor | M | A client can never reach another business by changing an id | Built |
| R41 | Client sign-in by a link sent to their email (and WhatsApp later), so a client never needs a password; staff keep a password and the two-step code | S | A client opens their room from a link in under a minute | To build |
| R15 | Data Requests dated by priority, loaded from the type or a template, or pasted from Excel | M | Each request shows why we ask and what format is fine | Built |
| R16 | Data Request reminders: the owner (and the staff member it is assigned to) reminded two days before an item's date and two days after it if still open; the lead told only what is outstanding after the reminders | M | No request passes its date without a reminder | To build |

### From the product design review (9 November 2026)

The flows were critiqued as a product designer would (the moments that matter, the handoffs, the unhappy paths, the
channels Nigerian owners use, the phone). G1 to G16 are the gaps found; each is a requirement here.

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R43 | **Footage and voice notes (G1).** Voice notes upload like any file (m4a, mp3, ogg and opus, aac, wav; up to 25 MB). Raw video is never stored on the platform: any Data Request item or action can be answered with a link to a shared folder (Google Drive, Dropbox, WeTransfer, iCloud), which the team opens; or the client sends it on WhatsApp to the person it is for (R44) and marks it sent another way | M | A Digital marketing client sends the week's footage from the room in under two minutes, from a phone | Built (9 November 2026): voice notes, links to a shared folder, videos refused with the advice, Send on WhatsApp to {name}; the timed run on a phone is still to do |
| R44 | **WhatsApp to the right person (G2).** Every IP Factory team member has a WhatsApp number on their profile. In the room each person on the team has **Message on WhatsApp**; an item meant for one person (footage for the content producer) offers **Send on WhatsApp to {name}** with a message that names the item; every link the team sends (invitation, sign-in, pay link) has **Send on WhatsApp** beside it with the message filled in | M | No client has to look for a number; the team never retypes a link into WhatsApp | Built (9 November 2026, migration 0021): numbers with each person's agreement, the room's buttons, Send on WhatsApp beside every link the team sends; numbers to be added by each person |
| R45 | **Project roles for Digital marketing.** Two roles on an engagement: **Digital Marketer** (the plan, the numbers, the client's main contact) and **Content Producer** (footage, edits, reels), shown to the client with their WhatsApp | M | The client knows whom to send footage to and whom to ask about results | Built (migration 0021): both roles, on Digital marketing engagements only, shown with their WhatsApp; Marcelle's team to be added |
| R46 | **The first visit (G3).** The first time an owner opens a project: a welcome naming their expert or experts with a WhatsApp button, the first three things to do this week (book the kickoff, the first records, any fee), and what happens next. It stays on Overview until the kickoff is held | M | A new client sends their first records or books the kickoff without asking how | Built 9 November 2026 (Getting started; the WhatsApp buttons show once each person adds a number and agrees) |
| R47 | **What we will do (G4).** A read-only card in the room, also in the welcome email: what we will do (the service's or type's description), the team, the start date, the payment terms, and each fee with its date. Nothing to sign. A change to fees or terms is recorded and the owner is told. (Named What we will do, not Your plan, so that it is not confused with Your Plan, the method's plan handed over at the end) | M | The client and the team can point to the same written record of what was agreed | Built 9 November 2026, except the payment terms, which join it with R36 |
| R48 | **Follow-up for prospects who are not ready (G5).** A check taker who neither books nor buys receives a follow-up on day 2 and day 7: the guide for their stuck area and the first product with its front door. A call outcome of Nurture adds one at day 30. Stops on a booking, a purchase or an unsubscribe | S | Conversion from check to call or purchase rises | To build (with the reminder engine, R12) |
| R49 | **One place for each thing in the room (G6).** After a usability test with a client, the room is simplified so no task appears in two places: Home (now and next), To do (records, actions, approvals and fees due in one list), Sessions, Results (findings, Deliverables, the number), Payments | S | Each item has one home; the phone shows five places, not nine | To design (after the test, A4) |
| R50 | **Which next action wins (G7).** In this order: a fee the room waits for; approvals that hold up publishing; records past their date; records due this week; a Sign-off; otherwise nothing outstanding | S | The room shows one next action, by rule | To build |
| R51 | **When things go wrong (G8).** Work paused for a late fee: the room stays readable, uploads stay open, and a banner says what to pay to continue. Changes asked for on any Deliverable, not only content. A cancellation or refund recorded against the payment. When a team member leaves, their open items move to the lead | S | Each case has a designed screen, an email and a status | To build |
| R52 | **Today, for the team (G9).** One list across a person's projects: approvals waiting, files to match, check-ins due, records overdue, fees late | S | A lead starts the day from one list | To build |
| R53 | **Receipts and invoices as documents (G10).** A numbered PDF receipt for every payment and an invoice for every fee, in the Payments tab and by email, naming the legal entity (D1) | S | An owner can hand them to their accountant or lender | To build (after D1) |
| R54 | **Approving content on a phone (G12).** Each piece opens with its preview; several can be approved at once; changes asked for in a line | S | A month's 40 pieces can be approved in minutes from a phone | To build |
| R55 | **An upload link for one item (G14).** The owner can send a staff member (a bookkeeper) a link that answers one Data Request item, with no account | C | Records reach us from whoever holds them | To design (security review first) |
| R56 | **Weak networks (G15).** Photos compressed before upload; an interrupted upload resumes | C | An upload on mobile data succeeds or says clearly what to do | To build |
| R57 | **Quiet hours (G16).** No reminder or message between 9pm and 7am Lagos time; a client can choose email, WhatsApp or both once WhatsApp messages exist | C | Nobody is messaged at night | To build |

### From the coverage matrix (9 November 2026)

The [coverage matrix](09-coverage-matrix.md) checks every object, every stage of its life and who acts, against the code
and the App flow. It is run again at every review. It found 13 gaps, numbered C1 to C17; C1 was a documentation gap, fixed.
Since 9 November 2026 the build checks it too: `test/docs/productDocs.test.ts` fails when a server action is missing from
the matrix, a permission, project role or email from the App flow, or an audit action from the Backend schema. The first
run found two more gaps: five permissions that no action checks (C18, waiting on a decision) and the older administrator
password reset that still said JUMP (C19, fixed: every email now goes out as IP Factory); C12, the unused JUMP email
templates, was fixed by removing them.

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R58 | **Invite and add (C2).** From an engagement's team, a lead with `assign_engagements` can invite a colleague or a Specialist (with an end date) and add them to that engagement in one step; the Super Admin is told and still controls every other level | S | Staffing an engagement never waits on the Super Admin | To build |
| R59 | **Session reminders (C3).** The client and the team are reminded the day before and an hour before each Session, with the time in Lagos, the Join link and a WhatsApp button; the unused JUMP-era template is removed (C12) | S | No Session is missed for want of a reminder | To build (with the reminder engine, R12) |
| R60 | **The client hears back on the next fix (C4).** When the desk opens the engagement or declines the request, the client is told, with the reason when declined | S | No request to buy goes unanswered | To build |
| R61 | **Removing a file (C5).** A client can remove a file they sent until the team has matched it; the team can remove any file, with a reason recorded; the stored object is deleted | S | A wrong or private file can be taken back | Built (9 November 2026) |
| R62 | **A person's data on request (C6).** The Super Admin can export everything held about a person, and erase or anonymise it where no legal duty requires keeping it, under the Nigeria Data Protection Act 2023; each request is recorded | S | A request is answered within the period the Act allows | To build (counsel to confirm the periods, K5) |
| R63 | **Archiving an engagement (C7).** The desk can archive an engagement opened by mistake; it leaves every list and the client's projects, and stays in the record | C | Mistakes do not clutter the lists | To build |
| R64 | **Follow-up alerts for the desk (C8).** A finished check with no call recorded after two working days, or a booked call with no outcome the day after, is flagged to the desk | S | Every lead is acted on | To build |
| R65 | **Referrals (C9).** Marking a lead Referred sends its summary to the firm it is referred to, with the owner's consent recorded | C | A referral reaches someone | To build |
| R66 | **Who did what (C10).** The Super Admin can read the audit log, filtered by person, client, engagement and action | C | Any change can be traced to a person or to Paystack | To build |
| R67 | **A new owner (C15).** The owner can hand the business to another person, who accepts; the old owner keeps the access the new owner gives them | C | A business that changes hands keeps its history | To build |
| R68 | **Access ending (C17).** The lead and the Specialist are told seven days before a Specialist's access ends, with a way to extend it (Super Admin) | C | No one loses access mid-work without warning | To build |

### From the design brief review (9 November 2026)

The [Design brief](04-design-brief.md) was checked against the built screens on a phone and a laptop, with an automated
accessibility check (axe, WCAG 2.1 AA) and a load test on Lighthouse's mobile profile. It found twelve gaps, B1 to B12.
Five were bugs against rules already written and were fixed the same day: the room could be dragged sideways on a phone
(B1), Watch labels and faded steps were below 4.5:1 (B4), taps under 44 px (B10), italic running text on the check (B11)
and the staff sign-in heading (B12). Two were the brief itself, rewritten (B5, B6), with three decisions from ET: 8 px
corners everywhere clients see, the gradient only for the one main action on a public page, and the promise "Find it.
Fix it. See the shift." The other five are requirements.

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R69 | **Every screen says what is happening (B2).** Every screen that loads data shows its loading, empty, failed and partly-done states as the Design brief sets them (section 5): the outline of the content while it loads; what will appear and who adds it when it is empty; "We could not load this. Check your connection and try again." with **Try again** when it fails, keeping the last copy on screen; a failed read retries twice before saying so and is never shown as empty | M | On a dropped connection no screen shows an empty-state message; every read in the room, the account and pay pages and the admin console has its four states, each covered by a test | Built (9 November 2026): the room, account, sign-in, joining and pay pages and every admin tab; a signed-in person is no longer sent to sign in when a request fails |
| R70 | **A fast first view on a phone (B3).** Public pages are pre-rendered as the real page, so their content shows before the site's code runs; each public page loads only its own code (at most 170 KB compressed); nothing in the first screen waits on an animation | S | On Lighthouse's mobile profile the largest content shows within 2.5 s on Home, the check and a guide (4.3 s, 2.5 s and 2.6 s on 9 November 2026), checked at every release | Built 9 November 2026: Home 0.9 s, the check 0.8 s, a guide 0.9 s (were 4.3 s, 2.5 s, 2.5 s); 123 to 142 KB per public page, checked by every build |
| R71 | **The room on a phone (B7).** On a phone the room's header shrinks to one line (the project and its day) once the owner scrolls or leaves the Overview; the tab bar keeps the selected tab in view and fades at the edge where more tabs sit. R49 then reduces the views to five after the usability test | M | On a 390 px screen the first item of every view shows without scrolling past the header, and the selected tab is always visible | Built (9 November 2026); R49 still follows the usability test |
| R72 | **Paying with confidence (B8).** The pay-page part of R38, brought forward. Every pay page (the Full Report, the Business Review, each fee) shows before the Pay button who is paid (the legal name on the statement, decision D1), what for, the amount in full, the reference, that the receipt comes by email, and a WhatsApp button to the lead or the office (R44); the Pay button uses the gradient | S | A first-time payer can see who receives the money and whom to ask without leaving the page | Built 10 November 2026: payments are collected by Enzo Krypton & Co. through its Paystack account (ET); the office WhatsApp is the fallback |
| R73 | **One page, one search (B9).** Each public page has its own main heading for the search it answers (Home, How we work and the check no longer share "Find it. Fix it. See the shift."; it stays the home page's heading and a line elsewhere), and each guide and service has its own share card with its title for WhatsApp and LinkedIn | S | No two indexable pages share a main heading or a share card, checked by a test over the pre-rendered pages | Built 9 November 2026: How we work and the check have their own main headings; every public page has its own share card (31), both checked by tests |

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
| R24 | A new Digital marketing engagement's fees fill in at ₦470,000 for each of three months, dated day 0, 30 and 60 from the kickoff (R36) | M | The team only checks the dates | Built |
| R25 | Preview as client: staff see the room exactly as the owner does, read only, logged | S | The preview equals the owner's view | Built |

### Stage 9: Close and next

| # | Requirement | P | Acceptance | Status |
|---|---|---|---|---|
| R26 | Close an engagement: final value, whether the number moved, the plan delivered, the next problem; closing books the Day-30 Review | M | The pass marks in section 7 come from the record | To build |
| R27 | The Day-30 Review: the owner says what is still in use; the room then offers the next fix with its price | S | Recorded on the engagement; the offer follows the product suggested at close | To build |
| R28 | Fix the next problem: the owner asks from the room, or buys a Buy-now product there; the team opens the next project in the same room | M | One business, many projects, one history | Built (asking); buying in the room comes with R13 |

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
| Search sessions and where they land, by page | Trending up | Google Search Console, analytics (R39) |
| Page to free check or Buy now, by page and product | Trending up | Analytics (R39) |
| Free checks completed | 150 by 10 December 2026 (pilot) | `business_checks` |
| Check → Discovery Call booked | Trending up | Pipeline stage, Calendly |
| Call → first payment | 1 in 3 | Payments and `engagement_fee_lines` |
| Paying clients | 20 by 10 December 2026 (pilot) | Confirmed payments and paid fees |
| Days from the first payment to the first records in | 3 or fewer | Fees and files |
| Fees paid by their due date | 90% or more | Fees and payments |
| Money owed more than 7 days late | Under 10% of what is owed | Finance |
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
4. **Phone first:** every owner-facing screen works at phone width on a slow connection, within the speed budget and
   the accessibility rules of the [Design brief](04-design-brief.md) (sections 13 and 14).
5. **Copy:** British English, Nigerian plain English, second person, short sentences, naira in full (₦100,000),
   "expert" over "person", the problem stated before the fix.
6. **Every change ships with tests and updated product documents**, and `pnpm verify` passes before any push (`AGENTS.md`).
7. **Money is exact and traceable:** amounts come from the server, never the browser; every naira paid traces to a fee
   and a Paystack reference; nothing is marked paid without Paystack's confirmation or a named person.
8. **Nothing is built before it is in these documents.** A new need goes into the PRD and the App flow first, then the
   implementation plan, then the code (ET, 8 November 2026).

## 9. Assumptions, risks and dependencies

| # | Item | Type | Owner | Status |
|---|---|---|---|---|
| A1 | Owners will send records as photos, voice notes and bank-app PDFs if we ask plainly | Assumption | Desk | Holding so far |
| A2 | Business owners will pay online without a meeting once the call has set the work | Assumption | ET | To test with the first Digital marketing client |
| A3 | Visitors will buy a fixed-price product online with no call, if the page shows the price, a named expert and WhatsApp | Assumption | ET | To test once R13 and R38 are built |
| K8 | Late payment is common, and inflation erodes a price held for twelve months | Risk | Partners | No engagement is paid in arrears (D4); a second half falls due seven days after delivery and work pauses seven days after a missed date (R36, D6); only a quarterly price holds for twelve months |
| K9 | Tracking needs consent under the Nigeria Data Protection Act 2023, and a cookie notice the site does not have yet | Dependency | ET | With R39 |
| A4 | A 20-minute usability test with a live client (five tasks: send footage, approve a reel, find what is due, pay a fee, reach the expert) will show what to simplify in the room | Assumption | ET | Later (ET, 9 November 2026); R49 waits for it |
| K10 | Raw footage is large; storing it would cost more than it is worth | Risk | Engineering | Video moves by link or WhatsApp, never stored (R43) |
| K11 | WhatsApp numbers of team members shown to clients | Risk | ET | Each person agrees to their number being shown; a work number where they have one |
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
product; the AI tool as a separate product; WhatsApp messages sent by the platform (after R12, R16 and R41 work by
email).

## 10a. Release order (8 November 2026)

Ordered by what each moves first: cash, then growth, then hours, then retention. The
[implementation plan](06-implementation-plan.md) turns each into tasks with acceptance criteria.

| # | Release | Requirements | Moves |
|---|---|---|---|
| 0 | The first client's experience (the P1 gaps of the design review; the design brief review) | R43, R44, R45, R46, R47, R61, R69, R70, R71, R72, R73 | Time to first value; trust; records in on time; visitors who stay |
| 1 | Payment terms and one payment model | R36, R37, R24, R42; the pause screen of R51; the groundwork for R53 | Cash collected on time |
| 2 | Fee, Data Request and Session reminders | R12, R16, R48, R57, R59, R64; every reminder carries a WhatsApp button (R44) | Delivery hours; cash; conversion |
| 3 | Buy now and the trust layer | R13, R38 (R35, the Digital Marketing page, built early on 10 November 2026) | Conversion; cost of winning a client |
| 4 | Close, the Day-30 Review and the next fix | R26, R27, R28 | Lifetime value; the pass marks |
| 5 | The room and the team's day, after the usability test | R49, R50, R52, R54, the rest of R51 | Delivery hours; the client's experience |
| 6 | Tracking, the measures page, receipts | R39, R34, R53 | Every decision after this one; trust |
| 7 | Sign-in links and the rest | R41, R55, R56, R58, R60, R62, R63, R65 to R68 | Support time; legal duties |
| Alongside | Search | R40, R2 | Cost of winning a client |

## 11. Open decisions

| # | Decision | Recommendation | Owner |
|---|---|---|---|
| D1 | Which legal entity contracts with clients, and who owns the P&L | Name the entity once, in the Terms and on invoices. Payments are collected by Enzo Krypton & Co. through its Paystack account (ET, 10 November 2026), as the pay pages say; the Terms do not yet name who collects, so counsel adds that line with K5 | ET |
| D2 | Full Session transcripts in the room | Reviewed notes by default; the transcript on request (as built) | ET |
| D3 | Ongoing support after a fix: content and price | Offer a Monthly Service at close | ET |
| D4 | How much payment in arrears IP Factory will carry | Decided (ET, 10 November 2026): no limit, because no engagement chooses its own terms. Terms follow what is bought: a product is paid in advance; a service is paid in milestones on one standard schedule (to agree); Digital marketing is paid monthly | ET |
| D5 | The analytics tool | Google Analytics 4 linked to Search Console for the journey from search to page; payment and engagement measures from our own database | ET |
| D6 | When work pauses for a late fee | Decided (ET, 10 November 2026): seven days after the due date, with the client told at three days. The Terms allow suspension for unresolved payment issues but set no period; counsel adds the period with K5 | ET |

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
| Payment terms | When each fee falls due. They follow what is bought (R36), never set per engagement |
| Payment | One Paystack transaction (or one recorded by hand) against a fee |
| Front door | How a product starts: Buy now (online) or Talk to an expert (a call or WhatsApp) |
