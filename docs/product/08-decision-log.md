# 8. Decision log

The history behind The Shift: what was decided, by whom and when. The [PRD](01-prd.md) states what is true now; this
log keeps how we got there. Newest first. Names in older entries are as they were then: the Current State Assessment is
now the Business Review (₦600,000), and the JUMP programme views have been removed.

## 1. Decisions from 22 October to 6 November 2026

| Decision | Taken by |
|---|---|
| The PRD is rewritten from scratch around the journey, with priorities, acceptance and measures; this log holds the history | ET, 6 November 2026 |
| The Shift is a service business today and a self-serve platform over time; clients keep their access throughout; the platform does the routine work | ET, 6 November 2026 |
| Digital marketing is a Shift product: a monthly service fee of ₦470,000 for 90 days, each month paid before it starts, the first at signing, with milestones and a quarter review; it goes on the public menu | ET, 6 November 2026 |
| There is no separate agreement: the proposal doubles as the agreement, signed by the owner. Every screen and email says "proposal" | ET, 6 November 2026 |
| The one number: paying clients whose agreed measure moved | ET, 6 November 2026 |
| Specialists hand in team items and drafts on their own engagements; they never see internal notes or fees | ET, 6 November 2026 |
| The proposal is drafted from the service and its price and sends in one click | ET, 6 November 2026 |
| Finance is visible to Partners, Vice Presidents and Senior Associates | ET, 6 November 2026 |
| The admin is five tabs: Pipeline, Engagements, Clients, Finance, Team; JUMP is removed everywhere, its records kept in the database | ET, 6 November 2026 |
| A one-step Data Request loader: the Small business baseline, or rows pasted from Excel | ET, 6 November 2026 |
| Engagement agreements with fees, accepted by the owner in their room (migration 0019) | ET, November 2026 |
| Many projects per client; "Fix the next problem"; engagement types that match the website (migration 0018) | ET, November 2026 |
| Contact page: "Talk to an expert"; "expert" over "person" in all copy | ET, November 2026 |
| The home page is problem-led: "Find it. Fix it. See the shift.", owners' problems with the fix under each | ET, November 2026 |
| The gradient logo and gradient colours stay; the teal logo was tried and reverted | ET, November 2026 |
| Search titles and five guides for the problems Nigerian owners search; Google Search Console verified, sitemap submitted | ET, November 2026 |

## 2. Decisions taken while building (8 and 9 October 2026)

| Decision | Taken by |
|---|---|
| The full report is a condensed business plan: twelve parts, delivered as a PDF | ET |
| The full report is fully deterministic: no consultant or analyst reviews it; it goes out the moment the form is finished | ET |
| The report form (intake) comes after payment; no five-day turnaround | ET |
| The full report is independent of the Current State Assessment and is not credited against it | ET |
| Manual payment confirmation (details by email, proof, the team confirms) was the interim method until Paystack; placeholder details until real ones are set | ET |
| Both items can be paid online with Paystack; bank transfer with manual confirmation stays as the alternative (superseded 12 October: Paystack only) | ET |
| Paystack is the only way to pay: no bank details, no proof of payment; Paystack's checkout covers card, bank transfer and USSD; "Get my Full Report" opens Paystack directly | ET, 12 October 2026 |
| The owner pays exactly the price; IP Factory absorbs Paystack's fee | ET |
| Paystack's hosted checkout, reached by redirect (no Paystack script on the site, so the security policy does not change) | ET |
| Online payment is off, test or live by the Paystack secret key; test mode says "TEST MODE: NO REAL MONEY MOVES" on every pay page and payment email | ET |
| An online payment confirms once, through the same confirmation the team uses, with Paystack recorded as a system actor | ET |
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
| The client account invitation goes out when the Current State Assessment is paid; staff can invite by hand before payment only with a reason, which is recorded | ET |
| The paid assessment is called "Current State Assessment" everywhere: site, emails, admin, the report and these documents | ET |
| The engagement room follows five principles: the fix is one problem with one measure; show only what the team will keep current; notes and findings are for the owner by default; bookings on Calendly, conversation on WhatsApp, internal tasks in ClickUp; one free staff seat, no paid seats in the pilot | ET ("proceed", 9 October) |
| Data requests and actions sit in one list; the client marks what they sent, the team marks it received or asks for more | Built as recommended |
| New staff join by invitation with one role and set their own password; Super Admin is never granted by invitation; an existing account is never merged | Built as recommended |

## 3. Decisions recorded in the PRD until 6 November 2026

| # | Decision | Recommendation | Owner |
|---|---|---|---|
| O1 | **Transcripts in the engagement room.** Notes reach the owner the same day (decided, §7). Should the full transcript also be visible? | Reviewed notes by default; the transcript on request. **Built that way (9 October); say if transcripts should show** | ET |
| O3 | **Who releases what to the client.** | Analysts share notes and data requests; the desk lead approves every prescription and plan. **Built that way and enforced on the server (9 October)** | ET, Lewis |
| O5 | Paystack go-live: who opens the business account, and by when | Built (12 October): put the test keys in Vercel and the webhook in Paystack, test, then the live keys (implementation plan §4) | ET, Lewis |
| O6 | Ongoing support: content and price after the first fix | Define per client at fix close (D3) | ET |
| O7 | Who signs client terms (IPF, KIP or the venture) and the P&L owner | — | ET |
| O8 | File storage for the engagement room (concept note uses one Google Drive folder per client) | A private Supabase Storage bucket, so files sit behind the same access rules as the record. **Proceeding (ET, 9 October); needs the bucket and its keys in Vercel** | Lewis, Richard |

O4 (one Current State Assessment price or two grades) was decided on 9 October: ₦500,000, fixed.
O2 and O9 were decided on 9 October as recommended: conversation stays in the client's WhatsApp group, decisions and
actions are recorded in the room, and the team's internal tasks stay in ClickUp.

## 4. Where we depart from the concept note

The concept note v0.8.1 stays the strategy. Where the built product differs from it, this is the record, with who
decided. "Confirmed" means a change made while building and confirmed by ET on 9 October 2026.

| Concept note v0.8.1 | What The Shift does | Status |
|---|---|---|
| Built on IP Factory's copy of Jump, on Manus (D5, D7, D8) | Vercel, Supabase and GitHub; Manus remains only for the AI summary and old file storage | Decided |
| Product name "Operating Partner [working name]" | "The Shift, by IP Factory" | Decided (Lewis, 7 October) |
| Hero: "You know what your business needs…" | Headline "Find it. Fix it. See the results." | Decided |
| A Paystack link after the call | A "Pay online" button in the payment details email opens Paystack; Paystack is the only way to pay (12 October) | Built (12 October) |
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

