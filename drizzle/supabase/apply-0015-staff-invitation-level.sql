-- The Shift: apply migration 0015 (staff are invited by level; the invitation remembers it).
-- Does exactly what `pnpm db:migrate` would: adds account_invitations.jobTitle and records the migration in
-- drizzle.__drizzle_migrations. Additive only: one nullable column, no data touched.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0014. Paste the whole
-- script into the Supabase SQL Editor and press Run. Apply it BEFORE deploying the code that uses it.
-- Generated from drizzle/migrations/0015_staff_invitation_level.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 15 then
    raise exception 'Stopped, nothing changed: expected 15 recorded migrations (0000 to 0014), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '906af022a6084b9f7a18104d5d711f18db6f40728b84d6b9d1f3e9738587ae23') then
    raise exception 'Stopped, nothing changed: migration 0014 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'account_invitations' and column_name = 'jobTitle') then
    raise exception 'Stopped, nothing changed: account_invitations.jobTitle already exists.';
  end if;
end
$guard$;

ALTER TABLE "account_invitations" ADD COLUMN "jobTitle" varchar(80);
insert into drizzle.__drizzle_migrations (hash, created_at) values ('d952eae7ddce93270c6f775582db5b68d04521f375571f94dc5e7325c0a0c972', 1793914624521);

commit;
