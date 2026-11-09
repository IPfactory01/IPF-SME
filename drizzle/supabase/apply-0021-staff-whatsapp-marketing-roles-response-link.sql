-- The Shift: apply migration 0021 (staff WhatsApp numbers, the Digital marketing roles, a link that answers an item).
-- Does exactly what `pnpm db:migrate` would: adds two project roles to engagement_team_role ('digital_marketer',
-- 'content_producer'), three columns (users."whatsapp" and users."whatsappConsentAt": a staff member's WhatsApp number
-- and when they agreed to it being shown to their clients; engagement_tasks."responseLink": a shared-folder link that
-- answers an item), and records the migration in drizzle.__drizzle_migrations. Additive only: every new column is empty,
-- no data is changed and no client's room or team is affected.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0020. Paste the whole
-- script into the Supabase SQL Editor and press Run. Apply it BEFORE deploying the code that uses it.
-- Generated from drizzle/migrations/0021_staff_whatsapp_marketing_roles_response_link.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 21 then
    raise exception 'Stopped, nothing changed: expected 21 recorded migrations (0000 to 0020), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '7d212a8969776bfeed77e94f170536a90f4e1a26a8e4280dc5ece2cc62de16a6') then
    raise exception 'Stopped, nothing changed: migration 0020 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'whatsapp') then
    raise exception 'Stopped, nothing changed: users."whatsapp" already exists.';
  end if;
end
$guard$;

ALTER TYPE "public"."engagement_team_role" ADD VALUE 'digital_marketer';
ALTER TYPE "public"."engagement_team_role" ADD VALUE 'content_producer';
ALTER TABLE "engagement_tasks" ADD COLUMN "responseLink" varchar(2048);
ALTER TABLE "users" ADD COLUMN "whatsapp" varchar(20);
ALTER TABLE "users" ADD COLUMN "whatsappConsentAt" timestamp with time zone;
insert into drizzle.__drizzle_migrations (hash, created_at) values ('319bec1d587092a2cd73ac6d47abeddecb8afdd6502aebda5cce8ed69e58d348', 1794247577033);

commit;
