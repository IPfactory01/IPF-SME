# 3. App flow

**What happens when someone clicks, and which page comes next.** Last reviewed 9 October 2026, against the code on the
working branch. Diagrams use Mermaid, which GitHub renders.

Every route listed in `client/src/App.tsx` appears in section 1. `test/docs/productDocs.test.ts` fails if a route is
added without being documented here.

---

## 1. Page map

### The Shift (current platform)

| Route | Page | Who can reach it | What it does | Next |
|---|---|---|---|---|
| `/` | `Home.tsx` | Anyone | The site in the owner's words: problem, ten problem areas, how it works and prices, questions | "Free business check" → `/check` |
| `/check` | `BusinessCheck.tsx` | Anyone | The free business check, from contact details to the result | Book a call (Calendly) or ask for the full report |
| `/report/:token` | `FullReportPage.tsx` | Link in the "payment received" email | The 17-question report form, then the download | Report emailed; download on the page |
| `/onboarding/:token` | `OnboardingPage.tsx` | Link in the client account invitation | Create the client account | `/dashboard` |
| `/join/:token` | `JoinPage.tsx` | Link in a staff invitation or an owner's seat invitation | Set a password; staff land on `/admin` with their role, the owner's staff on `/dashboard` in that business | `/admin`, `/dashboard` |
| `/login` | `LoginPage.tsx` | Anyone | Client sign-in with email and password | The landing page (section 6) |
| `/signup` | Redirect | Anyone | No public sign-up | `/login` |
| `/dashboard` | `AccountDashboard.tsx` | Signed-in account | Welcome; the engagement room once the Current State Assessment is paid (section 9); business profile completion; a link to the internal area for staff | `/settings/business`, `/admin` |
| `/settings/business` | `BusinessSettingsPage.tsx` | Signed-in account (owners and business admins can save) | Business name, description, year founded, sector, website | — |
| `/settings/account` | `AccountSettingsPage.tsx` | Signed-in account | Name and password | — |
| `/admin/login` | `AdminLoginPage.tsx` | Staff | Staff sign-in with email and password | `/admin` |
| `/admin/reset` | `AdminPasswordResetPage.tsx` | Link in a reset email | Reset the administrator password | `/admin/login` |
| `/admin/invite` | `AdminInvitationPage.tsx` | Link in a staff invitation | Accept a staff invitation | `/admin` |
| `/admin` | `Admin.tsx` | Staff with a verified session | The admin console (section 7) | — |
| `/404`, anything else | `NotFound.tsx` | Anyone | Not found | `/` |

### JUMP-era pages still in the code

Kept for history and for JUMP participants. Nothing in The Shift's flow links to them, except the gap noted in section 10.

| Route | Page | What it is |
|---|---|---|
| `/admin/login/legacy` | `AdminLegacyLoginPage.tsx` | Old Google sign-in plus the JUMP administrator password; offered only where Manus OAuth is configured |
| `/portal` | `ParticipantDashboard.tsx` | JUMP participant portal: brief, Current State Assessment, payments with receipts, documents, sessions |
| `/portal/password` | `ParticipantPasswordPage.tsx` | Set a JUMP participant password |
| `/schedule` | `Schedule.tsx` | JUMP session booking (Decide, Learn, Apply) |

The server also redirects `/portal/authenticate` and `/portal/access` to `/?participant_signin=1` (`server/_core/app.ts`).

## 2. The journey, end to end

```mermaid
flowchart TD
  A[Home /] -->|Free business check| B[/check: contact details/]
  B -->|Start the check: lead saved| C[Questions, one per screen]
  C --> D[Reading your answers]
  D --> E[Result: outline, gap, summary]
  E -->|Book my free call| F[Calendly booking]
  E -->|Get my full report| G[Payment details emailed]
  G --> G2[Owner pays and sends proof]
  G2 -->|Team confirms| G3[Report form link emailed]
  G3 --> G4[/report/:token: 17 questions/]
  G4 -->|Submit| G5[PDF emailed at once and downloadable]
  F --> H[Discovery call, 20 minutes]
  H -->|Team records Opportunity| I[Current State Assessment payment details emailed]
  H -->|Refer| R[Referred]
  H -->|Lost| L[Lost]
  I --> I2[Owner pays and sends proof]
  I2 -->|Team confirms| J[Won: client account invitation emailed]
  J --> K[/onboarding/:token: create account/]
  K --> M[/dashboard/]
  M --> N[Engagement room: Current State Assessment, fix, plan]
```

## 3. The free business check, screen by screen

Source: `client/src/pages/BusinessCheck.tsx`; rules in `shared/businessCheck/engine.ts`.

1. **Intro.** "Take the check". A returning owner sees "Continue where you left off" and "Start again". Progress is kept
   on the device (`localStorage` key `ipf-business-check-v1`) and saved to the server about once a second.
2. **Contact details** ("First, who are we talking to?"): full name, email, WhatsApp (optional, Nigeria by default),
   how they heard. "Start the check" calls `businessCheck.start`, which saves a **Lead**.
3. **Section intros.** Before each section: what it means and an example for the owner's sector.
4. **Questions,** one per screen, with a progress rail and the outline filling in on the side. The path depends on the
   answers (PRD F2). Typed answers (business name, one-line description) are required. Trading businesses end with
   **The problem to fix**: what they have tried (optional), what it costs each month, and who decides.
5. **Reading your answers** while `businessCheck.submit` runs. If it fails: "Try again".
6. **Result:** the tally (stuck, watch, clear), "What we found", "What we think it is", the outline with "Start here"
   and the greyed "Not assessed" areas, founder readiness in words, "Where we could help", and **Your next steps**.

On submit, the stage moves to **Qualified lead**; the owner is emailed their summary and the office gets a notice with
every answer.

## 4. From the result to a paid report

| Step | Who | What happens | Email | Stage or status |
|---|---|---|---|---|
| "Get my full report" | Owner | `businessCheck.requestNext({ choice: "report" })` | Owner: *Payment details for your full business check report*; office: *… asked for the full business check report* | Payment: **requested** |
| Proof sent | Owner | Replies to the email with proof | — | — |
| "Proof received" | Finance or Super Admin | `businessSupport.markProofReceived` | — | Payment: **proof received** |
| "Confirm payment" → "Yes, the money is in" | Finance or Super Admin | `businessSupport.confirmPayment`; a report link is issued | Owner: *Payment received: your full business check report* (with the form link) | Payment: **paid**; report: **awaiting form** |
| Form submitted | Owner | `fullReport.submit`; the report is built and rendered at once | Owner: *Your full business check report: {business}* (PDF attached); office: *Full report sent: {business}* | Report: **delivered** |
| "Send the form link again" | Finance or Super Admin | `businessSupport.resendReportLink`; the old link stops working | Owner: *Your report form* | — |
| "Download the report" | Staff with `manage_client_onboarding` | `businessSupport.downloadReport` | — | — |

The form can be submitted once. After that the same link shows "Your report has been sent" with a download button.

**Interim steps:** "Proof received" and "Confirm payment" are manual only because Paystack is not set up yet. With
Paystack, the owner pays online and the payment confirms itself, with the same emails and status changes; manual
confirmation stays for direct transfers. The same applies to the Current State Assessment payment in section 5.

## 5. From the call to a client account

| Step | Who | What happens | Email | Stage |
|---|---|---|---|---|
| "Book my free call" | Owner | Calendly opens inline with name and email filled in. The call counts as booked only when Calendly confirms; "open in a new tab" also records the request. With no booking page, the button records a request | Office: *… asked for a free discovery call* (Calendly sends the owner its own confirmation) | **Call booked** |
| "Schedule discovery call" | Desk lead | Records the agreed time | — | — |
| "Record call outcome" | Desk lead | **Opportunity** (fit), **Refer** or **Lost** | — | **Opportunity**, **Referred** or **Lost** |
| "Move to" | Desk lead | Any other stage, with a note (for example **Nurture**) | — | As chosen |
| "Send payment details" (Current State Assessment) | Finance or Super Admin | Payment request for ₦500,000 | Owner: *Payment details for your Current State Assessment* | Moves to **Opportunity** if earlier |
| "Proof received", then "Confirm payment" | Finance or Super Admin | Payment confirmed; an invitation is created unless one is pending or accepted | Owner: *Payment received: your Current State Assessment starts* and *Set up your client account on The Shift* | **Won** |
| "Create account" | Owner | `onboarding.accept`: person, credential, business, owner membership and session in one transaction | — | Invitation: **accepted** |

**The 48-hour window:** every payment details email says when to pay by, 48 hours after it was sent (Lagos time).
After that the payment shows "48 hours passed": the team sends the details again (a new window) or moves the business
to Lost. Nothing moves on its own, and money that still arrives can be confirmed.

**Relation to the locked flow in `Instruction.md`:** that flow goes Fit → onboarding invitation. The automatic
invitation follows the Current State Assessment payment instead (the concept note's pay-then-set-up order); a manual invitation
at Fit is still possible.

The desk lead can also send an invitation by hand from **Client Onboarding** ("Invite to onboard") and revoke a pending
one.

## 6. Signing in and where people land

- **Clients** sign in at `/login`. **Staff** sign in at `/admin/login`.
- Landing rule (`landingPathFor`, `shared/auth.ts`): a person with no business membership and at least one platform role
  goes to `/admin`; everyone else goes to `/dashboard`.
- `/dashboard` and the settings pages send a signed-out visitor to `/login`.
- **Invitation link while signed in as someone else:** the page names both email addresses and offers "Sign out and
  continue"; it never sends them to their own area or creates the account under their session. Signed in as the invited
  person: straight to `/dashboard`.
- **Invitation unavailable** (expired, used or revoked): "Invitation unavailable" with a link to `/login`.

## 7. The admin console

`/admin` shows only the tabs a person's permissions allow (`client/src/lib/adminSections.ts`); the server checks every
action again.

| Tab | Permission | What it holds | Actions |
|---|---|---|---|
| **Business Checks** | `manage_client_onboarding` | Metrics (total, completed, call requested, ready to onboard, reports requested); stage filter; search; table with payment chips | Row → detail drawer: contact, the check, findings, outline, recommended support, funnel, **Payments** (send details, proof received, confirm), **Full report** (resend link, download), **Move to** a stage, stage history, next step |
| **Discovery Calls** | `manage_client_onboarding` | Call requests and booked calls | Schedule or reschedule; record outcome (Opportunity, Refer, Lost); "Continue to Client Onboarding" |
| **Client Onboarding** | `manage_client_onboarding` | Metrics (checks, portal users, businesses, memberships, pending links); every check; invitations | "Invite to onboard"; copy the link once; revoke a pending invitation |
| **Engagements** | `view_all_businesses`, or `view_assigned_businesses` for the engagements a person is on | "Paid, but no engagement yet" (desk lead: a paid assessment with no engagement, with "Start engagement"); every engagement in scope: business, stage, team, what the client still owes (overdue in red), next call or calls not booked | Row → drawer: stage; team (add, remove: `assign_engagements`); the one problem; calls (time, link, agenda, client and internal notes, share with the owner or the owner and their team); requests and actions (whose side, person, due date, status, note); deliverables (save, approve: `review_engagements`, share, comment); files on requests and deliverables (open any; attach one as owner-only or for the owner and their team, when storage is set up); the fix (the one number with where it starts and should get to; one check-in a week, in order, with the five questions, the reading, hours by role and AI used). Changes need `manage_engagements` |
| **Clients** | `view_all_businesses` | Onboarded businesses and their members | Read only |
| **Admin Team** | Super Admin (`manage_roles`) | **Staff**: everyone with a role, and invitations that create a staff account with one role; then the legacy administrators | Invite with a role (never Super Admin), copy the link once, revoke; legacy: invite, revoke, edit powers |
| **JUMP Programme (Legacy)** | `view_participants` | JUMP registrations, referrals, scheduling, replies | JUMP-era actions |

## 8. Status models

```mermaid
stateDiagram-v2
  [*] --> lead: details given
  lead --> qualified_lead: check finished
  qualified_lead --> call_booked: call booked or requested
  call_booked --> opportunity: outcome Opportunity, or Current State Assessment details sent
  call_booked --> referred: outcome Refer
  call_booked --> lost: outcome Lost
  opportunity --> won: Current State Assessment payment confirmed
  opportunity --> lost
  lead --> nurture: Move to
  qualified_lead --> nurture: Move to
```

- The first three stages move automatically and only forward; they never overwrite a stage the team has set
  (`advancePipeline`, `shared/businessCheck/pipeline.ts`). The team can move a check to any stage with "Move to".
- **Payment request:** requested → proof received → confirmed (`shared/payments.ts`). A request still awaiting payment
  48 hours after the details went out shows as "48 hours passed" (worked out, not stored).
- **Full report:** awaiting form → delivered (`full_reports.status`).
- **Client invitation:** pending → accepted, revoked or expired (`client_onboarding_invitations`).

## 9. The engagement room

Built on 9 October for the Current State Assessment; live once migration 0008 is applied. The template (data requests, the six
pre-call questions, both call agendas and the findings outline) follows IP Factory's own assessment proposals, cut down
for two weeks and two calls (`shared/engagement.ts`, 10 October). The fix's measure and weekly
check-in screens come next (implementation plan, phase 4).

```mermaid
flowchart TD
  P[Current State Assessment payment confirmed] --> E1[Engagement created from the template: eight data requests due in three working days, both calls with their agendas]
  E1 --> E2[Desk lead names the team in Engagements]
  E1 --> A[Owner accepts the invitation: the engagement joins their business]
  A --> R[Client room on /dashboard]
  E2 --> B[Calls booked on Calendly, recorded with time, link and agenda]
  B --> R
  R -->|I have sent this| T[Team marks it received, or asks for more]
  B --> N[Notes saved: client version and internal version]
  N -->|Share with the owner| R
  D[Deliverable saved as a draft] -->|prescription or plan: desk lead approves| S[Shared with the owner, or the owner and their team]
  D -->|findings, problem statement| S
  S --> R
  R -->|owner| SO[Sign off, comment, share with my team]
```

| The client clicks | What happens | Who can |
|---|---|---|
| "Upload a file" on a request | The browser sends the file straight to the private bucket with a one-off link, then the server records it and the request shows "Sent, we are checking"; a file that did not arrive is not recorded | Owner, full staff, and a contributor for their own requests; only when storage is set up |
| "Download" on a file | The server checks who is asking and issues a five-minute link | Whoever may see the item it sits on, or who uploaded it |
| "I have sent this" / "I sent it another way" (with how they sent it) | The request shows "Sent, we are checking" for the client and the team | Owner, full staff, and a contributor for their own requests |
| "Mark as done" | The action is done | As above |
| "Sign this off" | The deliverable shows signed off for the team; audited | Owner (and business admin) only |
| "Send" a comment | The comment shows under the deliverable for both sides | Anyone who can see the deliverable |
| "Share with my team" / "Keep this to myself" | The owner's staff with full access see it, or stop seeing it | Owner (and business admin) only |
| "Join the call" | Opens the meeting link | Anyone who sees the call |
| The one number we watch (no click: shown once the team sets it) | Where it started, this week's reading, where it is going, and each week's reading with the next step; never the hours or the team's notes | Owner and full-access staff |
| "Invite" in Your team | Emails a single-use link (shown once when email is not set up); the seat counts as used | Owner (and business admin) only; one seat included |
| Change "What they can see" / "Remove" | Full or Contributor at once; Remove ends their access to the business straight away | Owner (and business admin) only |

## 10. Known gaps in today's flow

Found while writing this document. Each is small and listed in the implementation plan.

| Gap | Effect | Fix |
|---|---|---|
| ~~Home's "Client sign in" opens the JUMP participant sign-in~~ | Fixed 9 October: it goes to `/login`; JUMP participants reach their sign-in from `/portal` or the link on `/login` | Done |
| ~~Staff invitations use the legacy Google flow~~ | Fixed 9 October: Admin Team → Staff invites by email with one role; the person sets a password at `/join/:token` | Done (once migration 0008 is applied) |
| The `/admin` gate and side menu still say "Registration Desk" and Gmail | Old wording | Rebrand the labels |
| ~~"Invite to onboard" invites at any stage without a question~~ | Fixed 9 October: before Won it asks to confirm | Done |
| The JUMP "Email selected" button opens nothing | Legacy only | Remove with the JUMP screens |
