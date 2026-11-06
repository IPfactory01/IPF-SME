-- The Shift: apply migration 0016 (engagement types; engagements opened directly, without a Business Health Check).
-- Does exactly what `pnpm db:migrate` would: adds the engagement type (Business Review, Digital marketing), a start
-- date and a contact on engagements, lets an engagement have no Business Health Check, adds the business-owner
-- invitation, and records the migration in drizzle.__drizzle_migrations. Additive: every existing engagement becomes
-- a Business Review, as it is today; no data is removed.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0015. Paste the whole
-- script into the Supabase SQL Editor and press Run. Apply it BEFORE deploying the code that uses it.
-- Generated from drizzle/migrations/0016_engagement_types.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 16 then
    raise exception 'Stopped, nothing changed: expected 16 recorded migrations (0000 to 0015), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = 'd952eae7ddce93270c6f775582db5b68d04521f375571f94dc5e7325c0a0c972') then
    raise exception 'Stopped, nothing changed: migration 0015 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagements' and column_name = 'type') then
    raise exception 'Stopped, nothing changed: engagements.type already exists.';
  end if;
end
$guard$;

CREATE TYPE "public"."engagements_type" AS ENUM('business_review', 'digital_marketing');
ALTER TYPE "public"."account_invitations_kind" ADD VALUE 'business_owner';
ALTER TABLE "engagements" ALTER COLUMN "businessCheckId" DROP NOT NULL;
ALTER TABLE "engagements" ADD COLUMN "type" "engagements_type" DEFAULT 'business_review' NOT NULL;
ALTER TABLE "engagements" ADD COLUMN "startedOn" date;
ALTER TABLE "engagements" ADD COLUMN "contactName" varchar(200);
ALTER TABLE "engagements" ADD COLUMN "contactEmail" varchar(320);
insert into drizzle.__drizzle_migrations (hash, created_at) values ('3c87c1b690d2ee100149e31a6c27d27b097261857bd25953e23f5e3f7c97bc57', 1793970366017);

commit;
