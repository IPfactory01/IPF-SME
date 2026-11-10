-- The Shift: apply migration 0023 (paid in arrears, R74; Backend schema, engagements).
-- Does exactly what `pnpm db:migrate` would. It adds one column, engagements.paidInArrears, false for every
-- engagement: a Partner or the Super Admin turns it on for a Digital Marketing client paid in arrears, whose fees then
-- fall due 30, 60 and 90 days after the kickoff. Nothing that exists is changed or removed. It records the migration in
-- drizzle.__drizzle_migrations.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0022. Paste the whole
-- script into the Supabase SQL Editor and press Run.
-- Apply it just BEFORE deploying the arrears code: that code reads the column on every engagement's fees.
-- Generated from drizzle/migrations/0023_engagement_paid_in_arrears.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 23 then
    raise exception 'Stopped, nothing changed: expected 23 recorded migrations (0000 to 0022), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '1e5386e0abdbf738d34011a4996d0606bda241934aa3b9534df26a5c301e995a') then
    raise exception 'Stopped, nothing changed: migration 0022 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagements' and column_name = 'paidInArrears') then
    raise exception 'Stopped, nothing changed: engagements.paidInArrears already exists.';
  end if;
end
$guard$;

ALTER TABLE "engagements" ADD COLUMN "paidInArrears" boolean DEFAULT false NOT NULL;

insert into drizzle.__drizzle_migrations (hash, created_at) values ('d892919094016e3aa8eb078f4fa9708d7fca7fca38f7414e160dece458157d5d', 1794340605524);

commit;
