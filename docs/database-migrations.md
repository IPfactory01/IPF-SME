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

**`0009` and deployment order.** The Debrief record (`debriefs`) and the Work Plan fields (`weekNumber`, `sortOrder` on
`engagement_sessions` and `engagement_tasks`; `factor` on `engagement_tasks`). Additive only, but the engagement queries read
the new columns, so **apply it with the deployment that carries it**: until then the admin Engagements section and the
client room say the room is not up to date (migration 0009), the Debrief summary says it is not set up, and confirming a
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
