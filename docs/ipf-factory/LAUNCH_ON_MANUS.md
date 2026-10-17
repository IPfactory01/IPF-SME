# v0.1 on Manus: launch notes for Lewis and Richard

> **History.** This note describes the move from JUMP and the Manus launch (October 2026). The current product, its
> plan and its open decisions are in [`docs/product/`](../product/README.md).

**Updated:** 6 October 2026 · **Source of scope:** Concept Note and Launch Blueprint v0.8.1 (v0.1 frozen 5 Oct)

This repository (`IP-factory/SME-Programme`, branch `claude/ipf-factory-sme-takeover-fugq1o`) holds the Jump code base, rebranded for IP Factory, with the v0.8.1 home-page copy. The decision of 6 October is **one code base**: v0.1 launches on Manus on Friday 9 October from this work, and hosting moves off Manus afterwards. The code is kept fully Manus-compatible.

---

## 1. Bringing this work into the IPF Manus project

Your Manus copy currently lives in a different repository. To get to one code base, pick one:

| Option | How | Note |
|---|---|---|
| **A. Share your repository** (recommended) | Give this session access to the repository your Manus project syncs to. These commits are then applied there as a pull request you review. | No change to how Manus syncs. |
| B. Switch the sync to this repository | Point the IPF Manus project's GitHub sync at `IP-factory/SME-Programme` and merge this branch into `main`. | Only if Manus can pull from GitHub as well as push; otherwise Manus overwrites `main`. Confirm first. |

Until one of these happens, nothing here is live, and any changes made in the Manus copy are not here.

---

## 2. Settings to set in the IPF Manus project before Friday

| Setting | Value | If it is missing |
|---|---|---|
| `APP_ORIGIN` | The IPF site's public address, e.g. `https://<ipf-site>` | **Emailed links (password set-up, payment instructions, referrals) point to `emmanueltarfa.com`, the live Jump site.** |
| `APP_ALTERNATE_ORIGINS` | Any second address, e.g. the `www.` host | Requests from that address fail the origin check. |
| `OWNER_ADMIN_EMAIL` | Lewis's Google sign-in address (Lewis is Super Admin, D5) | The Super Admin is still Emmanuel's personal Gmail. |
| `OWNER_OPEN_ID` | Lewis's Manus openId in the IPF workspace | As above. |
| `RESEND_API_KEY` | IPF's Resend key, with the IPF sending domain verified | No email is sent. |
| `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` | IPF's Paystack account | Payment verification fails. |
| `JWT_SECRET` | A new random value (do not reuse Jump's) | Sessions cannot be signed. |

Manus supplies the rest (`VITE_APP_ID`, OAuth, `BUILT_IN_FORGE_*`, database) when the project is set up. Origin checks no longer need any `*.manus.space` setting: requests are accepted when they come from the address they were sent to.

---

## 3. One file to finish before Friday: `shared/brand.ts`

Every name, sender and mailbox the platform shows comes from this file.

| Field | Now | Needed |
|---|---|---|
| `productName` | "The Shift" ("The Shift, by IP Factory" in full), chosen 7 Oct | Done |
| `programmeMailbox` | `jump@emmanueltarfa.com` | **The IPF mailbox participants receive email from and reply to (info@ question, Open 3)** |
| `administrationMailbox` | `admin@emmanueltarfa.com` | The desk mailbox for monitoring copies and new-registration notices |
| `senderDisplayName` | "Emmanuel Tarfa \| JUMP 2026" | e.g. "IP Factory" |
| `programmeName`, `facilitator*` | JUMP 2026, Emmanuel Tarfa | Retire as the portal and email copy are rewritten |

**Do not launch with the current mailbox values:** IPF clients would receive email from the JUMP address. The Resend sending domain must match the new mailbox.

Prices and site wording for the journey live in `shared/businessSupport.ts`, one clearly labelled place, so a price or sentence change is a one-line edit through the Manus editor.

---

## 4. Status against the v0.1 page list (section 15)

| v0.1 item | Status here |
|---|---|
| Rebrand: name, logo, colours | Done: IP Factory, ipf-gradient logo and palette, favicon |
| Home page: section 16 copy, journey and prices | Done |
| Free business check flow (profile, founder readiness, problem, four-gap result, next step) | **Built** at `/check`. Every "free business check" button opens it. Branching rules in `shared/businessCheck/engine.ts`; questions and examples in `questions.ts`; the Enzo Krypton service catalogue it recommends from in `catalogue.ts`. The summary is written by the Manus built-in AI (`BUILT_IN_FORGE_*`) and falls back to a rules-written summary if the AI is unavailable. Needs migration `0023_business_checks` (run `pnpm db:push`). Set `discoveryCallUrl` in `shared/brand.ts` once there is a booking page; until then "Book my free call" records the request and emails the administration mailbox. |
| Full report (₦100,000) and Paystack links for the report, Current State and fix | **Not built.** The existing payment guidance still lists Jump packages. |
| Book a call: two blocks a week, 20 minutes | Existing scheduling can carry it; slot kinds and copy still say Jump. |
| Client area: uploads, feedback, files | Works as in Jump; wording still Jump. |
| Terms | Not written. |
| Emails | Working, but still in Jump's first-person voice and sender (see section 3). |

---

## 5. What else changed in this code base

- The public admin sign-in page no longer shows the Super Admin's email address.
- New-registration notices go to the desk mailbox by email, not the Manus notification service.
- Analytics loads only when `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` are set.
- The test suite runs without secrets (`pnpm test`); GitHub Actions runs check, test and build on every push.

See `docs/ipf-factory/MIGRATION_CHECKLIST.md` for the full audit and plan.
