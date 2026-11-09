# 4. Design brief

**How every screen looks and behaves, so it stays on brand and works on a business owner's phone in Nigeria.**
Rewritten on 9 November 2026 after the design review (findings B1 to B12): the screens were checked on a phone and a
laptop, with an automated accessibility check (axe, WCAG 2.1 AA) and a load test on a 3G and a 4G phone.

The rules are enforced in code where possible: the colour tokens in `client/src/index.css`, the palette in
`shared/brand.ts` (`BRAND.palette`) and the tests in section 15. If this document and the code disagree, the code is what
ships; fix whichever is wrong in the same change. Where a rule is newer than a screen, the screen says "today" and moves
when it is next changed.

---

## 1. Brand

| | |
|---|---|
| **Name** | The Shift (`BRAND.productName`); written in full with its maker as "The Shift, by IP Factory" (`BRAND.productEndorsement`). Never "your The Shift" or "a The Shift" |
| **Maker** | IP Factory (Intellectual Property Factory) |
| **Tagline** | Support for business owners |
| **Promise** | Find it. Fix it. See the shift. (ET, 9 November 2026: the line the site already uses, which carries the product name) |
| **Logo** | The ipf-gradient logo in `client/public/brand/` (ET tried the teal-navy logo on 6 November 2026 and kept this one). Use as supplied: never recolour, stretch or crop. The white version goes on dark panels only |
| **Logo files** | `ipf-gradient-logo.webp` (site), `ipf-gradient-logo-white.webp` (dark panels), `ipf-gradient-mark.webp` (small spaces), `ipf-gradient-logo-email.png` (email, shown at 96 × 90), `ipf-gradient-logo-print.png` (PDF), `favicon-32.png`, `apple-touch-icon.png`, `ipf-mark-512.png` |
| **Signature motif** | A thin rule in three segments, plum → crimson → cyan, echoing the logo: the top of every page, email and the report cover. It is the one decorative gradient |

## 2. Colour

Colours come from the theme tokens. **Never hard-code a hex value in a component** (`AGENTS.md`). The core palette is
`BRAND.palette`; a test fails if it drifts from `index.css`.

### Core palette

| Token | Hex | Use |
|---|---|---|
| `brand` | #1C4E7E | Primary: navy buttons, links, key text, rules, the progress bar |
| `brand-deep` | #12324F | Text on tints; solid dark bands |
| `brand-deep-hover` | #0D2540 | Hover on navy buttons |
| `ink` | #12324F | Primary text and dark fills |
| `ink-soft` | #4F5A66 | Secondary text, email paragraphs |
| `ink-muted` | #5F6B77 | Labels, captions, footers, steps still to come (5.4:1 on white) |
| `brand-slate` | #4A5E73 | Brand-tinted secondary text, table labels |
| `highlight-ink` | #CB3756 | Crimson: the readable accent on light backgrounds (eyebrows, section labels, numbers) |
| `highlight` | #36B7E0 | Cyan: fills, bullets and text on dark navy only. Never cyan text on white |
| `brand-plum` | #6C335C | The current stage in the room; the start of the gradient |
| `paper` | #F7F9FA | Page background; text on dark fills |
| `paper-raised` | #FFFFFF | Cards |
| `paper-sunken` | #EEF2F5 | Sunken sections; the outline of a screen while it loads |
| `brand-tint` | #EEF3F8 | Selected options; the next action |
| `brand-tint-softer` | #F6F9FB | Call-outs, table headers, email footer |
| `brand-line` | #D3DEEA | Brand hairlines and borders |
| `line` | #DDE3E8 | Default hairline |

**The gradient** (plum #6C335C → crimson #CB3756, white text) has two uses: the thin rule at the top of every page, and
the one main action on a public page (decision of 9 November 2026, section 4). It is never a band, a background or
text. `cta` (#36B7E0) is kept for reference only.

### Health colours (the business outline)

| State | Dots, bars, borders, icons | Text | Background |
|---|---|---|---|
| Clear | `health-clear` #2E7D4F | `health-clear` on white; `health-clear-strong` #236A40 on its tint | `health-clear-tint` #E7F3EC |
| Watch | `health-watch` #B26A00 | `health-watch-strong` #8F5500, always | `health-watch-tint` #FBF0DD |
| Stuck | `health-stuck` #B42318 | `health-stuck` | `health-stuck-tint` #FCE9E7 |
| Not assessed | `ink-muted` on `paper`, dashed `line` border | `ink-muted` | — |

`health-watch` is 4.2:1 on white, below the 4.5:1 text rule, so Watch text always uses `health-watch-strong` (5.4:1 on
its tint); Clear text on its tint uses `health-clear-strong` (B4). The Full Report PDF follows the same rule.
`test/client/contrast.test.ts` checks the ratios and fails if a component sets text in `health-watch`. Muted is a colour,
never a fade: a step still to come is `ink-muted`, not grey at reduced opacity.

### Supporting tokens

Further tints, lines and greys exist for layout (`brand-tint*`, `brand-line-strong`, `paper-*`, `line-*`, `ink-600` to
`ink-800`, `ink-faint`, `on-dark-muted`) and for errors (`danger`, `danger-strong`, `danger-tint`, `danger-line`). Use them
for structure, not as new accents. Errors use the `danger` family, never the health colours and never Tailwind's own
palette (`rose`, `red`, `amber`).

## 3. Type

| Role | Font | Where |
|---|---|---|
| Display headings on the public pages (since 22 October) | **Plus Jakarta Sans** 800, tight tracking | Page and section headlines, tiles, prices |
| Headings on the check, sign-in, account, pay and admin pages; the report | **Playfair Display** 400 (regular), never bold or black | Page titles, result headlines, report findings |
| Headings in the room (since the room's third version) | **Plus Jakarta Sans** 600 | The project title, panel headings |
| Body, labels, tables, buttons | **Plus Jakarta Sans** 400 to 700 | Everything else |

- The site loads both from Google Fonts (`client/index.html`); the theme maps `font-sans` and `font-serif` to them
  (`@theme` in `index.css`). Emails ask for them with Arial and Georgia fallbacks. The PDF embeds both
  (`server/fullReport/fonts.ts`; latin and latin-ext merged so ₦ prints).
- **₦ in headings:** Playfair Display has no ₦ glyph. A heading containing a naira amount uses Plus Jakarta Sans 700
  (the PDF does this automatically).
- **Running text is never italic serif** (B11). Italic is for a single phrase, such as the last words of the promise.
- Eyebrows and section labels: sentence case, 14 px, `font-medium`, `brand` on public pages and `ink-muted` after sign-in.
  Never uppercase or letter-spaced (5 November, after the unslop pass).
- Signed-in screens are quieter than the public site: no greeting headline (the business names the room), no colour
  blobs or gradients except the top rule, one accent (`brand`) for the progress bar, the current step and the client's
  own items; everyone else's items, counts and tags in neutral greys; hairline borders without shadows. The colour
  belongs to the content (the timeline, the Measure of Success, the scorecard), not the chrome.
- Numbers in tables, tallies and references: tabular figures.
- Load only the weights a page uses, and every weight it uses: a weight not loaded is faked by the browser and looks
  smudged. `test/client/sitemap.test.ts` checks Plus Jakarta Sans 800 is loaded.

## 4. Layout and components

- **Corners (ET, 9 November 2026): 8 px** (`rounded-lg`) on cards, panels, buttons, inputs and chips everywhere a client or
  visitor sees: the public site, the check, the room, account, sign-in and pay pages. Pills, avatars, dots and progress
  bars are round (`rounded-full`). Today the room and the home page are rounded; the check, the pay and sign-in pages and
  the admin console are square. They move to 8 px as each screen is next changed (the pay pages with R72, every screen
  with R69). No new square screen.
- **Buttons (ET, 9 November 2026).** The one main action on a public page (the free check; Pay) uses the gradient with white
  text, once per screen. Every other primary button, and every button after sign-in, is navy: `brand` fill, white text,
  hover `brand-deep-hover`. Secondary: an outline in `brand-line` with `brand` text. A destructive action: `danger`. Today
  the Pay buttons and the check's result use a crimson fill; they move to the gradient with R72 and R69. Buttons are
  sentence case, `font-semibold`, and name the act ("Pay ₦100,000 securely with Paystack", "Mark as submitted").
- **Cards:** `paper-raised` on `paper`, a 1 px `line` or `line-soft` border, no shadow after sign-in.
- **Selected option:** `brand` border on `brand-tint`.
- **Containers:** `container` (max 1,280 px, 1.5 rem side padding) for the site and the room; reading pages (the report
  form, onboarding, pay pages, settings) narrower, about 42 rem.
- **Phone first:** every owner-facing screen is designed at 390 px wide first, and checked at 360, 768 and 1,024 px; the page
  never scrolls or drags sideways (B1: a visually hidden control must sit inside a positioned, clipped parent); every tap
  target at least 44 px tall (`min-h-11`; 24 px for a link inside a sentence). Pinch-zoom is never disabled.
- **Component library:** shadcn/ui ("new-york") in `client/src/components/ui`. Its colour roles (`bg-primary`,
  `bg-destructive`, `text-muted-foreground`, `border-input`) are **not mapped** to the theme. Always pass brand classes
  (`bg-brand`, `text-ink-muted`, `border-line`), or map the roles in `index.css` in one change.

## 5. Screen states (R69)

Every screen that loads data shows one of these states, and a failure is never shown as empty (B2: on a dropped
connection the room used to say "Your room opens here when your Current State Assessment starts"). The parts are in
`client/src/components/states.tsx` (`Loading`, `Empty`, `Failed`, `Stale`, `ReadState`); the retry rule is in
`client/src/lib/readPolicy.ts` and applies to every read (`main.tsx`). A refusal from the server (not signed in, not
allowed, not found) is an answer, never retried and never shown as a connection problem; on a token page it still means
the link is wrong, and only then does the page say so. A signed-in person whose request failed stays where they are.

| State | What the person sees | Rules |
|---|---|---|
| **Loading** | The screen's heading and the outline of what is coming, in `paper-sunken` blocks the size of the content | Never a blank page or a spinner alone; nothing jumps when the content arrives. A short line ("Opening your room…") only where there is no layout to outline |
| **Empty** | What will appear here, and who adds it or when: "Your Sessions appear here once Femi books the first one." | One action if the person has one; otherwise none. Never shown when the load failed |
| **Failed** | "We could not load this. Check your connection and try again." with **Try again**; the last copy stays on screen with "Showing what we had at 10:42 am" | The read retries twice by itself before saying so. A refusal says plainly that this account cannot see it, and whom to ask |
| **Partly done** | The progress in words and a bar ("3 of 8 received"), then what is left, earliest first | The person's own next step comes first |
| **Saving** | The button says what it is doing ("Saving…", "Signing out…") and waits | Success is confirmed in place, or in a short toast; an error sits beside the field or button in `danger-strong`, saying what to do next |

## 6. Formats

| What | Write it as | Notes |
|---|---|---|
| Dates | Fri 23 Oct; Fri 23 Oct 2027 outside this year | Due flags in words: "Overdue by 18 days", "Due today", "Due in 3 days" |
| Times | 10:00 am (Lagos time) | Worked out in Africa/Lagos; "(Lagos time)" wherever someone elsewhere may read it: Sessions, emails, reminders |
| Money | ₦100,000 | In full, never ₦100k; no kobo unless there are some |
| Phone numbers | +234 803 123 4567 | Entered with the Nigerian flag and +234 by default (`PhoneField`) |
| References | TS-F-000123 | Tabular figures; always beside what they pay for |
| Durations | 90 minutes; two weeks | Words in copy, figures in tables |
| People | First name in a greeting; full name and role on a team ("Femi Adebayo, Lead Consultant") | Initials in an avatar, with the full name for screen readers |

## 7. Icons, images and WhatsApp

- **Icons** come from `lucide-react`: 16 px beside text (`h-4 w-4`), 20 px in a button or a call-out, as drawn. An icon
  beside a word is `aria-hidden`; a button that is only an icon has an `aria-label`. Status is always written in words,
  never shown by an icon or a colour alone ("Done · Fri 9 Oct", "Received", "Sign-off given").
- **Team avatars:** initials on one neutral tone; the group is a labelled image ("Team: Femi Adebayo, Ngozi Eze").
- **Client logos** (home page and About, under the track record figures): identical square tiles with a hairline border;
  each logo sized by area, not height (`client/src/lib/logoSize.ts`); drawn as an ink silhouette (`bg-ink` through the
  logo's `mono` mask) so seven palettes never fight the brand, cross-fading to colour only where a mouse can hover. Not
  links, so no press effect.
- **Images** are WebP, sized to how they are shown, with `alt` text that says what they show (empty `alt` when decorative).
- **WhatsApp (R44):** "WhatsApp Femi", an outline button in `brand` with the person's first name, opening a chat with a line
  that names the business and the project. No WhatsApp green: the button stays in the palette.
- **Uploads (R43, R56):** the limit is stated before choosing (25 MB); each file shows its name, size and progress, then
  "Sent, we are checking"; a failure says "The upload did not finish. Try again." Raw footage goes as a link to a folder or
  on WhatsApp, never as a file.

## 8. Motion

- One easing everywhere: `EASE = [0.22, 1, 0.36, 1]` (`client/src/components/motion.tsx`).
- Reveal on scroll: fade up 24 px over 0.7 s, once, **below the first screen only**. Nothing in the first screen waits on
  an animation to appear (R70). Lists stagger by 0.07 s.
- The app respects the device's reduced-motion setting (`MotionConfig reducedMotion="user"`): with it on, nothing moves by
  itself. Nothing loops when it is not live. Glass headers turn solid under "reduce transparency" and gain a firm edge
  under "increase contrast" (`client/src/index.css`).
- **The Business Health Check** moves like a native app: a chosen answer shows its tick on the press and the next question
  follows after `ANSWER_PAUSE_MS` (120 ms); screens slide on a critically damped spring (`SCREEN_SPRING`, no bounce, 0.35 s)
  and the outgoing screen leaves at the same time, so taps and Back are never locked out; the page jumps to the top
  instead of gliding.
- **The room's panels follow the finger** on touch: critically damped springs, a flick projected from its speed,
  resistance at the first and last tab, interruptible mid-way; with a mouse the tab bar changes tab and a sideways drag
  still selects text. Reduced motion jumps instead of sliding. Hidden panels are inert.
- **The admin console:** buttons press in on pointer-down (`active:scale-[0.98]`) and list rows tint on press; record drawers
  slide in from the right and leave to the right on mirrored easing (320 ms in, 220 ms out), over an ink scrim; with reduce
  motion on they fade (`[data-record-drawer]` in `index.css`).
- Touch screens: hover is mouse-only, so anything shown on hover is shown outright where there is no hover.
- React effects return nothing or a cleanup function only (the claude.ai preview frame breaks otherwise). UI tests set
  `MotionGlobalConfig.skipAnimations = true`.

## 9. Words

**Name the method (ET, 10 October 2026).** Every stage, artefact and ritual has a proper name, used the same way on the
site, in the admin, in the room and in email, from one list in `shared/method.ts`: Business Check, Discovery Call, Full Report,
Report Intake, Current State Assessment, Work Plan, Data Request, Session, Findings, Problem Statement, Prescription,
The Fix, Weekly Check-in, Measure of Success, Day-30 Review, Sign-off, Deliverables, Engagement, Your Plan.

- **Term first, meaning second.** The name is the heading; the sentence under it says what it means in plain English
  (`METHOD_MEANING`). Never a plain phrase in place of the name: "your Findings", not "what we found"; "Data Requests · 2
  outstanding", not "2 things to send"; "Mark as submitted", not "I have sent this".
- **Nouns, not nudges.** Headings name the artefact, buttons name the act.
- **Brand lines are exempt.** "Find it. Fix it. See the shift." and "The Shift" do not change; "fix" as a verb stays lower
  case.
- Capitalised as names, including inside a sentence ("your Business Check results", "both Sessions").

The site speaks the business owner's language (concept note, front matter):

- Second person, short sentences, one idea per sentence. British English.
- Naira in full: ₦500,000, never ₦500k.
- Never on the site: "door", "sprint", "playbook", "retainer", or consulting words (leverage, strategic, framework,
  holistic, solutions). Use the owner's words: "where your business is stuck", "the six-week fix", "the one number we
  watch together", "ongoing support".
- Every promise is followed by what happens next and what it costs.
- The business check keeps the proper term and says what it means ("Strategic intent: where the business is going").
- Say plainly that analysts and AI do the analysis under a named IP Factory consultant.

## 10. Email

Every email uses one layout, `buildBusinessSupportEmailHtml` (`server/emailTemplates.ts`), from one sender, IP Factory,
with replies to info@ipfactory.co (the JUMP layout and mailbox were removed on 9 November 2026, C19). The HTML is built from
the plain-text body so both versions say the same thing:

- 600 px card on `paper`; the IP Factory logo (inline image `cid:ipf-logo`, 96 × 90) beside "THE SHIFT"; the
  plum → crimson → cyan rule.
- "Dear …" becomes the greeting in Playfair; CAPITALS or "Heading:" lines become crimson labels; "•" lines become
  bullets with a cyan dot; two or more "Label: value" lines become a details table; a lone "Label: https://…" line
  becomes one cyan button with navy text.
- Footer: "The Shift, by IP Factory | info@ipfactory.co". Only `BRAND.palette` colours.

## 11. The Full Report PDF

`server/fullReport/pdf.ts`, A4, laid out since version 4 (14 October 2026) as IP Factory's partner-written strategic plans are:

- **Cover:** the three-colour rule, the print logo, "THE SHIFT", the crimson eyebrow "THE SHIFT · FULL REPORT ·
  STRATEGIC PLAN", the business name in Playfair 34 pt, "A twelve-month strategic plan" in crimson, a crimson rule, a
  facts table (prepared for, prepared by, built from, date, reference) and a "What this document is" call-out.
- **Contents:** "Background" and "Section One" to "Section Nine" in crimson, each with its title.
- **Background:** where the business stands today as a three-column table (position, figure, what it means), the
  scorecard (a heat-map row per area), the two facts that frame the plan (numbered brand circles with a health chip),
  the question the plan answers (the gap to the 12-month target as three multipliers) and the headline decision.
- **Sections:** crimson "SECTION ONE" eyebrow, the title in Playfair 24 pt over a crimson rule, the finding as a
  standfirst, a health chip, OVERVIEW and SCOPE, then numbered subsections ("1.2 The four money basics", Playfair
  13.5 pt) and blocks: facts, metrics tiles, tables with tinted headers, readings, numbered lists in crimson, and
  **Recommendations** ("RECOMMENDATION 4.1" in a tinted box with a crimson bar). A subsection heading is kept with
  the block that follows it.
- **Section Eight** carries the phases table, the month columns, a numbered action table per phase (#, action, owner,
  month) and "The gate at the end of Phase One" call-out.
- **Charts,** drawn in PDFKit from `BRAND.palette` only: benchmark bars (zones in the health tints, a marker in the
  health colour, "Good: …" underneath); the cash waterfall (money in brand, costs slate, what is left green or red,
  dashed connectors); the target bridge (today and the target in slate and brand, each lever a green step between
  them); the risk matrix (3 × 3, cells tinted by likelihood × impact, numbered brand dots). A chart's title moves with it
  so it is never left alone at the foot of a page. No glyph outside the brand fonts: arrows are drawn as shapes.
- Health labels and figures print in the text colours of section 2 (`health-watch-strong`, `health-clear-strong`); bars and
  markers keep the dot colours.
- **Footer** on every page after the cover: "The Shift, by IP Factory · Full business check report · {business} ·
  {reference}" and "n / N". Short tables never split across pages; values shrink to fit their tile.

## 12. The screens

### 12.1 Public pages and search (R73, R70)

- Each page has **one main heading (`h1`) for the search it answers**, and no two pages share one. The promise can sit on
  a page as a line; it is the main heading of the home page only. Today Home, How we work and the check share it (B9).
- Each page has its own title, the page's own words first and "| The Shift, by IP Factory" after, so a long title
  loses the brand in search results, not the subject; and its own description under 155 characters (`shared/seo.ts`). Each guide and service has its own share card with its title, so a link sent on WhatsApp or
  LinkedIn shows what it is; `share-card.png` (1,200 × 630) is for the rest. Today every page shares one card (B9).
- A guide ends with one route to the free check, and may offer it once mid-way; never more.
- Every public page opens with a "Skip to content" link; a chart or table wider than a phone scrolls sideways inside a
  focusable, named region.
- **Speed (R70):** see section 14.

### 12.2 The Business Health Check

The check's own shell (the mark, "Business Health Check", "Back to site"), a reading column and the intro in body text.
The promise is its heading today; with R73 the heading names the check and the promise becomes a line. One question per screen with large options (44 px or more); the result names the
Findings, what we think it is, and the offers, with the Discovery Call booked on the page.

### 12.3 Pay pages (`/pay/...`, `/pay/fee/...`, `/pay/return`)

The pay shell (`PaymentShell`): the top rule, the logo beside "The Shift", a reading column, the legal links.
The amount sits on the button in full ("Pay ₦470,000 securely with Paystack"), with what happens next under it
(Paystack's page, card, bank transfer or USSD, the receipt by email). The return page has three answers: paid, still
confirming (so nobody pays twice), and not completed with **Try again**. While Paystack runs on test keys a Watch-coloured
banner says no real money moves. **To come (R72):** before the button, who is paid (the legal name on the statement,
decision D1), what for, the reference, and a WhatsApp button to the lead or the office.

### 12.4 Signing in and joining

- **Clients** at `/login`: email and password, "Forgot your password?" (a 20-minute single-use link). **Staff** at
  `/admin/login`: "Staff sign in", then the six-digit code from an authenticator app (`TwoStepStep`); recovery codes work in
  the same box. Both pages have one `h1`, 44 px fields and the legal links.
- **Joining** (`/onboarding/:token`, `/join/:token`, `/reset/:token`): the reading column; an invitation opened while signed in
  as someone else names both addresses and offers "Sign out and continue"; an expired link says so and offers sign-in.

### 12.5 The room (`/dashboard`)

The room follows document 07 in its third version (the "ClickUp" layout):

- **Phone:** a slim top bar (the mark and "The Shift"; Account; Sign out; each 44 px), then the header (the business and
  project as a crumb; the title, "Business Review · Week 2 of 2"; one line on what the stage is for; the day bar; the team's
  avatars), then the tabs, which scroll sideways. **Laptop and desktop** (from 1,024 px): a left rail with the views by
  group (Overview; The work: Content, Work Plan, Data Request, Sessions; What we found: Business, Founder; What you
  receive: Deliverables, Payments), and the same header.
- **Views:** Overview (the stage band of seven, four figures, the next action, the next meeting, the Engagement timeline,
  Waiting on you, the team, Your projects, Fix the next problem); Content for Digital marketing (the month's pieces against
  the programme; approve or ask for changes); Work Plan by week; Data Request by section with the drop box; Sessions;
  Business and Founder (from the check or the Full Report); Deliverables; Payments (each fee with its date, reference and
  Pay button). Which views show, and who sees them, is in the App flow (8.4).
- **The stage band:** done stages in `brand` with a tick, the current one in `brand-plum`, those to come in a neutral;
  the four figures under it link to the view behind them. People share one avatar tone; in the Data Request only high
  priority and an overdue date carry colour; item references (A1, B3) are tabular.
- **The Engagement timeline,** numbered 1 to 7: done steps with a check, the current step marked "Now", steps to come in
  `ink-muted` (never faded); each opens.
- **The Measure of Success** is one large number: this week's reading in the health colour of its direction, the move since
  the start in words, then where it started and where it is going, then week by week.
- **The payment gate:** while an engagement in advance waits for its first payment, the room shows only "Your room opens
  once the first payment is made", the fee and the Pay button.
- Account and business details live in the settings pages (`AccountLayout`); the room shows nothing administrative.
- **On a phone (R71):** off the Overview the header is one line, the project and its day, so each view starts near the top;
  on the Overview the full header scrolls away with the page and a one-line bar (fixed, 40 px) appears at the top once it
  has gone, with the tab bar sticking under it, so nothing in the page shifts. The tab bar keeps the selected tab in view
  (scrolling the bar, never the page) and fades at each edge where more tabs sit. After the usability test, R49 reduces
  the views to five.

### 12.6 The admin console (`/admin`)

Five tabs, one job each: Pipeline, Engagements, Clients, Finance, Team (App flow 8.3). Dense tables with tabular figures,
status chips in the health and danger colours (never Tailwind's palette; Waitlisted uses the brand tint), record drawers
from the right. Square today; it moves to 8 px corners screen by screen. Everything the team does to a client's room can
be previewed as the client sees it (**Preview as client**, read only).

## 13. Accessibility

- Text meets 4.5:1 on its background; large text and icons 3:1 (section 2).
- One `h1` per page; headings in order; every field has a visible label; errors are announced (`role="alert"`) and sit
  beside what they are about.
- Every tap target at least 44 px; the keyboard reaches everything in order, with a visible focus ring; tabs move with the
  arrow keys, Home and End.
- Status in words, never colour or an icon alone; avatars and charts have a text name.
- Reduced motion, reduced transparency and increased contrast are honoured (section 8).
- **How it is checked:** axe (WCAG 2.1 AA) on every public page and every room tab at 390 px and 1,280 px at each design
  review; on 9 November 2026 the public pages and all seven room tabs passed with no failures after the B4 fixes.

## 14. Speed (R70)

Owners arrive on a phone, often on mobile data, from a link on WhatsApp or Instagram. A blank screen loses them, and
Google ranks on how fast the main content appears.

| Measure | Budget | 9 November 2026 |
|---|---|---|
| Largest content shown (LCP) on Lighthouse's mobile profile (1.6 Mbit/s, 150 ms, a 4 × slower processor): Home, the check, a guide | 2.5 s or less | Home 4.3 s, the check 2.5 s, a guide 2.6 s (on a faster 4G profile: 2.6 s, 0.8 s, 0.8 s) |
| First content shown | Before the site's code runs | After it: the pre-built page holds text for search engines only, so the screen stays blank until the code runs (2.7 s on the mobile profile) |
| JavaScript for a public page, compressed | 170 KB or less | 270 KB, the same bundle for every public page |

Measured on the production build served locally with compression, in Chromium with Pixel 5 emulation.

- Public pages are pre-rendered as the real page, so the content shows before the code runs.
- Each public page loads its own code; the room and the admin console load separately, so a visitor never downloads them.
- Nothing in the first screen fades in; images below the first screen load lazily.

## 15. Tests that guard the brand

| Test | Checks |
|---|---|
| `test/shared/brand.test.ts` | Every `BRAND.palette` colour matches its `--color-*` token; the product name, endorsement, page title and booking link; the product name is never preceded by "your", "a", "an" or "the"; no page, email or message reads the JUMP names |
| `test/client/contrast.test.ts` | Watch and Clear text meet 4.5:1 on white, the page and their tint; no component sets text in the Watch dot colour |
| `test/client/components/states.ui.test.tsx`, `test/client/lib/readPolicy.test.ts` | The four states; a failed read is never shown as empty; a refusal is never retried; no read turns retries off |
| `test/client/components/admin/readStates.ui.test.tsx` | Every admin view and the seat card say they could not load, with Try again, when the connection is down |
| `test/server/fullReport/pdf.test.ts` | A4; the brand fonts are embedded and cover ₦; the logo is the print file; health labels print at 4.5:1 or better |
| `test/server/emailTemplates.test.ts` | Email uses only palette colours; logo beside "The Shift"; crimson headings; cyan button with navy text; the three-colour rule; no JUMP wording |
| `test/server/email.sender.policy.test.ts` | Every email goes out as IP Factory, with replies to the office |
| `test/server/emailLogo.test.ts` | The embedded logo is the brand file at twice its display size |
| `test/client/components/engagementRoom.ui.test.tsx` | The room fits a phone (hidden panels' controls stay inside the panels' clip); every tab and top-bar link is 44 px; no timeline step is faded; the team is named for screen readers |
| `test/server/payments.test.ts` | The "TEST MODE - NO REAL MONEY MOVES" label uses the crimson token; "Pay online" is the email's button |
| `test/client/pages/payPage.ui.test.tsx` | The pay page names the amount in full ("Pay ₦100,000 securely with Paystack") and shows the test-mode notice in test mode |
| `test/server/interactiveAffordances.test.ts` | Pointer and not-allowed cursor rules are present |
| `test/client/components/admin/adminCraft.test.ts` | The admin console uses theme colours only; drawers slide in and out along the same edge, with a fade for reduced motion; the ink scrim; buttons and rows answer on press |
| `test/client/sitemap.test.ts` | Plus Jakarta Sans 800 is loaded |
