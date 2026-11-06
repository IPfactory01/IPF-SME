# Database migration state

The Supabase database is changed only by `pnpm db:migrate`; never by hand. The authoritative record is the database itself:
run `pnpm db:verify` (read-only, needs `MIGRATION_DATABASE_URL`). It reports PASS only when every migration in
`drizzle/migrations/meta/_journal.json` is recorded in `drizzle.__drizzle_migrations` with a matching hash.

## Applied to the Supabase database (permanent `public` schema)

| Migration | Applied | What it does |
|---|---|---|
| `0000_postgres_baseline` | before 2026-10-07 | The 30 tables and 42 enum types migrated from MySQL |
| `0001_business_check_pipeline` | 2026-10-07 | `business_checks`: pipeline stage enum (43 enums total), `pipelineStage`, `heardFrom`, `completedAt`, `updatedAt`; result columns made nullable; existing rows backfilled |
| `0002_universal_accounts_and_businesses` | 2026-10-07 | `user_credentials`, `user_sessions`, `businesses`, `business_memberships`; `users.status`; unique `lower(email)` index on `users`; 4 enum types (47 total) |
| `0003_client_onboarding_invitations` | applied (confirmed by `db:verify`) | `client_onboarding_invitations` (token hash, status, expiry, links to the business check, issuer, accepted user and business); 2 enum types (49 total); partial unique index (one pending invitation per business check) |
| `0004_platform_roles_and_active_workspace` | applied (confirmed by `db:verify`) | `user_platform_roles` (userId, role, grantedByUserId; unique per user and role; 7-value role enum, 50 enums total); `user_sessions.activeBusinessId` (nullable, set null if the business is deleted) |
| `0005_business_check_call_scheduled` | applied (confirmed 9 October 2026: recorded in `drizzle.__drizzle_migrations`) | `business_checks.callScheduledFor` (nullable timestamptz): the time an administrator agreed the discovery call for. `ALTER TABLE "business_checks" ADD COLUMN "callScheduledFor" timestamp with time zone;` |
| `0006_payment_requests` | 9 October 2026 | `payment_requests` (one row per business check and item: full report or Current State Assessment; amount, transfer reference, status requested / proof received / confirmed, who sent and confirmed it); 3 enum types (53 total); 3 foreign keys (15 total); unique index per check and item. Additive: one new table, nothing existing changes. |
| `0007_full_reports` | 9 October 2026 | `full_reports` (one per business check: the Report Intake link hash, status awaiting intake / delivered, the intake answers, when it was submitted and sent, the report version); 2 enum types (55 total); 2 foreign keys (17 total). Additive. |
| `0008_engagement_room` | 10 October 2026 (Supabase SQL Editor, the guarded script `drizzle/supabase/apply-0008-engagement-room.sql`) | The engagement room: `engagements`, `engagement_team`, `engagement_sessions`, `engagement_tasks`, `engagement_deliverables`, `engagement_files`, `engagement_comments`, `engagement_measures`, `engagement_checkins`, `business_member_access`, `account_invitations`; 14 enum types (69 total); 34 foreign keys (51 total). Additive: no existing table changes. |
| `0009_debrief_work_plan` | before 12 October 2026 (found recorded on 12 October, when its guarded script refused to run a second time) | `debriefs` (one per business check); `weekNumber` and `sortOrder` on `engagement_sessions` and `engagement_tasks`; `factor` on `engagement_tasks`. Additive |
| `0010_rate_limits_reset_tokens_indexes` | 12 October 2026 (Supabase SQL Editor, the guarded script `drizzle/supabase/apply-0010-rate-limits-reset-tokens-indexes.sql`) | `rate_limit_counters`, `user_password_reset_tokens` and the first index set (business checks, audit log, sessions, engagement comments, files and tasks). Additive |

On 12 October, after `0010`, `pnpm db:verify` found 11 migrations recorded, 52 tables, 71 enums, every declared index
and all 55 foreign keys. Its two failures that day were in the checker, fixed the same day: it did not read the precision
of `numeric(p, s)` columns (from `0008`), and on a Windows checkout it hashed the migration files with CRLF line endings
(it now hashes them as git stores them, with LF; `.gitattributes` keeps `*.sql` as LF on every checkout).

After `0003`, `pnpm db:verify` passed 27/27 (35 tables, 49 enums). After `0004` it expects 36 tables, 50 enums and 12 foreign keys.
Until `0004` is applied, `db:verify` fails and workspace switching, platform roles and the new account context cannot work against
that database (sign-in itself would fail, because the session lookup reads the new column). `0004` is additive: one new table
and one nullable column, so it cannot fail on existing data. **Apply it before deploying this code.**

**`0005` and deployment order.** The new column is part of the `business_checks` schema, so every query on that table (including
the public Free Business Check) reads it. Apply `0005` **before** deploying code that includes it, or the public Business Check
will fail until it is applied. It is a single nullable column and cannot fail on existing data.

**`0006` and deployment order.** Payments live in their own table, so the business check, the admin lists and sign-in keep
working if code reaches production before `0006` is applied: the admin record then says "Payments are not set up in the
database yet (migration 0006)", the hosting log says `[Payments] The payment_requests table is missing`, and a report
request still reaches info@ipfactory.co with "Payment details: NOT SENT". Apply `0006` before or straight after deploying.

**`0007` and deployment order.** Same shape as `0006`: a new table only. Apply `0006` and `0007` together with one
`pnpm db:migrate`. Until `0007` is applied, confirming a report payment fails at the point of issuing the report form
link (the payment itself stays recorded), and the admin record shows no report status.

**`0008` and deployment order** (applied 10 October, kept for the record). New tables only, and no existing query reads them, so the code could reach production
before `0008` was applied: confirming a Current State Assessment payment still confirms it, sends the emails and the
invitation (the hosting log says `[Engagements] The engagements table is missing: apply migration 0008`), onboarding
still creates the account, a client's dashboard shows no room, and the admin Engagements section says the room is not set
up yet. **Apply it before the first Current State Assessment payment is confirmed.** If a payment is confirmed first, the
admin Engagements section lists it under "Paid, but no engagement yet" once `0008` is applied, and the desk lead
starts it with one click.

**`0010`.** Rate-limit counters (`rate_limit_counters`), password reset links (`user_password_reset_tokens`) and the
first index set (business checks, the audit log, sessions, engagement comments, files and tasks). Additive only. Until it
is applied the rate limits fall back to per-instance memory (the log says so once), password reset links say they are not
set up, and nothing else changes. Apply with `pnpm db:migrate`, or paste
`drizzle/supabase/apply-0010-rate-limits-reset-tokens-indexes.sql` into the Supabase SQL Editor and press Run: it stops,
changing nothing, unless exactly `0000` to `0009` are recorded and none of the new tables or indexes exist, then applies
the migration and records `0010` with the file hash and journal timestamp.

**`0009` and deployment order.** The Discovery Call record (`debriefs`) and the Work Plan fields (`weekNumber`, `sortOrder` on
`engagement_sessions` and `engagement_tasks`; `factor` on `engagement_tasks`). Additive only, but the engagement queries read
the new columns, so **apply it with the deployment that carries it**: until then the admin Engagements section and the
client room say the room is not up to date (migration 0009), the Discovery Call summary says it is not set up, and confirming a
Current State Assessment payment still confirms it (the engagement is started once `0009` is applied, from "Paid, but no
engagement yet"). Apply with `pnpm db:migrate`, or paste `drizzle/supabase/apply-0009-debrief-work-plan.sql` into the
Supabase SQL Editor and press Run: it stops, changing nothing, unless exactly `0000` to `0008` are recorded, no `debriefs`
table exists and `engagement_tasks` has no `weekNumber`, then applies the migration and records `0009` with the file hash and
journal timestamp.

**How to apply `0008`.** `pnpm db:migrate`, or paste `drizzle/supabase/apply-0008-engagement-room.sql` into the Supabase
SQL Editor and press Run: it stops, changing nothing, unless exactly `0000` to `0007` are recorded and no engagement table
exists, then creates the tables and records `0008` with the file hash and journal timestamp, so `pnpm db:verify` passes
afterwards. Tested on a copy at `0007`: same result as `pnpm db:migrate`, and a second run is refused.

**How `0006` and `0007` were applied.** On 9 October 2026, from the Supabase SQL Editor, with a guarded script that does
what `pnpm db:migrate` does in one transaction: it refused to run unless exactly `0000` to `0005` were recorded and neither
table existed, ran the two migration files unchanged, and recorded both in `drizzle.__drizzle_migrations` with the file
hashes and journal timestamps. Result: both tables present, 8 migrations recorded, so `pnpm db:verify` and the next
`pnpm db:migrate` stay in step. Future migrations should still go through `pnpm db:migrate`.

**`0012` and deployment order.** Two-step sign-in and roles that end on a date: `user_two_step` (new),
`user_platform_roles.expiresAt`, `account_invitations.roleExpiresAt`, `user_sessions.twoStepVerifiedAt` and
`user_sessions.deviceHash`. Additive: one table and four nullable columns. **Apply it before deploying the code**: every
sign-in reads the new session columns, so sign-in fails until it is applied. Apply with `pnpm db:migrate`, or paste
`drizzle/supabase/apply-0012-two-step-and-access-expiry.sql` into the Supabase SQL Editor and press Run: it stops,
changing nothing, unless exactly `0000` to `0011` are recorded and `user_two_step` does not exist, then applies the
migration and records `0012`. After it is applied and the code is live, every staff member sets up two-step sign-in at
their next sign-in.

**`0013` and deployment order.** Engagement Manager as a role on an engagement (`engagement_team_role` gains `manager`;
the stored values keep their names, and their labels are now Engagement Manager, Lead Consultant, Analyst, Partner and
Specialist) and a firm title on each person (`users.jobTitle`: Partner, Vice President, Senior Associate, Associate,
Senior Business Analyst, Business Analyst, or free text). Additive. **Apply it before deploying**: the client room
reads `users.jobTitle`. Paste `drizzle/supabase/apply-0013-team-roles-and-titles.sql` into the Supabase SQL Editor and
press Run; it stops, changing nothing, unless exactly `0000` to `0012` are recorded.

**`0014` and deployment order.** The Data Request drop box. Clients upload files without naming the item each answers,
and the team matches each file to one or more Data Requests (`engagement_file_matches`). Data Requests gain a section,
reference, purpose (`informs`), format and priority; `engagement_tasks_status` gains `not_available` (the client has
no such record); `engagement_files` gains the client's `note`. Additive. **Apply it before deploying**: the client room
reads the new columns. Paste `drizzle/supabase/apply-0014-drop-box-and-file-matches.sql` into the Supabase SQL Editor
and press Run; it stops, changing nothing, unless exactly `0000` to `0013` are recorded.

**`0015` and deployment order.** Staff are invited by level (Partner, Vice President, Senior Associate, Associate,
Senior Business Analyst, Business Analyst, Specialist, Finance), and the level decides their roles (`LEVEL_ROLES` in
`shared/platformPermissions.ts`). `account_invitations.jobTitle` keeps the level until the person accepts. Additive.
**Apply it before deploying.** Paste `drizzle/supabase/apply-0015-staff-invitation-level.sql` into the Supabase SQL
Editor and press Run; it stops, changing nothing, unless exactly `0000` to `0014` are recorded.

**`0016` and deployment order.** Engagement types: every engagement has a type (`business_review`, the default for
every existing one, or `digital_marketing`), which sets its timeline and starting content (`shared/engagementTypes.ts`).
An engagement can now be opened directly, without a Business Health Check (`businessCheckId` nullable, with
`startedOn`, `contactName` and `contactEmail`), and its client is invited as the owner (`account_invitations_kind`
gains `business_owner`). Additive. **Apply it before deploying.** Paste
`drizzle/supabase/apply-0016-engagement-types.sql` into the Supabase SQL Editor and press Run; it stops, changing
nothing, unless exactly `0000` to `0015` are recorded.

