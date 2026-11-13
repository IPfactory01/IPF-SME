# 9. Coverage matrix

**Every object in The Shift, every stage of its life, who acts, and where each step lives in the
[App flow](03-app-flow.md) and on the Miro board ("The Shift: App flow by user").** Built on 9 November 2026 from the
code: every server procedure in `server/routers/`, every audit action in `server/audit.ts` and every table in
`drizzle/schema.ts`. Run again at every document review. `test/docs/productDocs.test.ts` fails if a server action is
added without appearing here (section 4 lists every one).

**How to read it.** A row is one stage in the life of one object. **App flow** names the journey step (section 4) or the
reference section (8); **Board** names the section and card. A row with nothing in App flow or Board, or no way to do it
at all, is a gap, numbered **C1** onwards and listed in section 3 with its priority. "Not applicable" is written where a
stage is deliberately absent.

**Life stages checked for every object:** created · seen · changed · shared or released · paid or answered · reminded ·
expired or closed · removed. **Checklist applied to every user:** the first visit, the normal path, what goes wrong, the
end of the relationship; empty, loading, error and partly-done screens; email, WhatsApp and phone; owed, paid, late and
refunded; day 0, the weekly rhythm, day 30 and after the end.

---

## 1. The matrix

### Prospects and the funnel

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Business Health Check | Created | Visitor | `businessCheck.start` (a lead before any business question) | 4.1 #1 | Visitor: Takes the free check | Built |
| | Changed | Visitor | `businessCheck.saveProgress` | 4.1 #2 | Visitor: Takes the free check | Built |
| | Answered | Visitor | `businessCheck.submit`; summary and office emails | 4.1 #3 | Visitor: Sees the result | Built |
| | Seen | Desk | `businessSupport.checks`, `checkDetail` | 8.3 Pipeline | Lead: Holds the Discovery Call | Built |
| | Followed up when not ready | Platform | — | 4.1 #3b | Visitor: Not ready yet | To build (R48) |
| | Not acted on by the desk | Platform | — | 4.9 Visitor to desk | Handoffs: Visitor to desk | **C8** |
| | Stage changed | Desk, platform | `businessSupport.setStage`; automatic first three stages | 5 Pipeline | — | Built |
| | Referred elsewhere | Desk | Stage "Referred" | 5 Pipeline | — | **C9** (nobody is told) |
| | Removed on request | — | Nothing | — | — | **C6** |
| Discovery Call | Booked | Visitor, desk | Calendly; `businessSupport.scheduleCall` | 4.1 #5 | Visitor: Talk to an expert | Built |
| | Held, outcome | Lead | `businessSupport.recordOutcome` | 4.1 #6 | Lead: Holds the Discovery Call | Built |
| | Summary written, shared | Lead | `saveDebrief`, `shareDebrief` | 4.1 #6 | Lead: Holds the Discovery Call | Built |
| Payment request (Full Report; a Business Review link sent before F3) | Created | Visitor (Full Report), Finance | `onlinePayment.start`; `businessSupport.requestPayment` (the Business Review since F3: its fee, below) | 4.1 #4a | Visitor: Buys the Full Report | Built |
| | Paid | Visitor, Paystack | `onlinePayment.status`, the webhook | 4.1 #4a | Platform: Confirms every payment | Built |
| | Confirmed by hand | Finance | `businessSupport.confirmPayment`; every confirmed request is also a payment in the ledger, with its receipt number (F1) | 4.7 #3 | Finance: Confirms or refunds | Built |
| | Expired (48 hours) | Platform | Worked out on read | 5 Payment | — | Built |
| | Superseded (a Business Review link sent before F3) | Platform | Its pay page and confirming by hand stop once the link goes out again as its fee | 3.2 | — | Built (F3) |
| | Refunded | Finance | The Business Review on fees through its fee's payment (F2, F3); the Full Report's own refund comes with orders (R13) | 4.7 #3 | Finance: Confirms or refunds | Partly built |
| Full Report | Intake answered | Buyer | `fullReport.form`, `submit` | 4.1 #4b | Visitor: Full Report emailed | Built |
| | Delivered, downloaded | Buyer, desk | `fullReport.download`; `businessSupport.downloadReport` | 4.1 #4b | Visitor: Full Report emailed | Built |
| | Link sent again | Finance | `businessSupport.resendReportLink` | 6 Emails | — | Built |

### Accounts, businesses and people

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Client invitation | Created | Platform (on payment or New engagement), desk | `onboarding.invite`; `inviteBusinessOwner` | 4.1 #7, 4.3 #2 | Client: Invited to the room | Built |
| | Accepted | Client | `onboarding.accept`, `invitations.accept` | 8.1 `/onboarding`, `/join` | Client: Invited to the room | Built |
| | Revoked, expired, sent again | Desk | `onboarding.revoke`, `sendSignInLink` | 7 Exceptions | — | Built |
| Staff invitation | Created | Super Admin | `invitations.staff.invite` (by level) | 4.8 | Super Admin: Invites by level | Built |
| | Created by a lead for their engagement | — | Not possible | 4.6 | Specialist: Invited with an end date | **C2** |
| | Revoked, accepted | Super Admin, invitee | `invitations.staff.revoke`, `accept` | 4.8 | — | Built |
| Seat (the owner's staff) | Invited, access set, removed | Owner | `invitations.seats.invite`, `setAccess`, `remove`, `revoke` | 4.4 #8 | Client's staff: Invited, Given their access | Built |
| Account | Signed in, two-step, signed out | Everyone | `account.signIn`, `signInInternal`, `verifyTwoStep`, `signOut` | 8.2 | — | Built |
| | Password reset | The person, a manager | `account.requestReset`, `resetPassword`; `people.issuePasswordReset` | 8.2, 7 | — | Built (sign-in links later, R41) |
| | Profile, password changed | The person | `account.updateProfile`, `changePassword` | 8.1 `/settings/account` | — | Built |
| | Suspended, reinstated, access removed, two-step reset | `manage_users` | `people.removeAccess`, `resetTwoStep`; account recovery | 4.8 | Super Admin: Suspends or removes, Resets two-step | Built |
| | Data exported or erased on request | — | Nothing | — | — | **C6** |
| Business | Created | Platform | Onboarding accept; `createDirect` | 4.3 #2 | Client: Invited to the room | Built |
| | Changed | Owner, business admin | `account.updateBusiness` | 8.1 `/settings/business` | — | Built |
| | Owner changed (sold, handed over) | — | Not possible | — | — | **C15** |
| Level and role | Given, changed, ended | Super Admin | `platformRoles.grant`, `setLevel`, `revoke`; end date | 4.8 | Super Admin: Invites by level, Sets levels | Built |
| | End date approaching | — | Nobody is told | 4.6 | Specialist: Access ends | **C17** |

### Engagements and delivery

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Engagement | Created | Platform (Business Review paid), lead | `startEngagement`; `staff.start`; `staff.createDirect` | 4.1 #7, 4.3 | Lead: Opens the engagement | Built |
| | Payment terms set | Lead | — | 3, 4.3 #2 | Lead: Sets payment terms | To build (R36) |
| | Seen by the team, previewed as client | Team | `staff.list`, `detail`, `previewRoom` | 8.3 | Lead, Analyst: Starts from My projects | Built |
| | What needs each person today | Team | `staff.today` | 8.3 | Lead, Analyst, Specialist: Starts the day from Today | Built (R52) |
| | Seen by the client | Client | `client.room` | 4.4 #0–#1 | Client: First visit | Built (first visit R46) |
| | Stage changed, problem set | Lead | `staff.setStage`, `saveProblem` | 5 Engagement | — | Built |
| | Opened before payment | Partner or Super Admin | `staff.openRoomNow` | 4.3 #3 | Partner: opens a room before payment | Built |
| | Paid in arrears, kickoff moved | Partner or Super Admin | `staff.setFeeTiming` | 3, 4.3 #3 | Partner: pays a Digital Marketing client in arrears | Built (R74) |
| | Paused, resumed | Platform, lead | — | 4.4 #7b | Client: Late: work pauses | To build (R51) |
| | Closed with its result | Lead | `staff.setStage` (closed, no result recorded) | 4.5 #1 | Lead: Closes the engagement | Partly built (R26) |
| | Archived or deleted when opened by mistake | — | Not possible | — | — | **C7** |
| Team assignment | Added, role changed | Lead with `assign_engagements` | `staff.assign` (emailed) | 4.6 | Lead: Staffs the team | Built |
| | Received by the person added | Team member | The email; My projects | 4.6 | Specialist journey has no step | **C1** |
| | Removed | Lead | `staff.removeMember` | 4.6 | — | Built (their items move: R51) |
| Session | Created, booked, held, cancelled | Lead; client on Calendly | `staff.saveSession`; Calendly sync | 4.4 #2 | Client: Books the kickoff | Built |
| | Everyone on the engagement emailed, with a calendar invitation | Platform | `staff.saveSession`; Calendly sync (`server/sessionInvitations.ts`) | 6 | Team: hears of a Session | Built (R75) |
| | Booked from Zoom, any kind, one date or a recurring series | Lead | `staff.bookMeeting` | 4.4 #2b | Lead: books every meeting one way | Built (R81) |
| | Reminded before it starts | — | Nothing | — | — | **C3** |
| | Notes saved, shared; audience chosen | Lead; owner | `staff.saveNotes`, `shareNotes`; `client.setAudience` | 4.4 #2 | Lead: Shares notes the same day | Built |
| Data Request item and action | Created | Platform, team, Specialist (team side) | Loaded with the type; `staff.saveTask`, `loadDataRequest` | 4.3 #2, 4.6 | Analyst: Keeps the Work Plan current | Built |
| | Answered | Client | `client.respondToTask`, `setNotAvailable`, `answerWithLink` (a shared-folder link), uploads (voice notes too) | 4.4 #3 | Client: Sends records | Built; Send on WhatsApp to {name} with R44 |
| | Checked | Team | `staff.saveTask` (status) | 4.4 #3 | Analyst: Matches client files | Built |
| | Reminded | Platform | — | 4.4 #3 | Client: Reminded before and after | To build (R16) |
| | Asked for by a team member, with a brief, a due day and any clock | Team member | `staff.askClient`; the brief through `staff.requestUpload`, `confirmUpload` | 4.4 #3b, 4.9 | Content Producer: asks for footage | Built (R78) |
| | Discussed, both ways, each message emailed | Client, team | `client.taskComment`, `staff.taskComment` | 4.4 #3b | Client: replies in the room, not on WhatsApp | Built (R78) |
| | Its First edit shared against the clock | Team | `staff.followUpShared`; the clock starts when it arrives (`respondToTask`, `answerWithLink`, uploads, `matchFile`, `saveTask`) | 4.4 #3b | Content Producer: edits within 48 hours | Built (R78) |
| File | Uploaded by the client (item or drop box) | Client | `client.requestUpload`, `confirmUpload`, `requestDrop`, `confirmDrop` | 4.4 #3 | Client: Sends records | Built |
| | Uploaded by the team, a Specialist's draft, a request's brief | Team | `staff.requestUpload`, `confirmUpload` | 4.6 | Specialist: Hands in drafts | Built (the brief: R78) |
| | Matched, shared, opened | Team; client | `staff.matchFile`, `shareFile`, `fileLink`; `client.fileLink` | 4.4 #3 | Analyst: Matches client files | Built |
| | Removed (a wrong or private file) | Client (their own, until taken in); team with a reason | `client.removeFile`, `staff.removeFile`; the stored file is deleted | 7 Exceptions | — | Built (R61; C5 fixed) |
| Deliverable | Drafted, approved, shared | Team, lead | `staff.saveDeliverable`, `approveDeliverable`, `shareDeliverable` | 4.4 #5 | Lead: Approves Deliverables | Built |
| | Commented, signed off | Client, team | `client.comment`, `client.accept`; `staff.comment` | 4.4 #5 | Client: Approves the work | Built |
| | Changes asked for | Client | — | 4.4 #5 | — | To build (R51) |
| Content piece | Planned, edited, sent for approval, published, deleted | Team | `staff.saveContent`, `deleteContent` | 4.4 #4 | Digital marketing team | Built |
| | Approved or sent back | Owner | `client.respondToContent` | 4.4 #4 | Client: Approves on a phone | Built (on a phone: R54) |
| Measure and check-in | Set, recorded weekly, seen | Team; client | `staff.saveMeasure`, `saveCheckin` | 4.4 #6 | Analyst: Records the weekly check-in | Built |

### Money

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Fee | Created | Platform, team | Filled in when the engagement opens; `staff.saveFees` | 3, 4.3 | Lead: Opens the engagement | Built |
| | The Business Review's two halves, with its engagement | Finance | `businessSupport.requestPayment` opens the engagement waiting for its first payment and bills the first half; its first payment wins the check, loads the plan and invites the owner (`server/businessReview.ts`) | 3.2, 4.1 #7 | Platform: Confirms every payment | Built (F3) |
| | Link sent | Team, Finance | `staff.sendFeeLink` | 4.3 #3 | Platform: Sends reminders | Built (on a schedule: R12) |
| | Paid online, for what is left | Client, Paystack | `onlinePayment.feePage`, `feeStart`, the webhook; each attempt a row in `payments` | 4.4 #7, 3.1 | Client: Pays each fee | Built (part payments with F1) |
| | Paid by hand, in part or in full | Finance, Super Admin | `finance.recordPayment` (`manage_payments`); the Paid tick is retired | 4.7 #4, 3.1 | Finance: Records money paid offline | Built (F1, 10 November 2026) |
| | Payment recorded by mistake | Finance, Super Admin | `finance.cancelPayment`: kept, marked cancelled, with its receipt number | 4.7 #4, 3.1 | Finance: Corrects a mistake | Built (F1) |
| | Needs a look, then accepted | Paystack; Finance | The webhook keeps it as `needs_a_look`; `finance.acceptPayment` once it fits | 4.7 #2, 3.1 | Finance: Confirms or refunds | Built (F1) |
| | Billed: invoice number | Platform | The first link emailed, or a payment started or recorded; a billed fee cannot be removed | 3.1 | Finance: Receipts and invoices | Built (F1) |
| | Reminded, late | Platform | — | 4.4 #7 | Platform: Sends reminders | To build (R12) |
| | Receipt and invoice as documents | Platform | Numbers built (F1): every receipt email names its number; the PDFs to build | 4.4 #7 | Finance: Receipts and invoices | To build (R53) |
| | Refunded, in part or in full | Finance, Super Admin | `finance.recordRefund` after refunding in Paystack or the bank; `finance.cancelRefund` for one recorded by mistake | 4.7 #3, 3.1 | Finance: Confirms or refunds | Built (F2) |
| | Written off, or reversed | Partner, Super Admin | `finance.writeOff`, `finance.reverseWriteOff` (`write_off_fees`) | 4.7 #6, 3.1 | Partner: Writes off | Built (F2) |
| Finance view | Seen | `view_financials` | `engagement.finance.list`: paid (real money in, less refunds; test payments apart), owed and late, all from the ledger | 4.7 #1 | Finance: Opens Finance | Built (F4 from one source) |
| | Money in: each payment opened to its fee or request, and reconciled against Paystack | Finance | `engagement.finance.list` (`moneyIn`); narrowed by month, how it came and a reference, and downloaded as a spreadsheet in the browser (`MoneyIn.tsx`, `client/src/lib/csv.ts`) | 4.7 #1, #5 | Finance: Opens Finance | Built (F4) |
| Service request ("Fix the next problem") | Asked for | Client | `client.requestService` (office emailed) | 4.5 #3 | Client: Buys the next fix | Built |
| | Handled or declined | Desk | `staff.handleRequest` | 4.5 #3 | — | Built; **C4** (the client is not told) |

### The record of what happened

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Audit log | Written | Platform | `recordAudit`, 90 actions in use (6 more retired), each listed in the [Backend schema](05-backend-schema.md) | — | — | Built |
| | Read | Desk (a check's history only) | `stageHistoryFor` in `server/businessSupportAdmin.ts` | 8.3 Pipeline | — | **C10** (no view of who did what elsewhere) |
| Email delivery | Recorded, seen | Platform; desk | `businessSupport.emailDeliveryStatus` | 6 | Super Admin: Watches System status | Built |
| | Did not arrive (failed, bounced or suppressed), then dealt with | Platform; desk | `businessSupport.failedEmails`, `businessSupport.emailsDealtWith`: listed at the top of Pipeline for 30 days until marked dealt with (G3, R42) | 7 | Super Admin: Watches System status | Built (G3) |
| Paystack notification | Not processed (500), the office told once per reference | Platform | The webhook (`server/onlinePayment.ts`) | 7 | Platform: Confirms every payment | Built (G3) |

## 2. What the checklist found beyond the matrix

| Check | Finding |
|---|---|
| First visit | Covered by R46 (the welcome) |
| What goes wrong | Pause, changes asked for, refunds, a leaver's items: R51. A wrong file cannot be removed: **C5** |
| End of the relationship | Close and Day-30 Review: R26, R27. A business changing hands: **C15** |
| Empty, loading, error, partly-done screens | Audited in the design brief review (9 November 2026): 31 of 33 data reads never retry and only 5 say anything when they fail, so a dropped connection looks empty (B2). The Design brief (section 5) sets the four states; R69 built them on 9 November 2026 |
| Channels | WhatsApp: R44. Session reminders by any channel: **C3** |
| Money | Owed, paid in part or in full, late, refunded, written off: built (the ledger, F1 and F2) or R12 |
| Day 0, weekly, day 30, after the end | Day 0: R46. Weekly: check-ins built, Session reminders **C3**. Day 30: R27 |
| Code left over | The unused JUMP email templates (the 24-hour Session reminder among them) were removed on 9 November 2026: **C12** fixed. The older administrator password reset said *Reset your JUMP administrator password* and went out from the JUMP mailbox: **C19**, fixed the same day (every email now goes out as IP Factory). A JUMP-era Google Calendar helper (`server/calendar.ts`) has no caller and stays until the calendar work |
| Permissions | Five permissions are declared but no action checks them (`manage_businesses`, `manage_scheduling`, `manage_communications`, `manage_admins`, `manage_platform_settings`): **C18** |

## 3. Gaps found

**Priority:** P1 blocks a live client or puts money or trust at risk now; P2 moves a pilot measure or a legal duty; P3
improves the product. **Effort:** S is days, M about a week.

| # | Gap | Why it matters | P | Effort | Requirement |
|---|---|---|---|---|---|
| C1 | The Specialist's journey does not show being added to an engagement | The person added is told by email, but the journey (App flow 4.6, the board) skips the step | P2 | S (documents only) | Fixed in this review |
| C2 | A lead cannot invite a colleague or Specialist from the engagement: the Super Admin must invite first, then the lead adds them | A handoff that stalls staffing | P2 | S | R58 |
| C3 | No Session reminders, to the client or the team | Missed Sessions cost the team's hours and the client's progress; weekly check-ins depend on them | P2 | S (with the reminder engine) | R59 |
| C4 | A client who asks for the next fix is not told when it is handled or declined | Silence after asking to buy loses the sale | P2 | S | R60 |
| C5 | Nobody can remove a file: a client who uploads the wrong file, or a private one, cannot take it back | Trust and data protection | P2 | S | Fixed with R61 (9 November 2026) |
| C6 | No way to export or erase a person's data when they ask | A duty under the Nigeria Data Protection Act 2023 | P2 | M | R62 |
| C7 | An engagement opened by mistake cannot be archived or deleted | Clutter in the team's lists and the client's projects | P3 | S | R63 |
| C8 | Nobody is alerted when a finished check or a booked call is not followed up | The "same working day" handoff has no signal | P2 | S | R64 |
| C9 | A lead marked Referred (to Enzo Krypton & Co.) reaches nobody | A referral that goes nowhere | P3 | S | R65 |
| C10 | The audit log is written for 88 actions but readable only as a check's history | The Super Admin cannot see who recorded a payment by hand, cancelled one, opened a room early or removed access | P3 | M | R66 |
| C12 | Unused JUMP-era email templates remained in the code | Dead code with the wrong wording | P3 | S | Fixed: removed on 9 November 2026 |
| C15 | A business cannot change its owner | A sale or a handover locks the business to the first owner | P3 | M | R67 |
| C17 | Nobody is told before a Specialist's access ends | Work stops mid-engagement without warning | P3 | S | R68 |
| C18 | Five permissions are declared and granted but no action checks them | A permission that checks nothing reads as a control that is not there; `manage_admins` and `manage_platform_settings` are Super Admin only, so nothing is exposed today | P3 | S | To decide: wire each to its screen when built, or remove it |
| C19 | The older administrator password reset email and its messages said JUMP (`BRAND.programmeShortName`), and the email went out from the JUMP mailbox and layout | The wrong name and sender in front of staff | P3 | S | Fixed on 9 November 2026: one sender (IP Factory) for every email; `test/shared/brand.test.ts` fails if a page, email or message reads the JUMP names again |

(C11, C13, C14 and C16 were checked and found covered; the numbers are kept so the register stays stable.)

## 4. Every server action, and the check on it

Every tRPC procedure in `appRouter` (`server/routers.ts`), grouped by what it acts on. **Who may call** is the server's
own check: authentication, then the permission, then the scope (which business or engagement). Hiding a button is never
the check. The last column names the object in section 1 it belongs to. `test/docs/productDocs.test.ts` fails if a
procedure is added without appearing here.

Outside tRPC: `GET /api/health`; `POST /api/paystack/webhook` and `POST /api/resend/webhook` (each checks the
provider's signature); the storage proxy and the older OAuth callback. Every other `/api` request must come from a
trusted browser origin.

### Platform and the older admin password

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `system.health` | Answers that the server is up | Public | — |
| `system.notifyOwner` | Sends the platform owner a notice | The internal area | — |
| `auth.me`, `auth.logout` | The older platform session: who is signed in; signs out of it and of the account session | Public | Account |
| `adminAccess.status`, `adminAccess.enrollOwnerPassword`, `adminAccess.verifyPassword`, `adminAccess.requestPasswordReset`, `adminAccess.logoutPassword` | The older administrator password: its status, set by the owner, checked, a reset email, sign out | A platform session; setting it, the owner's email only | Account |
| `adminAccess.confirmPasswordReset` | Sets the new administrator password from the emailed link | Public, by a single-use link | Account |
| `adminAccess.previewAs`, `adminAccess.endPreview` | Preview as a team member (R76): opens Admin as that person sees it for 30 minutes, every change refused meanwhile, recorded; close it | Start: the Super Admin only, never from inside a preview, never as another Super Admin; close: whoever holds the preview | Account |

### The public funnel

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `businessCheck.prices` | The prices the site shows, the same figures payments are created with | Public, read only | Business Health Check |
| `businessCheck.start`, `businessCheck.saveProgress`, `businessCheck.submit` | Starts the check (a lead before the first question), saves it, finishes it and sends the emails | Public, by the check's token; rate-limited | Business Health Check |
| `businessCheck.requestNext` | The owner asks for the free call or the Full Report from the result | Public, by the check's token | Discovery Call, Payment request |
| `onlinePayment.page`, `onlinePayment.start`, `onlinePayment.status` | The pay page for the Full Report or Business Review; opens Paystack; the result on return | Public, by the check's token; rate-limited | Payment request |
| `onlinePayment.feePage`, `onlinePayment.feeStart` | The pay page for one fee; opens Paystack | Public, by the fee's signed link; rate-limited | Fee |
| `fullReport.form`, `fullReport.submit`, `fullReport.download` | The Report Intake, its answers, the report's download | Public, by the report's token | Full Report |

### Accounts, invitations and people

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `account.signIn`, `account.signInInternal`, `account.verifyTwoStep`, `account.signOut`, `account.me` | Signs in a client, or staff with two-step; checks the code; signs out; who is signed in | Public; rate-limited; locked after five wrong passwords | Account |
| `account.requestReset`, `account.resetPreview`, `account.resetPassword` | "Forgot your password?": the email, the link checked, the new password | Public, by a single-use link; the same answer whether or not the account exists | Account |
| `account.workspace`, `account.switchWorkspace`, `account.business`, `account.updateBusiness`, `account.updateProfile`, `account.changePassword` | The businesses the person belongs to and the one in use; the business; the profile; the password | Signed in; a business is changed by its owner or business admin | Account, Business |
| `account.whatsapp`, `account.setWhatsapp` | A staff member's own WhatsApp number, and their agreement to it being shown to the clients of their engagements (R44) | Signed in, with an internal role | Account |
| `onboarding.preview`, `onboarding.accept` | The invited client opens and accepts the link; their account and business are created | Public, by a single-use link bound to the email | Client invitation |
| `onboarding.candidates`, `onboarding.invitations`, `onboarding.metrics`, `onboarding.invite`, `onboarding.sendSignInLink`, `onboarding.revoke` | Who may be invited; the invitations and their state; invite (with a reason before payment); send a sign-in link; revoke | `manage_client_onboarding` | Client invitation |
| `invitations.preview`, `invitations.accept` | Opens and accepts a staff, owner or seat invitation | Public, by a single-use link bound to the email | Staff invitation, Seat |
| `invitations.staff.team`, `invitations.staff.list`, `invitations.staff.invite`, `invitations.staff.revoke` | Everyone by level; staff invitations; invite by level; revoke | `manage_roles`; never a Super Admin | Staff invitation |
| `invitations.seats.list`, `invitations.seats.invite`, `invitations.seats.revoke`, `invitations.seats.remove`, `invitations.seats.setAccess` | The owner's staff: list, invite, revoke, remove, full access or contributor | Signed in as the owner or a business admin of the business in use; within the seats included | Seat |
| `platformRoles.list`, `platformRoles.grant`, `platformRoles.setLevel`, `platformRoles.revoke` | Roles and levels: list, give (with an end date), set a level, take away | `manage_roles`; only roles below one's own | Level and role |
| `people.list`, `people.issuePasswordReset`, `people.setStatus`, `people.setJobTitle`, `people.removeAccess`, `people.resetTwoStep` | Accounts: list, a reset link, suspend or reinstate, the firm title, remove access, reset two-step | `manage_users` | Account |
| `people.setWhatsapp` | Set or correct a staff member's WhatsApp number; a changed number waits for their own agreement (R44) | `manage_users` | Account |

### The Pipeline and payment requests

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `businessSupport.checks`, `businessSupport.checkDetail`, `businessSupport.setStage`, `businessSupport.downloadReport`, `businessSupport.emailDeliveryStatus` | Every check; one check with its history; its stage; a report's file; email delivery | `manage_client_onboarding` | Business Health Check, Full Report, Email delivery |
| `businessSupport.failedEmails`, `businessSupport.emailsDealtWith` | Emails to clients and prospects that did not arrive in the last 30 days, at the top of Pipeline; mark one or several dealt with (G3) | `manage_client_onboarding` | Email delivery |
| `businessSupport.discoveryCalls`, `businessSupport.scheduleCall`, `businessSupport.recordOutcome`, `businessSupport.debrief`, `businessSupport.saveDebrief`, `businessSupport.shareDebrief` | Discovery Calls: list, set a time, record the outcome; the call summary, saved and shared | `manage_client_onboarding` | Discovery Call |
| `businessSupport.clients` | Businesses and their members | `view_all_businesses` | Business |
| `businessSupport.requestPayment`, `businessSupport.confirmPayment`, `businessSupport.resendReportLink`, `businessSupport.resendPaymentConfirmation` | Send payment details (the Business Review's opens its engagement with its fees, F3); confirm money by hand (never for a Business Review link sent before F3 once it is on fees); send the Report Intake link or the receipt again | `manage_payments` | Payment request, Fee, Full Report |

### Engagements: the team's side

Every action here needs the internal area and `view_all_businesses` or `view_assigned_businesses`; an engagement the
person is not on is not found unless they see every engagement.

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `engagement.staff.list`, `engagement.staff.detail`, `engagement.staff.previewRoom`, `engagement.staff.storageStatus` | My projects and every engagement in scope; one engagement; Preview as client (logged); whether file storage is on | Entry only | Engagement |
| `engagement.staff.today` | Today (R52): what needs this person across the engagements they are on | Entry only; their own team rows | Engagement |
| `engagement.staff.assignByRole` | Assign by role (R88): team items with no one go to the person in their plan role, else the main contact | The lead, or `assign_engagements` | Engagement |
| `engagement.staff.handIn` | Ready for review (R86): the person a team item is for hands it in; the lead is emailed | Their own team item | Engagement |
| `engagement.staff.awaitingStart`, `engagement.staff.start`, `engagement.staff.clientBusinesses`, `engagement.staff.createDirect` | Paid with no engagement yet, and starting it; the businesses a new engagement can be for; New engagement | `view_all_businesses` and `manage_engagements` | Engagement |
| `engagement.staff.setStage`, `engagement.staff.saveProblem` | The stage; the one problem and its statement | `manage_engagements` | Engagement |
| `engagement.staff.assignableStaff`, `engagement.staff.assign`, `engagement.staff.removeMember` | Who can be added; add with a project role (emailed); take off | `assign_engagements` | Team assignment |
| `engagement.staff.bookMeeting` | Book a meeting from Zoom (R81): its kind, the dates read from the pasted invitation (all of a recurring one), the Join link; fills the plan's Session of that kind or adds one, moves the same Zoom meeting pasted again; emails everyone | `manage_engagements` | Session |
| `engagement.staff.saveSession`, `engagement.staff.saveNotes`, `engagement.staff.shareNotes` | Sessions (a new time, length, link or title, or a cancellation, emails everyone on the engagement, R75); their notes; share the client notes | `manage_engagements`; internal notes also need `manage_engagements` or `review_engagements` to read | Session |
| `engagement.staff.saveTask`, `engagement.staff.loadDataRequest`, `engagement.staff.addMissingPlan` | Work Plan items; load a Data Request; add what the current Digital Marketing plan has and the engagement lacks, dated from its kickoff (R77) | `manage_engagements`; team-side items also `contribute_engagements` | Data Request item |
| `engagement.staff.requestUpload`, `engagement.staff.confirmUpload`, `engagement.staff.fileLink`, `engagement.staff.shareFile`, `engagement.staff.matchFile` | Upload (a signed address, then the record once the file exists); open; share with the client; match a drop-box file to its requests | `manage_engagements`; drafts, and the brief on a request the person made (R78), also `contribute_engagements` | File |
| `engagement.staff.askClient`, `engagement.staff.taskComment`, `engagement.staff.followUpShared` | Ask the client for something (R78): what, a brief, the day (never sooner than two days) and any clock, one request a week per person on an engagement unless they approve on it, the owner emailed; write in a client item's conversation, emailed to the client; record the First edit or draft as shared, emailed to the owner | `manage_engagements` or `contribute_engagements`, on an engagement the person is on; a Specialist writes and records only on a request they made | Data Request item |
| `engagement.staff.removeFile` | Remove any file on the engagement (a wrong or private one), with the reason recorded; the stored file is deleted | `manage_engagements` | File |
| `engagement.staff.saveDeliverable`, `engagement.staff.approveDeliverable`, `engagement.staff.shareDeliverable`, `engagement.staff.comment` | Draft, approve, share, comment | Draft and share: `manage_engagements`; approve: `review_engagements`, or leading the engagement | Deliverable |
| `engagement.staff.saveContent`, `engagement.staff.deleteContent` | Plan, edit, send for approval, publish or delete a content piece | `manage_engagements` | Content piece |
| `engagement.staff.saveMeasure`, `engagement.staff.saveCheckin` | The Measure of Success; the Weekly Check-in | `manage_engagements` | Measure and check-in |
| `engagement.staff.fees`, `engagement.staff.saveFees`, `engagement.staff.openRoomNow`, `engagement.staff.setFeeTiming`, `engagement.staff.sendFeeLink` | Read the fees, with what is paid and left and each payment (its notes only with `view_financials`); change them in place, never removing a billed fee; open the room before payment; pay a Digital Marketing client in arrears or in advance, from its kickoff date (R74); send a pay link | Read: `manage_engagements`, `review_engagements` or `view_financials`; change: `manage_engagements`; open early, move the first fee or pay in arrears: also `approve_work_before_payment`; link: `manage_engagements` or `manage_payments` | Fee |
| `engagement.staff.serviceRequests`, `engagement.staff.handleRequest` | Clients asking for another service; handle or decline | `view_all_businesses` and `manage_engagements` | Service request |
| `engagement.finance.list` | Finance: paid, owed and late across every client, from the ledger; payments that need a look; Money in, every payment that counts with its fee or request, receipt number and Paystack reference, test payments apart (F4) | `view_financials` | Finance view |
| `engagement.finance.recordPayment`, `engagement.finance.cancelPayment`, `engagement.finance.acceptPayment` | Record money that came another way, in part or in full; cancel one recorded by mistake (kept, marked cancelled); accept a Paystack payment that needs a look once it fits | `manage_payments` (Finance and the Super Admin, ET 10 November 2026), on any fee | Fee |
| `engagement.finance.recordRefund`, `engagement.finance.cancelRefund` | Record a refund against a fee's payment, never more than is left of it; cancel one recorded by mistake (kept, marked cancelled) | `manage_payments`, on any fee | Fee |
| `engagement.finance.writeOff`, `engagement.finance.reverseWriteOff` | Write off what is left of a fee, with a note; reverse a write-off, with a reason | `write_off_fees` (a Partner or the Super Admin) | Fee |

### Engagements: the client's side

Every action here needs an account session and acts only on the engagement of the business in use, and only on what
was shared with the person; none accepts a business id. "The owner" includes a business admin.

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `engagement.client.room` | The room | Anyone in the business | Engagement |
| `engagement.client.respondToTask`, `engagement.client.setNotAvailable`, `engagement.client.requestUpload`, `engagement.client.confirmUpload`, `engagement.client.fileLink` | Answer a request, mark a record not available, upload to it, open a file | Anyone in the business; a contributor, only their own items | Data Request item, File |
| `engagement.client.requestDrop`, `engagement.client.confirmDrop` | Upload to the drop box | Anyone in the business | File |
| `engagement.client.answerWithLink` | Answer an item with a link to a shared folder (footage, large records); only the link is kept | Anyone in the business; a contributor, only their own items | Data Request item |
| `engagement.client.taskComment` | Write in the conversation on an item the client is asked for (R78), emailed to the person who asked | Anyone in the business who can see the item; a contributor, only their own items | Data Request item |
| `engagement.client.removeFile` | Take back a file the person sent, until the team has matched it or accepted its item; the stored file is deleted | The person who sent it | File |
| `engagement.client.comment`, `engagement.client.accept` | Comment on a Deliverable; Sign-off | Those who can see it; Sign-off by the owner | Deliverable |
| `engagement.client.respondToContent` | Approve a content piece or send it back | The owner and full access | Content piece |
| `engagement.client.setAudience` | Choose who in the business sees an item | The owner | Session |
| `engagement.client.requestService` | Ask for another service ("Fix the next problem") | Anyone in the business, for their own business | Service request |
