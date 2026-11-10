# 3. App flow

**How The Shift works for each person who uses it, step by step.** Rebuilt on 8 November 2026 from the
[PRD](01-prd.md) review, as service blueprints: for every step, what the client does, what the platform does on its own,
what a person on the team does, the email that goes out, and the status that changes. Each step says whether it is
**Built** or **To build** (with the PRD requirement, R1 to R73). The [coverage matrix](09-coverage-matrix.md) checks this document against the code. Diagrams use Mermaid, which GitHub renders.

How to read it. Sections 1 to 4 are the design: who arrives where, the two rules that shape everything after (the
front doors and the payment terms), and the journeys. Sections 5 to 7 are the reference for building and testing: every
status, every email and every exception. Section 8 maps the pages, the admin console and the room as they are today.
`test/docs/productDocs.test.ts` fails if a route is added to `client/src/App.tsx` without appearing here.

**The rule for this document (ET, 8 November 2026):** nothing is built before it is described here and in the PRD. A
new need changes this document first.

---

## 1. Who arrives, and where

| Arrives as | Usually from | Lands on | Wants | Leaves through |
|---|---|---|---|---|
| **Searcher** | Google: a problem ("how to price my products in Nigeria"), a product ("business plan writer Lagos price") or the firm's name | A guide (`/guides/:slug`), a product page (`/services/:slug`) or the home page (`/`) | To know whether we can fix it, what it costs, and whether we can be trusted | One of the two front doors (section 2): **Buy now** or **Talk to an expert**; or the free check |
| **Referral** | A WhatsApp message, a past client, Enzo Krypton & Co. | The home page, a product page or `/contact` | To talk to someone | **Talk to an expert** (a call or WhatsApp) |
| **Check taker** | Any page | `/check` | A free reading of what holds the business back | The result: the first product with its front door, the Full Report, or a call |
| **Client** | The invitation, a sign-in link, a payment or reminder email, a bookmark | `/dashboard` (the room) | Where the work stands, what is needed from them, what to pay | The room's next action |
| **IP Factory staff** | `/admin/login` | `/admin` | Their projects, the pipeline, the money | Their tab in the admin console (section 8.3) |

## 2. The two front doors

Every page that sells ends in one of two doors, chosen by the product (`buy` in `shared/products.ts`). Both open the
same kind of engagement, so everything after the door works the same way.

| | **Buy now** | **Talk to an expert** |
|---|---|---|
| For | Fixed-price products a client can scope alone: the Full Report, the Funding Readiness Assessment, Strategy and 90-Day Plan, Business Model, Financial Model, Pitch Deck, Bookkeeping Catch-Up, 13-Week Cash Flow Forecast, Hiring Toolkit | The Business Review, Business Plan, Pricing and Unit Cost Review, Funding Application Pack, the Six-Week Fix, the Monthly Services, Digital Marketing |
| The buyer does | Gives name, business, email and WhatsApp; pays on Paystack | Books a 20-minute Discovery Call, or messages on WhatsApp |
| Then | The platform opens the engagement, invites the owner and shows what happens next | The lead opens the engagement; its payment terms follow what was bought (R36) |
| Payment terms | Paid before we start | Half to start and half on delivery for a service; month by month for Digital Marketing; a quarter at a time for a Monthly Service (R36) |
| Status | **To build (R13).** Online ordering is off today (`ONLINE_ORDERS_OPEN`): every Buy-now product shows Talk to an expert until R13 ships. The Full Report is the exception and is bought from the check today | **Built** (Calendly, then New engagement) |

**On every page with a door (R38, partly built):** the expert behind the work by name, the office address, "Talk to an
expert on WhatsApp", what happens after paying, the Terms. Today the Terms link and the Calendly call are there; the
named expert, the WhatsApp line and the "what happens next" block are to build.

## 3. Payment terms, and when the room opens

Payment terms follow what is bought (ET, 10 November 2026, R36), so no engagement's terms are negotiated one by one.

```mermaid
flowchart LR
  O[Engagement opened] --> T{What was bought}
  T -->|A product bought online| P1[Paid in full before we start]
  T -->|A service agreed on a call| S1[Half to start]
  S1 --> S2[Main output shared in the room]
  S2 --> S3[Second half due 7 days later, pay link emailed]
  T -->|Digital marketing| D1[Each month's fee]
  T -->|A Monthly Service| M1[Each quarter before it starts]
  P1 --> R[Room opens on the first payment]
  S1 --> R
  D1 --> R
  M1 --> R
```

| What is bought | When it is paid | Fee dates |
|---|---|---|
| A product bought online (the Full Report, a readiness assessment, a Done for You piece bought without a call) | In full, before we start | The start date |
| A service agreed on a call: the Business Review, the Business Plan, the Pricing and Unit Cost Review, the Funding Application Pack, the Six-Week Fix | Half to start, half on delivery (the Six-Week Fix too; paying in full at the start still saves 5%) | Half on the start date; the second half seven days after the main output is shared: the Findings of a Business Review, the result of a Six-Week Fix (Your Plan), the finished work of a Done for You service |
| Digital marketing | Each month's fee | Day 0, 30 and 60 from the kickoff |
| A Monthly Service | A quarter at a time, before the quarter starts | The start of each quarter |

The room opens on the first payment (built, R11). Only a Partner or the Super Admin can open it sooner, or move the
first fee past the start date before anything is paid (`approve_work_before_payment`); each is recorded. Finance counts
every unpaid fee as owed, and a fee as late once its date passes unpaid. A second half has no date until delivery, so it is owed but cannot be late. Work pauses seven days
after a missed date (D6, R51): the room says so from the first late day, and the team sees **Fee late**, then **Paused**
(built, E5); the emails, telling the client at three days, come with reminders (R12).

Today's clients: **Marcelle (Digital marketing)** pays at 30, 60 and 90 days from her kickoff, as agreed with her; her
lead sets those dates by hand in the engagement's Fees (I4).

## 4. The journeys

Columns: **Client** does · **Platform** does on its own · **Team** does · **Email** (to whom) · **Status** after · **Built?**

### 4.1 Prospect to client, by the free check (Built)

```mermaid
flowchart TD
  S[Search or referral] --> P[Guide, product page or home]
  P --> C[/check: contact details, then questions/]
  C --> R[Result: outline, gap, first product with its front door]
  R -->|Buy now, or Full Report| B[Paystack]
  R -->|Talk to an expert| K[Calendly: Discovery Call]
  K --> D[Call held; outcome recorded]
  D -->|Opportunity| E[Engagement opened, terms set]
  B --> E2[Engagement opened by the platform]
  E --> F[Room]
  E2 --> F
```

| # | Client | Platform | Team | Email | Status | Built? |
|---|---|---|---|---|---|---|
| 1 | Gives name, email, WhatsApp, how they heard; "Start the check" | Saves a lead before any business question | — | — | Pipeline **Lead** | Built |
| 2 | Answers one question per screen (about 30 at most; the path depends on the answers) | Saves on the device and the server about once a second; resumes where they stopped | — | — | — | Built |
| 3 | Sees the result: the outline (clear, watch, stuck), the gap, founder readiness, the first product and the next | Scores and routes by fixed rule; AI writes the summary only, checked against the catalogue | Reads the lead in Pipeline | Owner: the summary. Office: every answer | **Qualified lead** | Built |
| 3b | Neither books nor buys | Follows up on day 2 and day 7 with the guide for their stuck area and the first product with its front door; stops on a booking, a purchase or an unsubscribe | — | Owner: two follow-ups (to write) | Stays **Qualified lead**, or **Nurture** | To build (R48) |
| 4a | Buys the Full Report | Opens Paystack; on payment, emails the Report Intake link | — | Owner: *Payment received: your Full Report*. Office: *Paid online: …* | Payment **paid**; report **awaiting form** | Built |
| 4b | Answers the 17-question Report Intake | Builds the Full Report by fixed rule and emails the PDF at once | — | Owner: *Your Full Report: {business}* (PDF). Office: *Full Report sent* | Report **delivered** | Built |
| 5 | Books the Discovery Call in the embedded calendar | Records the booking only when Calendly confirms; picks up bookings made from the email | — | Office: *… asked for a free discovery call*. Calendly confirms to the owner | **Call booked** | Built |
| 6 | Joins the 20-minute call | — | Holds it; writes up the Discovery Call summary; records Opportunity, Refer, Lost or Nurture; shares the summary with the owner as a separate step | A Nurture outcome: one follow-up at day 30 (R48, to build) | **Opportunity**, **Referred**, **Lost** or **Nurture** | Built (the day-30 follow-up to build) |
| 7 | — | — | Opens the engagement (4.3), or for the Business Review sends the link for its first half (₦300,000 of ₦600,000); paying it opens the engagement with the second half as a fee, due seven days after the Findings are shared (R36) | Owner: *Payment details for your Business Review* | Payment **requested** (48 hours) | Built (moves onto fees with R37) |

### 4.2 Prospect to client, by Buy now (To build, R13 and R38)

| # | Client | Platform | Team | Email | Status | Built? |
|---|---|---|---|---|---|---|
| 1 | On a Buy-now product page: sees the price, the delivery date promise, the expert, WhatsApp; presses **Buy now** | — | — | — | — | To build |
| 2 | Gives name, business name, email, WhatsApp; ticks the Terms; pays on Paystack (card, transfer or USSD) | Opens Paystack for the catalogue price; never a price from the browser | — | — | Order **awaiting payment** | To build |
| 3 | Returns to "What happens next": the room link, the first records to send, a button to book the kickoff | On Paystack's confirmation: creates the business, the engagement (in advance), its fee (paid), its Data Request and Sessions from the product's intake; invites the owner | — | Owner: receipt; the invitation. Office: *New order: {product}, {business}* | Engagement **open**; fee **paid** | To build |
| 4 | Opens the room from the invitation or a sign-in link (R41) | — | The desk assigns the team (the office email is the prompt) | Team member: *You are on {business} as {role}* | — | To build (assignment built) |

### 4.3 Prospect to client, by a call (relationship)

| # | Client | Platform | Team | Email | Status | Built? |
|---|---|---|---|---|---|---|
| 1 | Agrees the work and the terms on the call | — | The lead opens **New engagement**: client (new or existing), type and service, start date | — | — | Built |
| 2 | — | Loads the type's Data Request, Work Plan, Sessions and fee schedule, dated from the start; invites the owner (an existing client's project joins their account) | Checks the fee schedule, whose terms follow what was bought (R36) | Owner: *Your The Shift room for {business}*, with **What we will do** (the work, the start date, each fee and its date; R47) | Engagement **open**; **awaiting first payment** | Built |
| 3 | Pays the first fee from the room or the email | Confirms the payment; opens the room; sends the receipt | Records money that came another way (ticks Paid), or **Open the room now** | Owner: receipt. Office: *Paid online: …* | Fee **paid**; room open | Built |

### 4.4 The client during delivery

| # | Client | Platform | Team | Email | Status | Built? |
|---|---|---|---|---|---|---|
| 0 | Opens the project for the first time | **Getting started**: the expert or experts with **WhatsApp {first name}**, the first three things to do (book the first Session, the first records, any fee), each linked to where it is done, and what happens next; **What we will do** sits beside the team. Getting started stays on Overview until the first Session is held | — | — | — | Built (R46, R47) |
| 1 | Opens the room: sees where things stand, the next action, the next Session | Shows one next action, chosen by rule: a fee the room waits for, approvals that hold up publishing, records past their date, records due this week, a Sign-off (R50) | — | — | — | Built (the rule to build, R50) |
| 2 | Books the kickoff and Sessions on Calendly from the room | Copies each booking's time and link onto the next Session without one | Holds the Session; saves client notes and internal notes; shares client notes the same day | Owner (and the people the notes are shared with): *Engagement update: {title}* | Session **held** | Built |
| 3 | Sends records: uploads files and voice notes into the drop box; for raw video, pastes a Drive (or Dropbox, WeTransfer, iCloud) link, or presses **Send on WhatsApp to {name}** and marks it sent another way; or "Not available" with a note | Keeps files private; never stores raw video; reminds two days before an item's date and two days after it if still open | The person it is for (the Content Producer for footage) opens the link or the WhatsApp; matches each file to the items it answers; marks an item received or asks for more | Owner: reminders (to build). Lead: what is still outstanding after the reminders (to build) | Item **Sent, we are checking** → **Received**, **We need a bit more**, **Not available** | Files, voice notes and links built (R43); a client can take back a file until it is taken in (R61); WhatsApp to build (R44); reminders (R16) |
| 4 | Approves reels, posts and stories, or asks for changes (Digital marketing); on a phone, previews each piece and approves several at once | Counts the month's pieces once approved | The Content Producer edits and sends for approval; the Digital Marketer plans and publishes | — | Content **For your approval** → **Approved** or **Changes requested** → **Published** | Built; previews and approving several at once to build (R54) |
| 5 | Reads a shared Deliverable; comments; gives Sign-off, or asks for changes (R51, to build) | — | Drafts; a lead approves prescriptions and plans; shares with the owner or the owner and their team; Specialists hand in drafts the lead shares | Owner: *Engagement update: {title}* | Deliverable **draft** → **approved** → **shared**; Sign-off given | Built |
| 6 | Sees the one number each week | Shows where it started, this week, where it is going | Records the weekly check-in: five questions, the reading, hours by role, AI used | — | — | Built |
| 7 | Pays each later fee from the reminder (by email, with a WhatsApp button) or the Payments tab; keeps the PDF receipt | Sends each fee's link 5 days before its date, on the day, and 3 and 7 days after if unpaid, never between 9pm and 7am; confirms payment; sends the receipt and invoice as PDFs | Told at 7 days late; work pauses (D6) | Owner: reminders, receipt, invoice (reminders and PDFs to build). Lead: 7 days late (to build) | Fee **due** → **paid** or **late** | Built, except reminders (R12), PDFs (R53) and quiet hours (R57) |
| 7b | A late fee: from the day after its date a banner says it is late and when work pauses, with **Pay**; from seven days after it, that work is paused and what to pay to continue. The room stays readable and uploads stay open; a team member without the fees is told only that work is paused | Shows **Fee late**, then **Paused**, on the list and the record; paying lifts it at once | Gives more time with a new date in Fees (the first fee before any payment: a Partner) | Owner: *Work on {engagement} is paused* and *has resumed* (to write, with R12 and G2) | Engagement **late** → **paused** → **open** | Built (E5); the emails to build |
| 8 | Adds their own staff (one seat): full access or contributor; later, sends one staff member a link to answer one item without an account (R55) | Sends the seat invitation | — | Staff member: invitation | — | Built (the one-item link to design) |

### 4.5 Close, the Day-30 Review and the next fix (To build, R26 to R28)

| # | Client | Platform | Team | Email | Status | Built? |
|---|---|---|---|---|---|---|
| 1 | Signs off the last Deliverable | — | The lead closes the engagement: final value of the number, whether it moved, the plan delivered, the next problem and the product suggested | Owner: *Your {engagement} is complete* | Engagement **closed**; Day-30 Review booked | To build |
| 2 | At Day 30: says what is still in use, in the room | Asks on day 30; records the answer | Reads it; follows up where nothing is in use | Owner: *Day-30 Review: is it still working?* | Day-30 **done** | To build |
| 3 | Sees the next fix with its price: **Buy now**, or **Talk to an expert** | Offers the product suggested at close | Opens the next engagement in the same room when asked | Office: *{business} asked for the {product}* | New engagement | Asking built; buying in the room with R13 |

### 4.6 The delivery team

| Person | Starts from | Daily work | Cannot |
|---|---|---|---|
| **Lead** (Engagement Manager or Lead Consultant on the engagement; Partner, Vice President, Senior Associate, or an Associate leading it) | **My projects** in Engagements | Opens engagements (their terms follow what was bought); staffs them; approves Deliverables; shares notes; sends fee links; a Partner can open a room before payment | Approve on an engagement they do not lead, unless their level approves everywhere |
| **Analyst** (Senior Business Analyst, Business Analyst) | **My projects** | Keeps the Work Plan and Data Request current; matches files; drafts Deliverables; records check-ins; records payments by hand | Approve, staff, or see engagements they are not on |
| **Specialist** | Invited by the Super Admin at Specialist level with an end date; then **added to an engagement** by a lead with `assign_engagements` (Partner, Vice President, Senior Associate), who sets the role Specialist; the Specialist is emailed *You are on {business} as Specialist* and it appears in **My projects**; one step from the engagement with R58 | Adds team items; attaches drafts to Deliverables for the lead to share | See internal notes or fees; change anything already there; reach the client directly |
| **Digital Marketer** (a project role on a Digital marketing engagement; R45) | **My projects** | The content plan, publishing, the monthly numbers; the client's main contact, on WhatsApp | As their level allows |
| **Content Producer** (a project role on a Digital marketing engagement; R45) | **My projects** | Receives footage (by link or WhatsApp), edits, sends pieces for the owner's approval | As their level allows |

Every team member has a WhatsApp number on their profile (R44); the room shows it beside them, and an item meant for
one of them offers **Send on WhatsApp to {name}**. Each person agrees to their number being shown (PRD K11).

**Today** (R52, to build): one list across a person's projects (approvals waiting, files to match, check-ins due, records
overdue, fees late), so nobody opens every project to find their work.

What the team should never do by hand once R12, R16 and R36 are built: chase a Data Request, chase a fee, work out a
fee date, or send a payment link on a schedule.

### 4.7 Finance

| Step | Finance | Platform | Built? |
|---|---|---|---|
| 1 | Opens **Finance**: paid, owed, late; every fee and every payment request | Counts each fee by its terms (section 3) | Built (terms with R36) |
| 2 | Sees a payment that needs a look (wrong amount, paid twice) | Emails the office with the Paystack reference | Built |
| 3 | Checks it in Paystack; confirms by hand or refunds | Records who confirmed and why | Built (refunds recorded with R37) |
| 4 | Reconciles Paystack's settlements against payments | One payment row per Paystack transaction | To build (R37) |

### 4.8 The Super Admin

Invites people by **level** (Team tab), sets levels, suspends and restores access, resets two-step sign-in, removes
access with a recorded reason, and watches System status (file storage, email). Built.

### 4.9 Handoffs between people

Most failures happen where work passes from one person to another. Each handoff has a trigger, a signal to the person
receiving it, and a time it should take.

| From → to | What passes | Trigger | The receiver is told by | Should take | Built? |
|---|---|---|---|---|---|
| Visitor → desk | A lead and the check's answers | Check finished | The office email; Pipeline | Same working day | Built |
| Visitor → lead | A booked Discovery Call | Calendly confirms | Calendly; Discovery Calls | — | Built |
| Lead → client | The engagement, What we will do, the first fee | New engagement | The invitation email, with What we will do, and **Send on WhatsApp** beside the link (R44) | At once | Built |
| Desk → team member | A project and a role | Assigned | *You are on {business} as {role}* | At once | Built |
| Client → team | Records, footage, approvals | Upload, link, WhatsApp, approve | Files to sort; the item's status; Today (R52) | Matched within a working day | Partly built |
| Specialist → lead | A draft | Attached to a Deliverable | The Deliverable's files; Today (R52) | Reviewed within two working days | Partly built |
| Team → client | Notes, Deliverables, content for approval | Shared | *Engagement update: {title}* | Notes the same day | Built |
| Platform → lead | Late fees, overdue records | 7 days late; after reminders | An email to the lead; Today (R52) | — | To build |
| Leaver → lead | Open items of a person who leaves | Access removed | The lead's Today (R51) | At once | To build |

## 5. Status models

| Object | States | Moves on its own | Moved by a person |
|---|---|---|---|
| **Pipeline** (a business check) | Lead → Qualified lead → Call booked → Opportunity → Won; Lost, Nurture, Referred | The first three, forward only, never over a stage the team set; Won on a confirmed Business Review payment | Opportunity, Refer, Lost; "Move to" any stage except Won |
| **Order** (Buy now) | Awaiting payment → Paid → Engagement opened; Abandoned | All of them (R13) | — |
| **Engagement** | Getting set up → (Business Review, Six-Week Fix) Business Review, The Fix, Your Plan → Closed; other types Open → Closed (a dated type also shows its stage from the start date); plus **awaiting first payment** and **paused** (R51) | Awaiting first payment clears on the first fee paid; late from the day after an unpaid fee's date and paused seven days after it, cleared when it is paid or given a new date (nothing stored); a dated type's stage follows its start date | The stage; Close (R26); Open the room now; pause or lift a pause |
| **Fee** | Set → Due → Paid, or Late | Due and Late by date and terms; Paid on Paystack's confirmation | Paid by hand (money that came another way); undo |
| **Payment** (one Paystack transaction) | Started → Paid, Failed, Needs a look, Refunded | Paid and Failed from Paystack | Needs a look resolved; Refunded recorded (R37) |
| **Data Request item / action** | To do → Sent, we are checking → Received, or We need a bit more; Not available; Done; No longer needed | Sent when the client uploads or marks it | Received, We need a bit more, Done, No longer needed |
| **Deliverable** | Draft → Awaiting approval → Approved → Shared → Sign-off given, or Changes asked for (R51) → Draft | — | Each step; editing a shared one returns it to Draft |
| **Content piece** | Planned → In edit → For your approval → Approved or Changes requested → Published | — | The team, except the owner's Approved or Changes requested |
| **Session** | Planned → Held, or Cancelled | Booked time copied from Calendly | Held, Cancelled; notes shared |
| **Full Report** | Awaiting form → Delivered | Delivered when the intake is sent | Form link sent again |
| **Invitation** (client or staff) | Pending → Accepted, Revoked or Expired | Expired by date | Revoked; a new one replaces the one out |
| **Day-30 Review** | Booked → Done, or Missed | Asked on day 30 (R27) | Follow-up |

## 6. Emails

All from the IP Factory address with the brand layout; failures recorded and shown to the office (R32). "Office" is
info@ipfactory.co.

| Trigger | To | Subject | Built? |
|---|---|---|---|
| Check finished | Owner; office | *Your Business Health Check: Findings* (the summary); *Business Health Check: {business} ({path}, {area})* (every answer) | Built |
| Full Report asked for | Owner; office | *Payment details for your Full Report*; *… asked for the Full Report* | Built |
| Business Review link sent | Owner | *Payment details for your Business Review*: the first half, and when the second is due | Built (moves to fee reminders with R37) |
| A service's main output shared (delivery) | Owner | *{fee}: ₦{amount} due by {date}*, the second half with its pay link (R36) | Built |
| Business Review or Full Report paid | Owner; office | *Payment received: …*; *Paid online: …* | Built |
| Report Intake sent again | Owner | *Your Report Intake* | Built |
| Full Report built | Owner; office | *Your Full Report: {business}* (PDF); *Full Report sent* | Built |
| Discovery Call asked for | Office | *… asked for a free discovery call* | Built |
| Engagement opened for a new client | Owner | *Your The Shift room for {business}*, with **What we will do**: the work, the start date and each fee with its date, before the link (R47) | Built |
| Fees changed once the owner has an account | Owner | *Your fees have changed: {engagement}*: the schedule as it now stands, the total and a link to Payments. Saving the same fees again sends nothing | Built (R47) |
| Business Review paid (account) | Owner | *Set up your client account on The Shift* | Built |
| Notes or a Deliverable shared | Those who can see it | *Engagement update: {title}* | Built |
| Added to an engagement, or role changed | Team member | *You are on {business} as {role}*; *Your role on {business}: {role}* | Built |
| Fee link sent by the team | Owner | *{fee}: ₦{amount} for the {engagement}* | Built |
| Fee paid online | Owner; office | *Payment received: {fee}*; *Paid online: {business}, {fee}* | Built |
| Payment needs a look | Office | *Paystack payment needs a look: {reference}* | Built |
| Client asks for another service | Office | *{business} asked for the {product}* | Built |
| Password reset | The person | *Reset your password on The Shift* | Built |
| Staff invited | The invitee; Super Admins | *Join the IP Factory team on The Shift*; *Staff invitation: {level} for {email}* | Built |
| Owner invites a colleague (a seat) | The colleague | *{owner} invited you to {business} on The Shift* | Built |
| A role or level given | Super Admins | *[The Shift security] {role} role given to {email}* | Built |
| Access removed | Super Admins | *[The Shift security] Access removed: {email}* | Built |
| Two-step sign-in reset by a manager | Super Admins | *[The Shift security] Two-step sign-in reset: {email}* | Built |
| Staff account locked after wrong passwords | Super Admins | *[The Shift security] Account locked: {email}* | Built |
| Wrong two-step codes in a row | Super Admins | *[The Shift security] Wrong two-step codes: {email}* | Built |
| Signed in with a recovery code, or from a new device | Super Admins | *[The Shift security] Recovery code used: {email}*; *… New device: {email}* | Built |
| Administrator password reset (the older admin password) | The administrator | *Reset your administrator password on The Shift* | Built |
| Fee due in 5 days, due today, 3 and 7 days late | Owner; lead at 7 days | To write; each with a WhatsApp button | To build (R12) |
| Work paused; work resumed | Owner; lead | *Work on {engagement} is paused*; *… has resumed* | To build (R51) |
| Payment received, with the receipt and invoice as PDFs | Owner | *Payment received: {fee}* (PDFs attached) | Email built; PDFs to build (R53) |
| Check finished but no call or purchase: day 2, day 7; Nurture: day 30 | Owner | To write | To build (R48) |
| Data Request item due in 2 days, 2 days late | Owner or assigned staff; lead after | To write | To build (R16) |
| Buy-now order paid | Owner; office | Receipt and invitation; *New order: {product}, {business}* | To build (R13) |
| Engagement closed; Day-30 Review | Owner | *Your {engagement} is complete*; *Day-30 Review: is it still working?* | To build (R26, R27) |
| Sign-in link | Client | *Your sign-in link* | To build (R41) |

## 7. Exceptions and recovery

| What goes wrong | What the client sees | What the platform does | What the team does | Built? |
|---|---|---|---|---|
| Paystack is off (no key) | "Online payment is not open yet"; no Pay button | Refuses to open a payment; emails say a link is coming | Ticks Paid for money that came another way | Built |
| A payment is abandoned or fails | "Payment not completed", with Try again | Nothing is marked paid | — | Built |
| Paid the wrong amount, or paid twice | "Still confirming" (so they do not pay again) | Marks nothing paid; emails the office with the reference | Checks Paystack; confirms by hand or refunds | Built |
| Paystack's notification fails | The return page confirms it instead | Answers 500 so Paystack sends it again | Alerted the same day (R42) | Built, except the alert |
| An email does not arrive | — | Records the failure; shows it to the office | Copies the link shown once (invitations, fee links, resets) and sends it on WhatsApp | Built |
| An invitation expires or is revoked | "Invitation unavailable", with sign-in | — | **Send sign-in link** from the engagement | Built |
| A client forgets their password | "Forgot your password?" on `/login` | Emails a 20-minute single-use link; same answer whether or not the account exists | — | Built (sign-in links replace this with R41) |
| A fee goes unpaid | The room's banner: late, then paused seven days after its date (built, E5); reminders by email (to build) | Reminds at 5 days before, on the day, at 3 and 7 days after | Sees **Fee late**, then **Paused**; work pauses (D6) | Banner and badges built; reminders to build (R12) |
| A client goes quiet on records | Reminders | Reminds before and after each date | Told what is still outstanding | To build (R16) |
| A client should get in before paying | — | — | A Partner or the Super Admin: **Open the room now** (recorded) | Built |
| Footage is too large to upload | **Send a link** on the item: "A link to a shared folder on Google Drive, Dropbox, WeTransfer or iCloud. Videos always come this way, or on WhatsApp." A video file is refused with the same advice | Stores the link, never the video | The Content Producer opens it from the item (**Open the link**) | Built (R43); Send on WhatsApp to {name} with R44 |
| A wrong or private file was sent | **Remove** beside their own file until the team has matched it or accepted its item; after that, they ask the team | Deletes the stored file and the record; an item back to "To do" if that file was its only answer | Remove any file with a reason, recorded | Built (R61) |
| The client does not know whom to message | Each team member with **WhatsApp {first name}**, once that person agreed in their Account settings; an item offers **Send on WhatsApp to {name}** (the person who asked for it, or the main contact) | Shows a number only once agreed, and only to clients of that person's engagements | Each person adds their number and agrees in Account settings | Built (R44, R45); numbers wait on each person |
| A team member leaves mid-engagement | The team list changes; nothing else | Moves their open items to the lead | The lead reassigns | To build (R51) |
| An upload fails on a weak network | "The upload did not finish. Try again." (today); resumes on its own (R56) | Photos compressed first (R56) | — | Partly built |
| The connection drops while a screen loads | "We could not load this. Check your connection and try again.", with **Try again**; when the screen already had something, it stays with "We could not refresh this. Showing what we had at 10:42 am." A signed-in person is never sent to sign in, and a pay or invitation link is never called invalid, because a request failed | Retries twice by itself before saying so | — | Built (R69) |
| The payment check fails on the return page | "We could not check your payment. … If you have paid, your payment is safe with Paystack: please do not pay again.", with **Check again** | — | — | Built (R69) |
| A first-time payer is unsure who receives the money | Before **Pay**, "Before you pay": *You pay Enzo Krypton & Co., the firm behind IP Factory, through Paystack. Look for Enzo on Paystack's page and on your bank statement*; the reference; the receipt by email (what it is for is the page's heading, above); and **Questions first? WhatsApp {first name}** (the engagement's main contact, once they agreed to show their number) or **WhatsApp IP Factory** (the office) | Names a team member only once they agreed (R44); offers the office otherwise | Answers on WhatsApp | Built (R72) |
| A Specialist's access ends | — | Their role ends at the end of the day, Lagos time | — | Built |

## 8. Reference: pages, admin console, room, sign-in

### 8.1 Pages

| Route | Page | Reached from | What it does |
|---|---|---|---|
| `/` | `Home.tsx` | Anywhere | Problem-led home: "Find it. Fix it. See the shift.", the free check, owners' problems with the fix under each, how we fix it, the record, three starting services |
| `/services` | `ServicesPage.tsx` | The menu | Every product as a tile with its price and promise, filtered by way to buy |
| `/services/:slug` | `ProductPage.tsx` | Services, guides, the check's result | One product: what it is, who it is for, what you get, what we need, the price and how it is paid, delivery, what comes next; its front door (section 2) |
| `/how-we-work` | `HowWeWorkPage.tsx` | The menu | The method, the four ways to buy, the promises, the ten problem areas |
| `/experience` | `ExperiencePage.tsx` | Home, About | The record: figures, client logos, the firm behind The Shift |
| `/guides` | `GuidesPage.tsx` | Home, the footer | Answers to what Nigerian owners search for |
| `/guides/:slug` | `GuidesPage.tsx` | Search, Guides | One guide, its fix and the services with prices; FAQ structured data |
| `/about` | `AboutPage.tsx` | The menu | IP Factory and Enzo Krypton & Co., written for the searches an About page answers (who, where, who is behind it, for whom): the figures, what we do with a link to each service, how we work, who it is for, and its questions (FAQ structured data) |
| `/questions` | `QuestionsPage.tsx` | The menu | Every question, before buying and per service |
| `/contact` | `ContactPage.tsx` | The menu | "Talk to an expert": the call, the mailbox, the office |
| `/check` | `CheckPage.tsx`, then `BusinessCheck.tsx` | Every page | The free Business Health Check (4.1). The first screen opens alone; the questions load in the background and take over (R70) |
| `/terms` | `LegalPage.tsx` | Footer, forms, pay pages | The Terms and Conditions |
| `/privacy` | `LegalPage.tsx` | Footer, forms, pay pages | The Privacy Policy |
| `/report/:token` | `FullReportPage.tsx` | *Payment received: your Full Report* | The Report Intake, then the download |
| `/pay/:token/:item` | `PayPage.tsx` | The Full Report or Business Review payment email | Pay for the Full Report, or the first half of the Business Review (₦300,000 of ₦600,000), on Paystack, after "Before you pay" (R72) |
| `/pay/fee/:feeLineId/:token` | `FeePayPage.tsx` | A fee's email, the room's Payments tab | Pay one engagement fee on Paystack, after "Before you pay" (R72); the token is an HMAC of the fee's id |
| `/pay/return` | `PayReturnPage.tsx` | Paystack | Paid, still confirming, or not completed |
| `/onboarding/:token` | `OnboardingPage.tsx` | The Business Review account invitation | Create the client account |
| `/join/:token` | `JoinPage.tsx` | A client, seat or staff invitation | Set a password; land in the room or the admin |
| `/reset/:token` | `ResetPasswordPage.tsx` | A reset email | Choose a new password |
| `/login` | `LoginPage.tsx` | "Client sign in" | Client sign-in; forgotten password |
| `/signup` | Redirect | Old links | No public sign-up: goes to `/login` |
| `/dashboard` | `AccountDashboard.tsx` | Sign-in, every client email | The room (8.4) |
| `/settings/business` | `BusinessSettingsPage.tsx` | The room | Business name, description, year founded, sector, website |
| `/settings/account` | `AccountSettingsPage.tsx` | The room | Name and password; for staff, their WhatsApp number and their agreement to clients seeing it (R44) |
| `/admin/login` | `AdminLoginPage.tsx` | Staff | Staff sign-in, with the two-step code |
| `/admin/reset` | `AdminPasswordResetPage.tsx` | A reset email | Reset the administrator password |
| `/admin` | `Admin.tsx` | Staff sign-in | The admin console (8.3) |
| `/404` | `NotFound.tsx` | Anything else | Not found |

Paystack's signed notifications arrive at `POST /api/paystack/webhook`.

### 8.2 Signing in

- Clients at `/login`, staff at `/admin/login`. Everyone with an internal role uses a six-digit code from an
  authenticator app after the password; recovery codes work in the code box.
- A person with no business and at least one internal role lands on `/admin`; everyone else on `/dashboard`.
- An invitation opened while signed in as someone else names both addresses and offers "Sign out and continue".
- Forgotten password: a single-use link for 20 minutes; the page never says whether the account exists.
- **To build (R41):** clients sign in with a link sent to their email (WhatsApp later); no password.

### 8.3 The admin console

Five tabs, one job each, in the order work flows. A person sees only the tabs their permissions allow, and the server
checks every action again. Under the person's name is their level.

| Tab | Permission | For | Holds |
|---|---|---|---|
| **Pipeline** | `manage_client_onboarding` | Prospects | Business Health Checks (metrics, stage filter, search); Discovery Calls (requests, bookings, the call summary, outcome); Client Onboarding (invitations) |
| **Engagements** | `view_all_businesses`, or `view_assigned_businesses` for one's own | Delivery | My projects; Clients asking for another service; New engagement; Paid but no engagement yet; every engagement in scope; the engagement record (below) |
| **Clients** | `view_all_businesses` | Accounts | Businesses and their members; client accounts (reset link, suspend, reinstate, reset two-step, remove access) |
| **Finance** | `view_financials` | Money | Paid, owed, late; every fee and payment request; read only |
| **Team** | `manage_roles` | Our people | Everyone by level; invite by level; access ends; System status |

**The engagement record** (the drawer in Engagements), top to bottom:

| Section | What the team does there | Who |
|---|---|---|
| The client | Owner, email, WhatsApp, account; **Send sign-in link**; **Preview as client** (read only, logged) | Anyone on it; sign-in link with `manage_client_onboarding` |
| Stage and team | Stage; people and their role on the engagement (each emailed when added) | Stage: `manage_engagements`; team: `assign_engagements` |
| Fees | Each fee: amount, date, Paid or Paid online; **Send link**; **Open the room now** while it waits for its first payment (a Partner or the Super Admin; others see who can); terms follow what was bought (R36) | `manage_engagements`; links also `manage_payments`; opening early or moving the first fee past the start date also `approve_work_before_payment`; never a Specialist |
| The problem | The one problem and its statement | `manage_engagements` |
| Sessions | Time, link, agenda; client notes and internal notes; share the client notes | `manage_engagements`; internal notes never to a Specialist |
| Content (Digital marketing) | Reels, posts, stories by month and status | `manage_engagements` |
| Files the client sent | Match each file to the items it answers | `manage_engagements` |
| Work Plan | Requests and actions by week; **Load a Data Request** (a template or rows pasted from Excel); Specialists add team items | `manage_engagements`; `contribute_engagements` for team items |
| Deliverables | Draft, approve, share, comment; files (Specialist drafts are IP Factory only until shared). Sharing the main output while a second half waits says so first: it dates that half seven days ahead and emails the client its link (R36) | Approve: `review_engagements` or the engagement's lead |
| The fix | The one number; one check-in a week | `manage_engagements` |
| Close (R26, to build) | The final value, whether it moved, the next product | The lead |

### 8.4 The room

The client's room fills the screen: a left rail (phones: a slim top bar), a header (business, stage, title, day N of M,
the team) and the views as tabs.

| Tab | Shows | Who sees it |
|---|---|---|
| **Overview** | Getting started (until the first Session is held), the stage band, four figures, the next action, the next meeting, the timeline, Waiting on you, the team, What we will do, Your projects, Fix the next problem | Everyone in the room; the fees in What we will do, owner and full access |
| **Content** (Digital marketing) | The month's pieces against the programme; approve or ask for changes | Owner and full access |
| **Work Plan** | Every request and action by week, with who and when | Everyone; contributors their own |
| **Data Request** | The checklist by section, the drop box, documents received | Everyone; contributors their own |
| **Sessions** | Every Session with its time, Join link, agenda, shared notes; booking on Calendly | Everyone |
| **Business**, **Founder** | The Business Health Check or Full Report, area by area | Owner and full access |
| **Deliverables** | Findings, the Problem Statement, the Prescription, tools, the plan, the Full Report; comments; Sign-off | By audience; Sign-off by the owner |
| **Payments** | Each fee with its date, reference and Pay button; total, paid, to pay | Owner and full access |

While an engagement in advance waits for its first payment, the room shows only "Your room opens once the first payment
is made", the fee and **Pay securely with Paystack**.

**Built 9 November 2026:** each team member with **WhatsApp {first name}** once they agreed (R44); voice notes, links and
**Send on WhatsApp to {name}** on Data Request items (R43). **Getting started** on Overview until the first Session is
held: the experts with their WhatsApp buttons, then up to three steps, each linked to where it is done (book the first
Session or see it booked; send the first records, to the Data Request; pay the first fee, to its Pay page), and what
happens next (R46). **What we will do**, read-only, nothing to sign: the work and what the owner receives, the team, the
start date and each fee with its date (R47). It is not called Your plan, because Your Plan is the method's plan handed
over at the end. **To come:** after a usability test, fewer places: Home, To do, Sessions, Results, Payments, so no task
appears twice (R49).

**Built 9 November 2026:** on a phone the header is one line off the Overview, a one-line bar replaces it at the top once it
scrolls away on the Overview, and the tab bar keeps the selected tab in view and fades where more tabs sit (R71). Every
view shows its loading, empty, failed and partly-done states as the Design brief sets them (section 5), and a failed load
is never shown as empty (R69).

### 8.5 Permissions and project roles

A person's level gives them platform roles (`LEVEL_ROLES`), each role gives named permissions
(`PLATFORM_ROLE_PERMISSIONS`, both in `shared/platformPermissions.ts`), and the server checks the permission on every
action. An engagement action also checks that the person is on that engagement, unless they see every engagement. The
Super Admin holds every permission. The [coverage matrix](09-coverage-matrix.md) (section 4) names the check on every
server action.

| Permission | What it allows | Held by default | Checked by |
|---|---|---|---|
| `view_all_businesses` | Every engagement and every client business | Partner, Vice President, Senior Associate | Engagements (all), Clients |
| `view_assigned_businesses` | The engagements the person is on | Associate, Business Analysts, Partner, Specialist | Engagements (own) |
| `manage_businesses` | Change a business itself (its details, its owner) from the console | Super Admin only | Nothing yet (C18) |
| `manage_client_onboarding` | The Pipeline: checks, Discovery Calls, client invitations, sign-in links | Super Admin, or an administrator given it | Pipeline, `onboarding.*`, Send sign-in link |
| `manage_engagements` | Work on an engagement: stage, problem, Sessions, Work Plan, drafts, content, files, measures, check-ins, fees; open one by hand (with `view_all_businesses`) | Partner, Vice President, Senior Associate, Associate, Business Analysts | Every change in an engagement |
| `assign_engagements` | Put people on an engagement and take them off | Partner, Vice President, Senior Associate | `staff.assign`, `removeMember`, `assignableStaff` |
| `review_engagements` | Approve Deliverables on any engagement in scope; see internal notes and fees | Partner, Vice President, Senior Associate | Approve, internal notes, fees |
| `contribute_engagements` | Add team-side Work Plan items and draft files, seen by IP Factory only until shared | Specialist | Team items, draft uploads |
| `manage_payments` | Payment requests, confirming money by hand, sending payment and fee links | Finance | `businessSupport` payment actions, Send link |
| `approve_work_before_payment` | Work before the first payment: **Open the room now**, or moving the first fee past the start date before anything is paid (ET, 10 November 2026; D4) | Partner (and the Super Admin) | Open the room now, Save the fees |
| `view_financials` | Finance: paid, owed, late; fees on an engagement | Partner, Vice President, Senior Associate, Finance | Finance, fees |
| `manage_scheduling` | Scheduling settings (the older admin scheduling capability) | Partner, Vice President, Senior Associate | Nothing yet (C18); calls are booked under `manage_client_onboarding` |
| `manage_communications` | Communication settings (the older admin communications capability) | Partner, Vice President, Senior Associate | Nothing yet (C18) |
| `manage_users` | Accounts: reset link, suspend, reinstate, job title, remove access, reset two-step | Super Admin only | `people.*` |
| `manage_roles` | The Team tab: invite staff by level, set levels and end dates, revoke roles | Super Admin only | `platformRoles.*`, `invitations.staff.*` |
| `manage_admins` | Give or take the Admin and Super Admin roles | Super Admin only | Nothing yet (C18); only a Super Admin may grant them, by rank |
| `manage_platform_settings` | Platform settings | Super Admin only | Nothing yet (C18); no settings screen exists |

**Project roles** are set per engagement (`ENGAGEMENT_TEAM_ROLE_LABELS` in `shared/engagement.ts`) and decide what a
person does on that one engagement, not what they may see across the platform.

| Project role | On the engagement |
|---|---|
| Engagement Manager | Runs it day to day; approves its Deliverables |
| Lead Consultant | Leads the work; approves its Deliverables |
| Partner | Oversees it; approves its Deliverables |
| Analyst | Does the work; may not approve |
| Specialist | Hands in work in one area until their end date; may not approve; never sees internal notes or fees |
| Digital Marketer | On a Digital marketing engagement only: the content plan, publishing, the monthly numbers; the client's main contact. Approval follows their level |
| Content Producer | On a Digital marketing engagement only: receives the footage, makes the edits, sends pieces for the owner's approval. Approval follows their level |

## 9. Legal links

The approved Terms and Privacy Policy live in `docs/legal/` and are shown at `/terms` and `/privacy`. They are linked in
the footer, at the start of the check, beside every button that leads to Paystack, on account creation, and in every
email's footer; mid-form they open in a new tab. No consent is stored today; tracking (R39) needs a consent notice
first (PRD K9).
