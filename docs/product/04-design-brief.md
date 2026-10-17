# 4. Design brief

**Colours, fonts and how every screen should look, so it stays on brand.** Last reviewed 9 October 2026.

The rules here are enforced in code where possible: the colour tokens in `client/src/index.css`, the palette in
`shared/brand.ts` (`BRAND.palette`) and the tests listed in section 9. If this document and the code disagree, the code
is what ships; fix whichever is wrong in the same change.

---

## 1. Brand

| | |
|---|---|
| **Name** | The Shift (`BRAND.productName`); written in full with its maker as "The Shift, by IP Factory" (`BRAND.productEndorsement`). Never "your The Shift" or "a The Shift" |
| **Maker** | IP Factory (Intellectual Property Factory) |
| **Tagline** | Support for business owners |
| **Promise** | Find it. Fix it. See the results. |
| **Logo** | The ipf-gradient logo in `client/public/brand/`. Use as supplied: never recolour, stretch or crop. The white version goes on dark panels only |
| **Logo files** | `ipf-gradient-logo.webp` (site), `ipf-gradient-logo-white.webp` (dark panels), `ipf-gradient-mark.webp` (small spaces), `ipf-gradient-logo-email.png` (email, shown at 96 × 90), `ipf-gradient-logo-print.png` (PDF), `favicon-32.png`, `apple-touch-icon.png`, `ipf-mark-512.png` |
| **Signature motif** | A thin rule in three segments, plum → crimson → cyan, echoing the logo: the top of every email and the report cover; the scroll progress bar on the site |

## 2. Colour

Colours come from the theme tokens. **Never hard-code a hex value in a component** (`AGENTS.md`). The core palette is
`BRAND.palette`; a test fails if it drifts from `index.css`.

### Core palette

| Token | Hex | Use |
|---|---|---|
| `brand` | #1C4E7E | Primary: buttons, links, key text, rules |
| `brand-deep` | #12324F | Text on tints; hover on brand buttons |
| `ink` | #12324F | Primary text and dark fills |
| `ink-soft` | #4F5A66 | Secondary text, email paragraphs |
| `ink-muted` | #5F6B77 | Labels, captions, footers |
| `brand-slate` | #4A5E73 | Brand-tinted secondary text, table labels |
| `highlight-ink` | #CB3756 | Crimson: the readable accent on light backgrounds (eyebrows, section labels, numbers) |
| `highlight` | #36B7E0 | Cyan: fills, bullets and text on dark navy only. Never cyan text on white |
| `brand-plum` | #6C335C | Start of the plum → crimson → cyan rule |
| `paper` | #F7F9FA | Page background; text on dark fills |
| `paper-raised` | #FFFFFF | Cards |
| `brand-tint-softer` | #F6F9FB | Call-outs, table headers, email footer |
| `brand-line` | #D3DEEA | Brand hairlines and borders |
| `line` | #DDE3E8 | Default hairline |

### Health colours (the business outline)

| State | Text, dots, borders | Background |
|---|---|---|
| Clear | `health-clear` #2E7D4F | `health-clear-tint` #E7F3EC |
| Watch | `health-watch` #B26A00 | `health-watch-tint` #FBF0DD |
| Stuck | `health-stuck` #B42318 | `health-stuck-tint` #FCE9E7 |
| Not assessed | `ink-muted` on `paper`, dashed `line` border | — |

### Supporting tokens

Further tints, lines and greys exist for layout (`brand-tint*`, `brand-line-strong`, `paper-*`, `line-*`, `ink-600` to
`ink-800`, `ink-faint`, `on-dark-muted`) and for errors (`danger`, `danger-strong`, `danger-tint`, `danger-line`). Use them
for structure, not as new accents. Errors use the `danger` family, never the health colours.

## 3. Type

| Role | Font | Where |
|---|---|---|
| Headings and display | **Playfair Display** (700, 900) | Page titles, result headlines, report findings |
| Body, labels, tables, buttons | **Plus Jakarta Sans** (400, 600, 700) | Everything else |

- The site loads both from Google Fonts (`client/index.html`). Emails ask for them with Arial and Georgia fallbacks. The
  PDF embeds both (`server/fullReport/fonts.ts`; latin and latin-ext merged so ₦ prints).
- **₦ in headings:** Playfair Display has no ₦ glyph. A heading containing a naira amount uses Plus Jakarta Sans 700
  (the PDF does this automatically).
- Eyebrows and section labels: Plus Jakarta Sans, uppercase, 11 to 12 px, letter-spacing about 0.2em, `highlight-ink`.
- Numbers in tables and tallies: tabular figures.

**Finding (9 October 2026): the site is not showing the brand fonts.** The `<body>` carries Tailwind's `font-sans` and
headings carry `font-serif`. Neither utility is mapped to the brand fonts, and both outrank the base rules in
`index.css`. A browser check gives `system-ui` for body text and `Georgia` for headings. Emails and the PDF are correct.
The fix is two lines in the `@theme` block (`--font-sans` and `--font-serif` set to the brand fonts), checked with
screenshots before it ships, because every page's line lengths change.

## 4. Layout and components

- **Square corners** on buttons, inputs, cards and chips (`rounded-none`); the brand reads as precise, not playful.
- **Cards:** `paper-raised` on `paper`, a 1 px `line` or `line-soft` border, light shadow at most.
- **Primary button:** `brand` fill, white text, uppercase, letter-spaced, hover `brand-deep-hover`. **Call to action on
  the result and report pages:** `highlight-ink` (crimson) fill. **Secondary:** outline.
- **Selected option:** `brand` border on `brand-tint`.
- **Containers:** max width 1,280 px with 1.5 rem side padding; reading pages (report form, onboarding) narrower,
  max-width about 42 rem.
- **Phone first:** every owner-facing screen is designed at 390 px wide first; no horizontal scrolling; targets at least
  44 px tall.
- **Component library:** shadcn/ui ("new-york") in `client/src/components/ui`. Its colour roles (`bg-primary`,
  `bg-destructive`, `text-muted-foreground`, `border-input` and others) are **not mapped** to the theme, so they produce no
  colour. Always pass brand classes (`bg-brand`, `text-ink-muted`, `border-line`) when using a shadcn component, or map
  the roles in `index.css` in one change.

## 5. Motion

- One easing everywhere: `EASE = [0.22, 1, 0.36, 1]` (`client/src/components/motion.tsx`).
- Reveal on scroll: fade up 24 px over 0.7 s, once. Lists stagger by 0.07 s.
- The app respects the device's reduced-motion setting (`MotionConfig reducedMotion="user"`).
- The Business Check moves like a native app (reviewed against Apple's fluid-interface principles, 14 October 2026):
  a chosen answer shows its tick on the press and the next question follows after `ANSWER_PAUSE_MS` (120 ms); screens
  slide on a critically damped spring (`SCREEN_SPRING`, no bounce, 0.35 s) and the outgoing screen leaves at the same
  time (`AnimatePresence mode="popLayout"`), so taps and Back are never locked out; options arrive together, not one
  by one; the page jumps to the top instead of gliding; ticks and markers settle without overshoot.
- With "reduce motion" on, nothing moves by itself: the hero sentence stops rotating, the colour blobs and the scroll
  arrow stay still and the pulsing dot stops (`useReducedMotion`, `motion-safe:`). Glass headers turn solid under
  "reduce transparency" and gain a firm edge under "increase contrast" (`client/src/index.css`).
- Touch screens: hover is mouse-only (Tailwind 4 `hover:` and Framer `whileHover` ignore touch), so anything shown on
  hover is shown outright where there is no hover, such as "That's me" on the owner quotes.
- The admin console (reviewed against the same principles, 14 October 2026): buttons press in on pointer-down
  (`active:scale-[0.98]`, still under reduced motion) and list rows tint on press; record drawers slide in from the
  right and leave to the right on mirrored easing (320 ms in, 220 ms out), over an ink scrim that fades with them;
  with "reduce motion" on they fade instead (`[data-record-drawer]` in `client/src/index.css`). Status colours use the
  health and danger tokens, never Tailwind's palette; Waitlisted uses the brand tint.
- Client logos (home page, under the track record figures): identical square tiles with a hairline border; each logo
  sized by area, not height (`client/src/lib/logoSize.ts`), with a smaller share for logos printed on a filled box; drawn
  as an ink silhouette with the theme colour (`bg-ink` through the logo's `mono` mask) so seven palettes never fight the
  brand, cross-fading to full colour only where a mouse can hover. No press effect: the tiles are not links.
- React effects return nothing or a cleanup function only (the claude.ai preview frame breaks otherwise).
- UI tests set `MotionGlobalConfig.skipAnimations = true`.

## 6. Words

**Name the method (ET, 10 October 2026).** Every stage, artefact and ritual has a proper name, used the same way on the
site, in the admin, in the room and in email, from one list in `shared/method.ts`: Business Check, Discovery Call, Full Report,
Report Intake, Current State Assessment, Work Plan, Data Request, Session, Findings, Problem Statement, Prescription,
The Fix, Weekly Check-in, Measure of Success, Day-30 Review, Sign-off, Deliverables, Engagement, Your Plan.

- **Term first, meaning second.** The name is the heading; the sentence under it says what it means in plain English
  (`METHOD_MEANING`). Never a plain phrase in place of the name: "Findings", not "What we found"; "Data Requests · 2
  outstanding", not "2 things to send"; "Mark as submitted", not "I have sent this".
- **Nouns, not nudges.** Headings name the artefact, buttons name the act.
- **Brand lines are exempt.** "Find it. Fix it. See the results." and "The Shift" do not change; "fix" as a verb stays
  lower case.
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

## 7. Email

Every email to a business owner uses `buildBusinessSupportEmailHtml` (`server/emailTemplates.ts`), which builds the HTML
from the plain-text body so both versions say the same thing:

- 600 px card on `paper`; the IP Factory logo (inline image `cid:ipf-logo`, 96 × 90) beside "THE SHIFT"; the
  plum → crimson → cyan rule.
- "Dear …" becomes the greeting in Playfair; CAPITALS or "Heading:" lines become crimson labels; "•" lines become
  bullets with a cyan dot; two or more "Label: value" lines become a details table; a lone "Label: https://…" line
  becomes one cyan button with navy text.
- Footer: "The Shift, by IP Factory | info@ipfactory.co".
- Only `BRAND.palette` colours. The older JUMP layout (`buildBrandedEmailHtml`) is for JUMP email only.

## 8. The full report PDF

`server/fullReport/pdf.ts`, A4:

Since version 4 (14 October 2026) the report is laid out as IP Factory's partner-written strategic plans are:
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
  them); the risk matrix (3 × 3, cells tinted by likelihood × impact, numbered brand dots). A chart's
  title moves with it so it is never left alone at the foot of a page. No glyph outside the brand fonts: arrows are
  drawn as shapes.
- **Footer** on every page after the cover: "The Shift, by IP Factory · Full business check report · {business} ·
  {reference}" and "n / N".
- Short tables never split across pages; values shrink to fit their tile.

## 9. Screens of the engagement room (built 10 October, to the room brief)

The room follows document 07, in the site's dress (`client/src/components/AccountLayout.tsx`, `EngagementRoom.tsx`):

- **The signed-in shell** carries the mark, the product name and the gradient rule, with the site's nav underline;
  `container` width for the room, a reading width for the settings pages; the endorsement in the footer.
- **One column on a phone,** at most 42 rem wide: a page that reads top to bottom, not a tray of cards.
- **Spread on a laptop or desktop** (from 1,024 px, Tailwind `lg`), like the site: the room uses the `container` width.
  The Now panel puts where you are on the left and the next action with the next Session on the right. The Plan sets
  the timeline beside a column that stays in view as it scrolls: **Waiting on you** (everything the client owes,
  earliest first, and the owner's Sign-offs) and **Deliverables** (each with its Sign-off state). The two team cards
  (IP Factory's team, and the owner's staff seat) sit side by side under them. Founder shows its two sections side by
  side; Business shows the areas in a grid, two or three across, and an area opens in a panel from the right instead
  of a sheet from below. The tab control keeps its width at the left of its bar. The phone layout is unchanged.
- **Now** is the headline: the stage with its week and day ("Current State Assessment · Week 1 of 2", "Day 4 of 14"
  on a gradient progress line), one sentence on what the stage is for. The greeting and the business name are the
  eyebrow in `highlight-ink`. The logo's colours sit softly behind, as on the site's hero.
- **Next action**, in a `brand-tint` panel: one Data Request ("Data Request 3 of 9", its date, Upload or Mark as
  submitted) or one Sign-off; never a list.
- **Next Session**, one line with Join.
- **The Engagement timeline, numbered 1 to 7:** done steps with a check in `brand`, the current step in `highlight-ink`
  with "Now", future steps muted; each opens, the current one on load. The Current State Assessment step holds the
  Work Plan by week, each row numbered with who (You in `brand-tint`, IP Factory in grey, Together in `health-clear`),
  when, status and the action in place.
- **The Measure of Success** is one large number: this week's reading in the health colour of its direction
  (`health-clear` the right way, `health-watch` the wrong way), the move since the start in words, then where it
  started and where it is going, then week by week.
- **Status words, never icons alone:** "Done · Fri 9 Oct", "Shared Fri 30 Oct", "To be booked", "Received",
  "Sign-off given".
- Account and business details live in the settings pages; the room shows nothing administrative.
- **Founder · Business · Plan** (built 14 October, `client/src/components/room/`): a segmented control in a glass bar
  (`paper` at 85% with blur, solid for reduced transparency) that stays under the header; the selected tab sits on a
  `paper-raised` thumb over `paper-sunken`. The page keeps the site's plain `paper` background: no dark or tinted canvas.
  Business carries the number of stuck areas in `health-stuck`.
- **Panels follow the finger** on touch: critically damped springs (no bounce, 0.35 s), a flick projected from its
  speed, resistance at the first and last tab, interruptible mid-way; with a mouse, the control changes tab and a
  sideways drag still selects text. Reduced motion jumps instead of sliding. Hidden panels are inert.
- **Founder** sets the report's sections as cards: the number and title, the health chip, the standfirst in the serif,
  then the report's own blocks (facts, tables, numbered lists, Recommendations in a `brand-tint-softer` box with a
  `highlight-ink` rule) and the bridge from today to the 12-month target (`brand-slate` today, `health-clear` levers,
  `brand` target).
- **Business** opens with a health tally bar and its legend, then one row per area: a health-coloured edge, the area,
  the finding and the chip. The area sheet rises from the bottom with a grabber, follows a downward drag and closes past
  halfway or on a quick flick; benchmark bars use the health tints with the owner's number as an `ink` marker.

## 10. Tests that guard the brand

| Test | Checks |
|---|---|
| `test/shared/brand.test.ts` | Every `BRAND.palette` colour matches its `--color-*` token; the product name, endorsement, page title and booking link; the product name is never preceded by "your", "a", "an" or "the" |
| `test/server/emailTemplates.test.ts` | Business email uses only palette colours; logo beside "The Shift"; crimson headings; cyan button with navy text; the three-colour rule; no JUMP wording |
| `test/server/emailLogo.test.ts` | The embedded logo is the brand file at twice its display size |
| `test/server/fullReport/pdf.test.ts` | A4; the brand fonts are embedded and cover ₦; the logo is the print file |
| `test/server/payments.test.ts` | The "TEST MODE - NO REAL MONEY MOVES" label uses the crimson token; "Pay online" is the email's button |
| `test/client/pages/payPage.ui.test.tsx` | The pay page names the amount in full ("Pay ₦100,000 securely with Paystack") and shows "TEST MODE: NO REAL MONEY MOVES" in test mode |
| `test/server/interactiveAffordances.test.ts` | Pointer and not-allowed cursor rules are present |
| `test/client/components/admin/adminCraft.test.ts` | The admin console uses theme colours only; drawers slide in and out along the same edge, with a fade for reduced motion; the ink scrim; buttons and rows answer on press |
