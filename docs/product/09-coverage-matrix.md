# 9. Coverage matrix

**Every object in The Shift, every stage of its life, who acts, and where each step lives in the
[App flow](03-app-flow.md) and on the Miro board ("The Shift: App flow by user").** Built on 9 November 2026 from the
code: every server procedure in `server/routers/`, every audit action in `server/audit.ts` and every table in
`drizzle/schema.ts`. Run again at every document review.

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
| Client invitation | Created | Platform (on payment or New engagement), desk | `clientOnboarding.invite`; `inviteBusinessOwner` | 4.1 #7, 4.3 #2 | Client: Invited to the room | Built |
| | Accepted | Client | `clientOnboarding.accept`, `invitations.accept` | 8.1 `/onboarding`, `/join` | Client: Invited to the room | Built |
| | Revoked, expired, sent again | Desk | `clientOnboarding.revoke`, `sendSignInLink` | 7 Exceptions | — | Built |
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
| | Opened before payment | Lead | `staff.openRoomNow` | 4.3 #3 | Lead: Opens a room early | Built |
| | Paused, resumed | Platform, lead | — | 4.4 #7b | Client: Late: work pauses | To build (R51) |
| | Closed with its result | Lead | `staff.setStage` (closed, no result recorded) | 4.5 #1 | Lead: Closes the engagement | Partly built (R26) |
| | Archived or deleted when opened by mistake | — | Not possible | — | — | **C7** |
| Team assignment | Added, role changed | Lead with `assign_engagements` | `staff.assign` (emailed) | 4.6 | Lead: Staffs the team | Built |
| | Received by the person added | Team member | The email; My projects | 4.6 | Specialist journey has no step | **C1** |
| | Removed | Lead | `staff.removeMember` | 4.6 | — | Built (their items move: R51) |
| Session | Created, booked, held, cancelled | Lead; client on Calendly | `staff.saveSession`; Calendly sync | 4.4 #2 | Client: Books the kickoff | Built |
| | Reminded before it starts | — | Nothing (a JUMP-era template exists, unused) | — | — | **C3** |
| | Notes saved, shared; audience chosen | Lead; owner | `staff.saveNotes`, `shareNotes`; `client.setAudience` | 4.4 #2 | Lead: Shares notes the same day | Built |
| Data Request item and action | Created | Platform, team, Specialist (team side) | Loaded with the type; `staff.saveTask`, `loadDataRequest` | 4.3 #2, 4.6 | Analyst: Keeps the Work Plan current | Built |
| | Answered | Client | `client.respondToTask`, `setNotAvailable`, uploads | 4.4 #3 | Client: Sends records | Partly built (R43) |
| | Checked | Team | `staff.saveTask` (status) | 4.4 #3 | Analyst: Matches client files | Built |
| | Reminded | Platform | — | 4.4 #3 | Client: Reminded before and after | To build (R16) |
| File | Uploaded by the client (item or drop box) | Client | `client.requestUpload`, `confirmUpload`, `requestDrop`, `confirmDrop` | 4.4 #3 | Client: Sends records | Built |
| | Uploaded by the team, a Specialist's draft | Team | `staff.requestUpload`, `confirmUpload` | 4.6 | Specialist: Hands in drafts | Built |
| | Matched, shared, opened | Team; client | `staff.matchFile`, `shareFile`, `fileLink`; `client.fileLink` | 4.4 #3 | Analyst: Matches client files | Built |
| | Removed (a wrong or private file) | — | Not possible, for anyone | — | — | **C5** |
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
| Audit log | Written | Platform | `recordAudit`, 70 actions | — | — | Built |
| | Read | Desk (a check's history only) | `stageHistoryFor` in `server/businessSupportAdmin.ts` | 8.3 Pipeline | — | **C10** (no view of who did what elsewhere) |
| Email delivery | Recorded, seen | Platform; desk | `businessSupport.emailDeliveryStatus` | 6 | Super Admin: Watches System status | Built |

## 2. What the checklist found beyond the matrix

| Check | Finding |
|---|---|
| First visit | Covered by R46 (the welcome) |
| What goes wrong | Pause, changes asked for, refunds, a leaver's items: R51. A wrong file cannot be removed: **C5** |
| End of the relationship | Close and Day-30 Review: R26, R27. A business changing hands: **C15** |
| Empty, loading, error, partly-done screens | Not yet audited screen by screen; the Design brief review (document 4) does this |
| Channels | WhatsApp: R44. Session reminders by any channel: **C3** |
| Money | Owed, paid, late: built or R12. Refunded: R37 |
| Day 0, weekly, day 30, after the end | Day 0: R46. Weekly: check-ins built, Session reminders **C3**. Day 30: R27 |
| Code left over | A 24-hour "session reminder" email template from JUMP remains in `server/emailTemplates.ts` with programme wording, unused: **C12** |

## 3. Gaps found

**Priority:** P1 blocks a live client or puts money or trust at risk now; P2 moves a pilot measure or a legal duty; P3
improves the product. **Effort:** S is days, M about a week.

| # | Gap | Why it matters | P | Effort | Requirement |
|---|---|---|---|---|---|
| C1 | The Specialist's journey does not show being added to an engagement | The person added is told by email, but the journey (App flow 4.6, the board) skips the step | P2 | S (documents only) | Fixed in this review |
| C2 | A lead cannot invite a colleague or Specialist from the engagement: the Super Admin must invite first, then the lead adds them | A handoff that stalls staffing | P2 | S | R58 |
| C3 | No Session reminders, to the client or the team | Missed Sessions cost the team's hours and the client's progress; weekly check-ins depend on them | P2 | S (with the reminder engine) | R59 |
| C4 | A client who asks for the next fix is not told when it is handled or declined | Silence after asking to buy loses the sale | P2 | S | R60 |
| C5 | Nobody can remove a file: a client who uploads the wrong file, or a private one, cannot take it back | Trust and data protection | P2 | S | R61 |
| C6 | No way to export or erase a person's data when they ask | A duty under the Nigeria Data Protection Act 2023 | P2 | M | R62 |
| C7 | An engagement opened by mistake cannot be archived or deleted | Clutter in the team's lists and the client's projects | P3 | S | R63 |
| C8 | Nobody is alerted when a finished check or a booked call is not followed up | The "same working day" handoff has no signal | P2 | S | R64 |
| C9 | A lead marked Referred (to Enzo Krypton & Co.) reaches nobody | A referral that goes nowhere | P3 | S | R65 |
| C10 | The audit log is written for 70 actions but readable only as a check's history | The Super Admin cannot see who marked a fee paid by hand, opened a room early or removed access | P3 | M | R66 |
| C12 | An unused JUMP-era session reminder template remains in the code | Dead code with the wrong wording | P3 | S | Remove with R59 |
| C15 | A business cannot change its owner | A sale or a handover locks the business to the first owner | P3 | M | R67 |
| C17 | Nobody is told before a Specialist's access ends | Work stops mid-engagement without warning | P3 | S | R68 |

(C11, C13, C14 and C16 were checked and found covered; the numbers are kept so the register stays stable.)
