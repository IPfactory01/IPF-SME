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
- React effects return nothing or a cleanup function only (the claude.ai preview frame breaks otherwise).
- UI tests set `MotionGlobalConfig.skipAnimations = true`.

## 6. Words

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

- **Cover:** the three-colour rule, the print logo, "THE SHIFT", the crimson eyebrow "FULL BUSINESS CHECK REPORT", the
  business name in Playfair 34 pt, a facts table (prepared for, date, reference) and the contents.
- **Parts:** crimson eyebrow, title in brand blue, the finding in Playfair 19 pt, a health chip, then blocks (facts,
  metrics tiles with a brand top bar, tables with tinted headers, readings, call-outs with an accent bar).
- **Footer** on every page after the cover: "The Shift, by IP Factory · Full business check report · {business} ·
  {reference}" and "n / N".
- Short tables never split across pages; values shrink to fit their tile.

## 9. Screens of the engagement room (built 10 October)

The room wears the site's dress, not the admin's. Built on 10 October (`client/src/components/AccountLayout.tsx`,
`EngagementRoom.tsx`, `pages/AccountDashboard.tsx`):

- **The signed-in shell** carries the mark, the product name and the gradient rule, with the site's nav underline;
  `container` width for the room, a reading width for the settings pages; the endorsement in the footer.
- **The top answers "where are we?" in one look:** the greeting as an eyebrow in `highlight-ink`, the business name in
  Playfair Display black, the stage and its one-line summary, the team; on the right the next call in a `brand-tint`
  panel with "Join the call", and a shortcut to what to send first ("2 things to send · first by Tue 27 Oct"). The
  logo's colours sit softly behind it, as on the site's hero.
- **The journey bar** runs along the bottom of that panel: done steps with a check, the current step in `brand` with
  "Now", future steps muted.
- **Two columns on a desktop, one on a phone:** the work on the left (what we need from you, what we have found), the
  context on the right (the one number we watch, your calls, the owner's seat card).
- **The measure** is one large number: this week's reading in the health colour of its direction (`health-clear` the
  right way, `health-watch` the wrong way), the move since the start in words, then where it started and where it is
  going, then week by week.
- **Status words, never icons alone:** "Booked", "Held", "To book", "Received", "Signed off", "Shared 23 Oct".
- **Empty states carry a date** when one is known: "Notes from Current State Assessment call 1 reach you the same day,
  Fri 23 Oct."
- Account and business details live in the settings pages; the room shows nothing administrative.

## 10. Tests that guard the brand

| Test | Checks |
|---|---|
| `test/shared/brand.test.ts` | Every `BRAND.palette` colour matches its `--color-*` token; the product name, endorsement, page title and booking link; the product name is never preceded by "your", "a", "an" or "the" |
| `test/server/emailTemplates.test.ts` | Business email uses only palette colours; logo beside "The Shift"; crimson headings; cyan button with navy text; the three-colour rule; no JUMP wording |
| `test/server/emailLogo.test.ts` | The embedded logo is the brand file at twice its display size |
| `test/server/fullReport/pdf.test.ts` | A4; the brand fonts are embedded and cover ₦; the logo is the print file |
| `test/server/payments.test.ts` | The "TEST DETAILS - DO NOT PAY" label uses the crimson token |
| `test/server/interactiveAffordances.test.ts` | Pointer and not-allowed cursor rules are present |
