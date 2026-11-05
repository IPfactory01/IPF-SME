-- The Shift: apply migration 0013 (Engagement Manager as a project role; a firm title on each person).
-- Does exactly what `pnpm db:migrate` would: adds 'manager' to engagement_team_role and users.jobTitle, and records the
-- migration in drizzle.__drizzle_migrations. Additive only: one enum value and one nullable column, no data touched.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0012. Paste the whole
-- script into the Supabase SQL Editor and press Run. Apply it BEFORE deploying the code that uses it: the client room
-- reads users.jobTitle. Generated from drizzle/migrations/0013_team_roles_and_titles.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 13 then
    raise exception 'Stopped, nothing changed: expected 13 recorded migrations (0000 to 0012), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '74dd58f2c29e942a07c9545712ebed4001eae30cfd5d29367cedc14dcfefaf0f') then
    raise exception 'Stopped, nothing changed: migration 0012 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'jobTitle') then
    raise exception 'Stopped, nothing changed: users.jobTitle already exists.';
  end if;
end
$guard$;

ALTER TYPE "public"."engagement_team_role" ADD VALUE 'manager' BEFORE 'lead';
ALTER TABLE "users" ADD COLUMN "jobTitle" varchar(80);
insert into drizzle.__drizzle_migrations (hash, created_at) values ('98755a1a622ec194abe1097c0f1e9100c20ff5401978aaa2674e8c4d8eec035b', 1793870126978);

commit;
