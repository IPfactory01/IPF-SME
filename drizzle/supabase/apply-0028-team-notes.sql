-- The Shift: apply migration 0028 (team notes on a client's Work Plan item; Backend schema).
-- Does exactly what `pnpm db:migrate` would. It adds one column, engagement_task_comments.internal (true or false,
-- false for every message already there), which marks a team note: inside IP Factory only, never shown or emailed to the
-- client. Nothing is removed or changed. It records the migration in drizzle.__drizzle_migrations.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0027. Paste the whole
-- script into the Supabase SQL Editor and press Run.
-- Apply it just BEFORE deploying the code for team notes.
-- Generated from drizzle/migrations/0028_team_notes.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 28 then
    raise exception 'Stopped, nothing changed: expected 28 recorded migrations (0000 to 0027), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = 'fd096b45df129fbe218cc4db623902ec2a30f84968f83dc8093569be0eaefa00') then
    raise exception 'Stopped, nothing changed: migration 0027 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagement_task_comments' and column_name = 'internal') then
    raise exception 'Stopped, nothing changed: engagement_task_comments.internal already exists.';
  end if;
end
$guard$;

ALTER TABLE "engagement_task_comments" ADD COLUMN "internal" boolean DEFAULT false NOT NULL;

insert into drizzle.__drizzle_migrations (hash, created_at) values ('416afc38b4dd566a31625c0068a849174bc02708fea3e8cd96743f051acb4df8', 1794842542239);

commit;
