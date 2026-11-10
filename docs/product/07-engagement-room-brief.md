# 07. The engagement room: brief

*Agreed with ET on 10 October 2026; the mock was approved the same day ("it feels a bit better, we iterate as we go") and
the room was rebuilt to it (`client/src/components/EngagementRoom.tsx`, design brief §9). Iterate from here.*

*Updated 10 November 2026. The room is in its third version (Design brief 12.5), with a Content view for Digital
Marketing. Sections 2, 4, 6 and 8 add what the room says about money: the pause (built, E5), part payments and receipts
(built, batch F1, App flow 3.1), and refunds and write-offs (built, F2).*

## 1. Objective

In one glance on a phone, the owner sees **where their business stands, what we are doing about it this week, and the
one thing they must do.** Value first, burden last. The owner's three questions, in this order:

1. What have you found, and where do I stand?
2. What is happening this week, and what comes after?
3. What do you need from me, by when?

## 2. Who, and when

The owner, and the one person they bring in, on a phone, between calls. They meet the room at five moments:

| Moment | The owner is asking | The room must answer with |
|---|---|---|
| Day 1, just after paying | Am I in good hands? What happens now? | What we already know about them; the two-week plan with dates; the one thing to do first |
| During the assessment | What do you need from me? When is the call? | Day X of 14; the plan with what is done; the next call; one request at a time |
| Findings day | What did you find? What is the one problem? | The one problem in their words, the findings, the sign-off, when the fix starts |
| The fix, weekly | Is it working? What do I do this week? | The number, this week's reading, this week's action, the next check-in |
| Day 30 | Did it hold? What now? | The number then and now, what is still in use, what support looks like |
| A fee falls due, or is late | What do I owe, and by when? Has the work stopped? | The fee, its amount and date, and **Pay**; from the day after its date, that it is late and the day work pauses; seven days after it, that work is paused and what to pay to continue |

## 3. The chain the room sits on

Walked through by ET on 10 October:

1. The owner fills the **business check**. We get a first sense of the business and send the results.
2. They book the **free call**: the Discovery Call. Shorter than the firm's usual debrief (twenty minutes, mostly the owner
   telling us), but the same shape as the *Client Debrief Meeting Engagement Guide*: hear the client out, reiterate the
   problem as they see it, the intervention expected and what success looks like, agree next steps, and follow up the
   same day.
3. They buy the **report** (₦100,000) and, when ready, commit to the **Current State Assessment** (₦500,000): *an
   assessment that tests both internal and external factors to find where the problem of the business is and the
   possible solutions.*
4. **The Discovery Call informs the work plan. The work plan sets the activities for the two weeks.** The room shows today
   against that plan.
5. Findings and the one problem; the fix; day 30.

**One correction to make it work.** Today the Discovery Call leaves no record in the platform: it is a Calendly booking and
the analyst's memory. For the room to start warm on day 1, the analyst captures a **Discovery Call summary** within the hour,
in the admin, following the guide's summary template cut to The Shift: what we heard, the problem as the owner sees it,
what success looks like, what they have tried, next steps. It is shared to the owner. That is the follow-up email the
guide already requires, kept as a record. Without it the room cannot answer "where are we today" on day 1.

## 4. What is on the page, at every moment

In this order, one column, phone first:

- **A late fee, above everything** (built 10 November 2026, E5): *A payment is late*, then *Work on your {title} is
  paused*, with what to pay and **Pay** (section 8). It shows on every view, and the room under it stays readable.
- **Now.** One headline: the stage and where in it ("Current State Assessment, week 1 of 2"), a progress line ("Day 4 of
  14"), one sentence on what this week is for.
- **Your one thing.** The single next action for the owner, with its date and its button (upload, confirm, book, sign
  off). Others wait below in the plan; the room never opens with a list of eight.
- **Next call.** Date, time in Lagos, Join.
- **Your journey, numbered 1 to 7.** Business check, Discovery Call, report, Current State Assessment, what we found,
  the fix, day 30. Each step has a state (done with its date, now, next with its date) and opens to its content: the
  check's main finding; what we heard at the Discovery Call; the report; the two-week work plan with numbered activities,
  who (you, us, together), when and status; the findings and the one problem; the number week by week; the day-30
  check. The current step is open when the page loads.
- **Your team**, and the one seat the owner can give.

Off the page: account details, the business profile, anything the team does not keep current.

## 5. Interaction

Numbered and expandable, not a tray of cards. The owner acts in place: tick "I have sent this", upload, sign off,
comment, book. A progress line moves. The page changes every week, so it gets opened.

## 6. What this needs from the platform

For the implementation plan, once the mock is approved:

| Need | Today | Change |
|---|---|---|
| Discovery Call summary | **Built 10 October (migration 0009):** `debriefs`, captured in the admin's Discovery Calls section in the guide's five parts, shared to the owner as a separate step | Done |
| The work plan | **Built 10 October (migration 0009):** tasks and sessions carry a week and an order; tasks a factor (internal, external); the template places nine Data Requests, two team actions and both calls in week 1 and 2 | The analyst shapes it from the Discovery Call; the desk lead reviews |
| The check and the report in the room | Linked by id, not shown | The room reads the main finding, readiness and the report link |
| "Now" | The stage only | Day X of 14 and week X of 6 from the stage dates |
| Day 30 | Planned (migration 0009) | As planned |
| The pause for a late fee | **Built 10 November (E5):** worked out from the fees' dates on every load, nothing stored; paying or a new date lifts it | Done |
| Part payments, receipts and refunds | One paid or unpaid mark on each fee | **Built 10 November (batch F1, App flow 3.1):** a payments ledger, migration 0022; refunds and write-offs with F2 |

## 7. How we know it works

- The owner opens the room every week without being prompted.
- Requests arrive on time; chasing on WhatsApp falls.
- On calls, the owner can state the one problem and the one number without help.
- No "where is that document" messages.

## 8. Money in the room

The owner meets money at three moments, and the room answers each where they already are:

1. **Before the first payment.** An engagement paid in advance shows only the payment gate: *Your room opens once the
   first payment is made*, the fee and **Pay**.
2. **A fee is due.** The Payments view lists each fee with its amount, its date and **Pay**. A second half has no date until the
   main output is shared; then it is due seven days later and the owner is emailed its link.
3. **A fee is late.** From the day after its date a banner above every view says so and names the day work pauses; seven days after it,
   that work is paused and what to pay to continue. The room stays readable and uploads stay open, so nothing the owner
   has sent is lost. Paying lifts it at once.

Built with batch F1 (App flow 3.1): a fee paid in part shows *₦150,000 of ₦300,000 paid, ₦150,000 left* and **Pay**
asks only for what is left; each payment shows its receipt number, amount and day, and any refund against it; a fee a
Partner has closed shows *Nothing more to pay*. The team's words (write-off, needs a look, cancelled) never reach
the room.
