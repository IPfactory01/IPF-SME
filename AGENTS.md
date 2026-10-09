# Instructions for agents

Read this before changing anything. It applies to every agent and person working in this repository.

## Non-negotiable rules

1. **Every new feature or behaviour change ships with tests.** Add or update tests under `test/` in the same commit as the change. A bug fix starts with a test that reproduces the bug.
2. **Nothing is pushed until `pnpm verify` passes.** It runs the app typecheck, the test typecheck, every test and the production build. If it fails, fix the cause; never skip, disable or loosen a test to get green.
3. **Existing features must keep working.** If a change breaks an existing test, the change is wrong until proven otherwise. Change a test's expectation only when the behaviour change is intended, and say so in the commit message.
4. **No secrets in code, tests, docs or commits.** Read configuration with `process.env` (server) through `server/_core/env.ts`. Real values live in `.env` (git-ignored) locally and in the hosting provider's settings in production. `.env.example` lists names only.
5. **No real personal data in the repository.** Tests use fictional people and `@example.com` addresses.

## Product documents

Before changing the product, read the relevant document in `docs/product/` (index: `docs/product/README.md`): what it
does and why (PRD), how it is built, what each click does, how it must look, where data lives and who can see it, and
what is built next. When a change alters what a document says, update the document in the same commit.
`test/docs/productDocs.test.ts` fails if a route, table, price or role permission is added without being documented.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (Node 22.22.2 or newer 22.x, pnpm 10; `nvm use` reads `.nvmrc`). `pnpm test` stops with an instruction on an older Node |
| `pnpm dev` | Run the app locally on http://localhost:3000 |
| `pnpm verify` | **Run before every push:** `check`, `check:tests`, `test`, `build` |
| `pnpm check` | Typecheck the app |
| `pnpm check:tests` | Typecheck the tests |
| `pnpm test` | All unit, UI and in-memory database tests (no network or secrets needed) |
| `pnpm build` | Production bundle; also regenerates `api/index.js` for Vercel. Commit the regenerated file: CI fails if it is stale |
| `pnpm build:preview` | Static clickable preview in `dist/preview` with a simulated server |
| `pnpm test:db` | Database contract tests against a real PostgreSQL (`TEST_DATABASE_URL`, disposable database only) |
| `pnpm db:generate` / `pnpm db:migrate` | Create / apply a migration (`MIGRATION_DATABASE_URL`) |
| `pnpm db:verify` | Read-only check that a database matches the schema |

## Architecture

```
client/src/       React 19 + Vite + Tailwind 4 (pages/, components/, lib/, preview/)
server/           Express 5 + tRPC 11: routers/, domain modules (email, scheduling, businessCheck…)
server/_core/     Platform plumbing: env, auth, cookies, storage proxy, app.ts (Express app),
                  index.ts (local/Node server), vercelEntry.ts + vercelGateway.ts (Vercel function)
shared/           Code used by both client and server: brand.ts, businessSupport.ts (prices, journey,
                  problem areas), businessCheck/ (questions, sector examples, engine, service catalogue)
drizzle/          PostgreSQL schema (schema.ts) and migrations (migrations/); mysql-archive/ is history only
api/index.js      GENERATED server bundle for Vercel. Never edit; `pnpm build` regenerates it
test/             All tests, mirroring the source folders: test/client, test/server, test/shared,
                  test/db (database contract tests), test/fixtures
docs/             docs/product/: the six product documents (PRD, technical requirements, app flow, design brief,
                  backend schema, implementation plan); operational notes; docs/vercel-env-inventory.md lists every env variable
```

- **Hosting:** Vercel. Static client from `vite build`; all server routes go through one function, `api/index.js`, via the rewrites in `vercel.json`.
- **Database:** PostgreSQL on Supabase through Drizzle and node-postgres. At runtime `DATABASE_URL` uses the Transaction Pooler (port 6543, one connection per function instance). Migrations use `MIGRATION_DATABASE_URL` (Session Pooler, port 5432). Schema changes go through `drizzle/schema.ts` then `pnpm db:generate`; never edit the database by hand.
## Authentication and authorisation

The platform is multi-role. Do not design authentication around a simple
`user/admin` distinction.

### Identity

A person has one platform identity. Roles and permissions are assigned to that
identity.

A person may hold more than one internal role. Do not duplicate accounts to
represent different responsibilities.

### Platform roles

The platform must support:

- `client` — an external business owner. May access only their own business,
  engagement, diagnostic, measures, check-ins, files, payment information and
  related portal records.

- `analyst` — internal delivery staff. May work only on clients/engagements
  assigned to them unless a wider permission is explicitly granted.

- `desk_lead` — owns the engagement desk and delivery quality. May oversee all
  engagements, assign analysts, run/review diagnostics, approve prescriptions,
  review check-ins and close or extend engagements.

- `partner` — partner/co-founder involvement. May access engagements assigned
  to them or engagements requiring partner review. Partner status must not
  automatically grant platform administration.

- `subject_matter_expert` — specialist invited into a specific engagement or
  problem area. Access is assignment-scoped and should be minimal.

- `finance` — commercial/payment role. May access the financial and payment
  information needed for collections, reconciliation and reporting, but does
  not receive unrestricted access to confidential diagnostic material by
  default.

- `admin` — platform operations role. Administrative actions are capability
  based; being an admin does not automatically mean unrestricted access.

- `super_admin` — platform owner with full access to platform administration,
  roles and permissions. This role cannot be restricted by ordinary admins.

### Non-authenticated actor

A `public/prospect` is not an authenticated role. Public visitors may access
explicitly public procedures such as the Free Business Check and application
forms.

### System actors

AI, scheduled jobs and other automated services are system actors, not human
roles. Never create interactive user accounts for them. Their actions must be
server-controlled and auditable.

### RBAC rules

Use role-based access control plus explicit permissions.

Do not scatter checks such as:

`if (role === "analyst")`

through business logic when a named permission or scope is more appropriate.

Prefer checks such as:

- `view_all_engagements`
- `view_assigned_engagements`
- `manage_engagements`
- `assign_engagements`
- `review_prescriptions`
- `manage_clients`
- `manage_payments`
- `view_financials`
- `manage_scheduling`
- `manage_communications`
- `manage_users`
- `manage_roles`
- `manage_admins`
- `manage_platform_settings`

The exact permission catalogue lives in one shared source of truth.

### Assignment scope

Internal delivery access is not determined by role alone.

Analysts, partners and subject-matter experts may be assigned to individual
clients or engagements.

A role answers:

"What kind of responsibility does this person have?"

An assignment answers:

"Which client or engagement may this person exercise it on?"

Server-side authorisation must check both where required.

### Security boundary

Client isolation is non-negotiable.

A client must never be able to access another client's records by changing a
URL, id, token or request payload.

Authorisation is enforced on the server. Hiding a button in React is never an
authorisation control.

Every protected tRPC procedure must declare its required authentication,
permission and/or resource scope.

### Authentication

Authentication and authorisation are separate:

- Authentication proves who the person is.
- Roles and permissions determine what that person may do.
- Assignments determine which client/engagement records they may access.

The authentication implementation must allow new roles to be introduced without
redesigning login.

### Current email constraint

Email-domain verification and outbound transactional email are temporarily
deferred.

Do not make successful outbound email a prerequisite for the first
authentication implementation.

Password authentication may be implemented and tested without sending email.
Password-reset and invitation delivery can remain simulated/manual until the
mail domain is verified.

Do not weaken token, password or session security simply because email delivery
is deferred.

- **Single sources of truth:** names, mailboxes and brand colours in `shared/brand.ts`; prices, the journey and the ten problem areas in `shared/businessSupport.ts`; business check questions in `shared/businessCheck/questions.ts`, sector examples in `sectorExamples.ts`, path and scoring rules in `engine.ts`, recommendable services in `catalogue.ts`.

## Testing

- Put tests in `test/`, at the path that mirrors the source file (`server/routers/x.ts` → `test/server/routers/x.test.ts`). Import source through the aliases `@/`, `@shared/`, `@server/`.
- Tests must run offline with no secrets. Mock email, the AI model and third-party APIs. Tests that need real credentials or a real database are skipped unless their variable is set (`VALIDATE_*`, `TEST_DATABASE_URL`).
- Database behaviour: add to `test/db/` using the PGlite harness (`test/db/harness.ts`), so it runs in `pnpm test` and against a real PostgreSQL with `pnpm test:db`.
- The business check has golden snapshots (`test/server/businessCheck.profiles.golden.test.ts`). Update a snapshot only for an intended change to the path, scoring or summary, and say why in the commit.
- UI tests use Testing Library with jsdom. Set `MotionGlobalConfig.skipAnimations = true` for animated screens.

## Conventions

- Copy: British English, second person, short sentences, naira in full (₦100,000). On the site, never "door", "sprint", "playbook" or "retainer". The business check sits between consulting terms and plain English: keep the term, say what it means.
- Colours come from the theme tokens in `client/src/index.css`; do not hard-code hex values in components.
- React effects must not return a value other than a cleanup function (the claude.ai preview frame breaks if they do).
- Keep changes focused. Match the surrounding code's style and comment density.
- Commit messages say what changed and why. - During pre-launch development, work on `main` for contained, reversible changes unless the change is high-risk or the owner explicitly asks for a branch. Database migrations, major auth redesigns and destructive changes should use a dedicated branch.





PUBLIC
      │
      ├── Free Business Check
      ├── Apply
      └── Sign in
              │
              ▼
      Email + password
              │
              ▼
      Identify account
              │
              ▼
      Create secure session
              │
              ▼
      Resolve roles + permissions
              │
       ┌──────┼──────────────┐
       ▼      ▼              ▼
    Client  Internal       Admin
    Portal  Workspace      Console