# IP Factory (IPF) — Business Support Platform

The platform behind **The Shift, by IP Factory**: support for business owners. Find it. Fix it. See the results.
Live at https://ipf-sme.vercel.app (Vercel, deploying `main`).

## What it does

- **Free business check:** ten minutes on a phone; a colour-coded outline of the ten places a business gets stuck, one
  of four gaps, and a summary. Saved as a lead from the first screen.
- **Full report (₦100,000):** paid by bank transfer, then a 17-question form; a deterministic PDF report is emailed the
  moment the form is finished.
- **Discovery call and Current State Assessment payment:** Calendly booking, call outcome, payment details, proof and confirmation.
- **Client accounts:** created by invitation once the Current State Assessment is paid; one identity per person, businesses as
  workspaces, client isolation enforced on the server.
- **Admin console:** leads, pipeline, payments, reports, onboarding, staff roles and permissions, audit trail.
- **Engagement room:** starts when the Current State Assessment is paid; the team's Engagements section and the client's room
  on `/dashboard` (where we are, what we need from you, what we have found). Needs migration 0008.
- **Files:** uploads against data requests and on deliverables, in a private Supabase bucket (needs the storage settings).
- **Next:** the fix's measure and weekly check-in screens; Paystack once the key is in Vercel.

**Product documents:** [`docs/product/`](docs/product/README.md) holds the PRD, technical requirements, app flow, design
brief, backend schema and implementation plan. Start there.

The code base began as a copy of the JUMP 2026 platform. JUMP-era screens and tables are still present and are marked
as legacy in the documents; `docs/ipf-factory/` records that migration.

## Stack

React 19 + Vite + Tailwind 4 (client) · Express 5 + tRPC 11 (server) · Drizzle ORM + PostgreSQL (Supabase) · Vitest.

```
client/      React app (pages/, components/, lib/)
server/      Express + tRPC server, routers/, domain modules
server/_core Platform plumbing (env, auth context, cookies, storage proxy, Vite integration)
shared/      Code shared by client and server (programme rules, templates, permissions)
drizzle/     PostgreSQL schema (schema.ts) and migrations
api/         Generated Vercel function bundle (do not edit; `pnpm build` regenerates it)
test/        All tests, mirroring client/src, server and shared
scripts/     One-off operational scripts (JUMP-era; do not run against an IPF database without review)
docs/        Operational and migration documentation
```

## Getting started

Requirements: Node 22.22.2 or newer 22.x (run `nvm use`; the browser-like tests need it), pnpm 10 (`corepack enable`), a PostgreSQL database for anything beyond tests and builds.

```bash
pnpm install
cp .env.example .env   # fill in values locally — never commit .env
pnpm dev               # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `pnpm verify` | Everything CI runs: both typechecks, all tests and the build. Run before every push |
| `pnpm check` | TypeScript typecheck |
| `pnpm test` | Unit and UI tests (no network or secrets required) |
| `pnpm build` | Production client + server bundle into `dist/` |
| `pnpm build:preview` | Static, clickable preview of the site into `dist/preview` (simulated server; no hosting, database or secrets needed) |
| `pnpm start` | Run the production bundle |
| `pnpm db:generate` / `pnpm db:migrate` | Generate / apply Drizzle migrations (`db:migrate` requires `MIGRATION_DATABASE_URL`) |
| `pnpm owner:bootstrap` | Set the Super Admin's sign-in password (hidden prompt; `--reset` to replace) |
| `pnpm test:db` | PostgreSQL contract tests against a real database (requires `TEST_DATABASE_URL`) |

CI (`.github/workflows/ci.yml`) runs check, check:tests, test and build on every push and pull request. Working rules for contributors and agents are in [`AGENTS.md`](AGENTS.md).

### Live integration tests

Tests that call real Resend or Google APIs are skipped unless explicitly enabled with real credentials:

```bash
VALIDATE_RESEND_CREDENTIALS=1 VALIDATE_RESEND_SENDER=1 VALIDATE_GOOGLE_CALENDAR=1 pnpm test
```

## Configuration

All configuration is via environment variables; see [`.env.example`](.env.example) for the full list. Secrets are created and held in the IPF-owned hosting environment and are never committed or shared in documents.

## Data protection

This repository must not contain participant personal data, bank details or credentials. Use fictional fixtures (`@example.com`) in tests. Participant data migration follows the approved, separate process in the handover plan.
