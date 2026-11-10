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
| Payment request (Full Report, Business Review) | Created | Visitor (Full Report), Finance | `onlinePayment.start`; `businessSupport.requestPayment` | 4.1 #4a, #7 | Visitor: Buys the Full Report | Built |
| | Paid | Visitor, Paystack | `onlinePayment.status`, the webhook | 4.1 #4a | Platform: Confirms every payment | Built |
| | Confirmed by hand | Finance | `businessSupport.confirmPayment` | 4.7 #3 | Finance: Confirms or refunds | Built |
| | Expired (48 hours) | Platform | Worked out on read | 5 Payment | — | Built |
| | Refunded | — | Not recorded | 4.7 #3 | Finance: Confirms or refunds | To build (R37) |
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
| | Seen by the client | Client | `client.room` | 4.4 #0–#1 | Client: First visit | Built (first visit R46) |
| | Stage changed, problem set | Lead | `staff.setStage`, `saveProblem` | 5 Engagement | — | Built |
| | Opened before payment | Partner or Super Admin | `staff.openRoomNow` | 4.3 #3 | Partner: opens a room before payment | Built |
| | Paused, resumed | Platform, lead | — | 4.4 #7b | Client: Late: work pauses | To build (R51) |
| | Closed with its result | Lead | `staff.setStage` (closed, no result recorded) | 4.5 #1 | Lead: Closes the engagement | Partly built (R26) |
| | Archived or deleted when opened by mistake | — | Not possible | — | — | **C7** |
| Team assignment | Added, role changed | Lead with `assign_engagements` | `staff.assign` (emailed) | 4.6 | Lead: Staffs the team | Built |
| | Received by the person added | Team member | The email; My projects | 4.6 | Specialist journey has no step | **C1** |
| | Removed | Lead | `staff.removeMember` | 4.6 | — | Built (their items move: R51) |
| Session | Created, booked, held, cancelled | Lead; client on Calendly | `staff.saveSession`; Calendly sync | 4.4 #2 | Client: Books the kickoff | Built |
| | Reminded before it starts | — | Nothing | — | — | **C3** |
| | Notes saved, shared; audience chosen | Lead; owner | `staff.saveNotes`, `shareNotes`; `client.setAudience` | 4.4 #2 | Lead: Shares notes the same day | Built |
| Data Request item and action | Created | Platform, team, Specialist (team side) | Loaded with the type; `staff.saveTask`, `loadDataRequest` | 4.3 #2, 4.6 | Analyst: Keeps the Work Plan current | Built |
| | Answered | Client | `client.respondToTask`, `setNotAvailable`, `answerWithLink` (a shared-folder link), uploads (voice notes too) | 4.4 #3 | Client: Sends records | Built; Send on WhatsApp to {name} with R44 |
| | Checked | Team | `staff.saveTask` (status) | 4.4 #3 | Analyst: Matches client files | Built |
| | Reminded | Platform | — | 4.4 #3 | Client: Reminded before and after | To build (R16) |
| File | Uploaded by the client (item or drop box) | Client | `client.requestUpload`, `confirmUpload`, `requestDrop`, `confirmDrop` | 4.4 #3 | Client: Sends records | Built |
| | Uploaded by the team, a Specialist's draft | Team | `staff.requestUpload`, `confirmUpload` | 4.6 | Specialist: Hands in drafts | Built |
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
| | Link sent | Team, Finance | `staff.sendFeeLink` | 4.3 #3 | Platform: Sends reminders | Built (on a schedule: R12) |
| | Paid online | Client, Paystack | `onlinePayment.feePage`, `feeStart`, the webhook | 4.4 #7 | Client: Pays each fee | Built |
| | Paid by hand | Team | `staff.setFeePaid` | 4.7 | Analyst: Records money paid offline | Built |
| | Reminded, late | Platform | — | 4.4 #7 | Platform: Sends reminders | To build (R12) |
| | Receipt and invoice as documents | Platform | Email only | 4.4 #7 | Finance: Receipts and invoices | To build (R53) |
| | Refunded | — | Not recorded | 4.7 | Finance: Confirms or refunds | To build (R37, R51) |
| Finance view | Seen | `view_financials` | `engagement.finance.list` | 4.7 #1 | Finance: Opens Finance | Built |
| Service request ("Fix the next problem") | Asked for | Client | `client.requestService` (office emailed) | 4.5 #3 | Client: Buys the next fix | Built |
| | Handled or declined | Desk | `staff.handleRequest` | 4.5 #3 | — | Built; **C4** (the client is not told) |

### The record of what happened

| Object | Stage | Who | How (in the code) | App flow | Board | Status |
|---|---|---|---|---|---|---|
| Audit log | Written | Platform | `recordAudit`, 79 actions in use (5 more retired), each listed in the [Backend schema](05-backend-schema.md) | — | — | Built |
| | Read | Desk (a check's history only) | `stageHistoryFor` in `server/businessSupportAdmin.ts` | 8.3 Pipeline | — | **C10** (no view of who did what elsewhere) |
| Email delivery | Recorded, seen | Platform; desk | `businessSupport.emailDeliveryStatus` | 6 | Super Admin: Watches System status | Built |

## 2. What the checklist found beyond the matrix

| Check | Finding |
|---|---|
| First visit | Covered by R46 (the welcome) |
| What goes wrong | Pause, changes asked for, refunds, a leaver's items: R51. A wrong file cannot be removed: **C5** |
| End of the relationship | Close and Day-30 Review: R26, R27. A business changing hands: **C15** |
| Empty, loading, error, partly-done screens | Audited in the design brief review (9 November 2026): 31 of 33 data reads never retry and only 5 say anything when they fail, so a dropped connection looks empty (B2). The Design brief (section 5) sets the four states; R69 built them on 9 November 2026 |
| Channels | WhatsApp: R44. Session reminders by any channel: **C3** |
| Money | Owed, paid, late: built or R12. Refunded: R37 |
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
| C10 | The audit log is written for 79 actions but readable only as a check's history | The Super Admin cannot see who marked a fee paid by hand, opened a room early or removed access | P3 | M | R66 |
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
| `businessSupport.discoveryCalls`, `businessSupport.scheduleCall`, `businessSupport.recordOutcome`, `businessSupport.debrief`, `businessSupport.saveDebrief`, `businessSupport.shareDebrief` | Discovery Calls: list, set a time, record the outcome; the call summary, saved and shared | `manage_client_onboarding` | Discovery Call |
| `businessSupport.clients` | Businesses and their members | `view_all_businesses` | Business |
| `businessSupport.requestPayment`, `businessSupport.confirmPayment`, `businessSupport.resendReportLink`, `businessSupport.resendPaymentConfirmation` | Send payment details; confirm money by hand; send the Report Intake link or the receipt again | `manage_payments` | Payment request, Full Report |

### Engagements: the team's side

Every action here needs the internal area and `view_all_businesses` or `view_assigned_businesses`; an engagement the
person is not on is not found unless they see every engagement.

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `engagement.staff.list`, `engagement.staff.detail`, `engagement.staff.previewRoom`, `engagement.staff.storageStatus` | My projects and every engagement in scope; one engagement; Preview as client (logged); whether file storage is on | Entry only | Engagement |
| `engagement.staff.awaitingStart`, `engagement.staff.start`, `engagement.staff.clientBusinesses`, `engagement.staff.createDirect` | Paid with no engagement yet, and starting it; the businesses a new engagement can be for; New engagement | `view_all_businesses` and `manage_engagements` | Engagement |
| `engagement.staff.setStage`, `engagement.staff.saveProblem` | The stage; the one problem and its statement | `manage_engagements` | Engagement |
| `engagement.staff.assignableStaff`, `engagement.staff.assign`, `engagement.staff.removeMember` | Who can be added; add with a project role (emailed); take off | `assign_engagements` | Team assignment |
| `engagement.staff.saveSession`, `engagement.staff.saveNotes`, `engagement.staff.shareNotes` | Sessions; their notes; share the client notes | `manage_engagements`; internal notes also need `manage_engagements` or `review_engagements` to read | Session |
| `engagement.staff.saveTask`, `engagement.staff.loadDataRequest` | Work Plan items; load a Data Request | `manage_engagements`; team-side items also `contribute_engagements` | Data Request item |
| `engagement.staff.requestUpload`, `engagement.staff.confirmUpload`, `engagement.staff.fileLink`, `engagement.staff.shareFile`, `engagement.staff.matchFile` | Upload (a signed address, then the record once the file exists); open; share with the client; match a drop-box file to its requests | `manage_engagements`; drafts also `contribute_engagements` | File |
| `engagement.staff.removeFile` | Remove any file on the engagement (a wrong or private one), with the reason recorded; the stored file is deleted | `manage_engagements` | File |
| `engagement.staff.saveDeliverable`, `engagement.staff.approveDeliverable`, `engagement.staff.shareDeliverable`, `engagement.staff.comment` | Draft, approve, share, comment | Draft and share: `manage_engagements`; approve: `review_engagements`, or leading the engagement | Deliverable |
| `engagement.staff.saveContent`, `engagement.staff.deleteContent` | Plan, edit, send for approval, publish or delete a content piece | `manage_engagements` | Content piece |
| `engagement.staff.saveMeasure`, `engagement.staff.saveCheckin` | The Measure of Success; the Weekly Check-in | `manage_engagements` | Measure and check-in |
| `engagement.staff.fees`, `engagement.staff.saveFees`, `engagement.staff.setFeePaid`, `engagement.staff.openRoomNow`, `engagement.staff.sendFeeLink` | Read the fees; change them; mark one paid by hand; open the room before payment; send a pay link | Read: `manage_engagements`, `review_engagements` or `view_financials`; change, mark paid, open: `manage_engagements`; link: `manage_engagements` or `manage_payments` | Fee |
| `engagement.staff.serviceRequests`, `engagement.staff.handleRequest` | Clients asking for another service; handle or decline | `view_all_businesses` and `manage_engagements` | Service request |
| `engagement.finance.list` | Finance: paid, owed and late across every client | `view_financials`; read only | Finance view |

### Engagements: the client's side

Every action here needs an account session and acts only on the engagement of the business in use, and only on what
was shared with the person; none accepts a business id. "The owner" includes a business admin.

| Actions | What they do | Who may call | Object |
|---|---|---|---|
| `engagement.client.room` | The room | Anyone in the business | Engagement |
| `engagement.client.respondToTask`, `engagement.client.setNotAvailable`, `engagement.client.requestUpload`, `engagement.client.confirmUpload`, `engagement.client.fileLink` | Answer a request, mark a record not available, upload to it, open a file | Anyone in the business; a contributor, only their own items | Data Request item, File |
| `engagement.client.requestDrop`, `engagement.client.confirmDrop` | Upload to the drop box | Anyone in the business | File |
| `engagement.client.answerWithLink` | Answer an item with a link to a shared folder (footage, large records); only the link is kept | Anyone in the business; a contributor, only their own items | Data Request item |
| `engagement.client.removeFile` | Take back a file the person sent, until the team has matched it or accepted its item; the stored file is deleted | The person who sent it | File |
| `engagement.client.comment`, `engagement.client.accept` | Comment on a Deliverable; Sign-off | Those who can see it; Sign-off by the owner | Deliverable |
| `engagement.client.respondToContent` | Approve a content piece or send it back | The owner and full access | Content piece |
| `engagement.client.setAudience` | Choose who in the business sees an item | The owner | Session |
| `engagement.client.requestService` | Ask for another service ("Fix the next problem") | Anyone in the business, for their own business | Service request |
