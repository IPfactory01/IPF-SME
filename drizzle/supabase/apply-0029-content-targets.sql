-- The Shift: apply migration 0029 (an engagement's own monthly content targets; Backend schema).
-- Does exactly what `pnpm db:migrate` would. It adds one column, engagements.contentTargets (empty for every engagement,
-- so each keeps its type's targets until the lead sets its own, as for MCS's 26 Stories). Nothing is removed or changed.
-- It records the migration in drizzle.__drizzle_migrations.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0028. Paste the whole
-- script into the Supabase SQL Editor and press Run.
-- Apply it just BEFORE deploying the code for content targets.
-- Generated from drizzle/migrations/0029_content_targets.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 29 then
    raise exception 'Stopped, nothing changed: expected 29 recorded migrations (0000 to 0028), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '416afc38b4dd566a31625c0068a849174bc02708fea3e8cd96743f051acb4df8') then
    raise exception 'Stopped, nothing changed: migration 0028 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagements' and column_name = 'contentTargets') then
    raise exception 'Stopped, nothing changed: engagements.contentTargets already exists.';
  end if;
end
$guard$;

ALTER TABLE "engagements" ADD COLUMN "contentTargets" jsonb;

insert into drizzle.__drizzle_migrations (hash, created_at) values ('fa0d95926b6658481e2253b7127f3495cc60182786d67d7fe98a2d3c18bd171d', 1794928841478);

commit;
