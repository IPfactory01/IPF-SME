-- The Shift: apply migration 0027 (the kind of work on a Work Plan item, and verb-first titles; Backend schema).
-- Does exactly what `pnpm db:migrate` would. It adds one column, engagement_tasks.work (content, marketing or
-- engagement), which decides who on the team follows up a client's item. It fills it in for the Digital Marketing plan's
-- own items and for requests already sent (from the sender's role), and renames the standard plans' items so each
-- starts with a verb ("Logo, colours and fonts" becomes "Send your logo, colours and fonts"). Nothing is removed.
-- It records the migration in drizzle.__drizzle_migrations.
-- Safe to run once: it stops, changing nothing, unless the database is exactly at migration 0026. Paste the whole
-- script into the Supabase SQL Editor and press Run.
-- Apply it just BEFORE deploying the code for the kind of work.
-- Generated from drizzle/migrations/0027_task_work.sql; regenerate it if that changes.

begin;

do $guard$
declare
  applied integer;
begin
  select count(*) into applied from drizzle.__drizzle_migrations;
  if applied <> 27 then
    raise exception 'Stopped, nothing changed: expected 27 recorded migrations (0000 to 0026), found %.', applied;
  end if;
  if not exists (select 1 from drizzle.__drizzle_migrations where hash = '78ea5e76f92e609d32b89ee4099790b0dd2b2d6c5a549aae80752efcd436f74e') then
    raise exception 'Stopped, nothing changed: migration 0026 is not recorded.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'engagement_tasks' and column_name = 'work') then
    raise exception 'Stopped, nothing changed: engagement_tasks.work already exists.';
  end if;
end
$guard$;

CREATE TYPE "public"."engagement_tasks_work" AS ENUM('content', 'marketing', 'engagement');

ALTER TABLE "engagement_tasks" ADD COLUMN "work" "engagement_tasks_work";

UPDATE "engagement_tasks" t SET "work" = 'content' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND (t."title" IN ('Logo, colours and fonts', 'Past content that worked', 'Approve the first reels', 'Content plan for month 1', 'Content plan for month 2', 'Content plan for month 3') OR t."title" LIKE 'Send week % footage' OR t."turnaround" IS NOT NULL);

UPDATE "engagement_tasks" t SET "work" = 'marketing' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND t."title" IN ('Access to your accounts', 'Your services and prices', 'Your booking link and opening hours', 'Baseline numbers', 'Google Business Profile assessment and growth plan');

UPDATE "engagement_tasks" t SET "work" = 'engagement' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND t."title" = 'Kick-off questions';

UPDATE "engagement_tasks" t SET "work" = (CASE m."role" WHEN 'content_producer' THEN 'content' WHEN 'digital_marketer' THEN 'marketing' ELSE 'engagement' END)::"engagement_tasks_work" FROM "engagement_team" m WHERE m."engagementId" = t."engagementId" AND m."userId" = t."requestedByUserId" AND t."work" IS NULL AND t."side" = 'client' AND m."role" IN ('content_producer', 'digital_marketer', 'manager', 'lead');

UPDATE "engagement_tasks" t SET "title" = v."new" FROM (VALUES
  ('Kick-off questions', 'Answer the kick-off questions'),
  ('Logo, colours and fonts', 'Send your logo, colours and fonts'),
  ('Past content that worked', 'Share past content that worked'),
  ('Access to your accounts', 'Give us access to your accounts'),
  ('Your services and prices', 'Send your services and prices'),
  ('Your booking link and opening hours', 'Send your booking link and opening hours'),
  ('Content plan for month 1', 'Prepare the content plan for month 1'),
  ('Content plan for month 2', 'Prepare the content plan for month 2'),
  ('Content plan for month 3', 'Prepare the content plan for month 3'),
  ('Baseline numbers', 'Record the baseline numbers'),
  ('Google Business Profile assessment and growth plan', 'Assess the Google Business Profile and plan its growth'),
  ('Consultant review', 'Review the work before handover'),
  ('Six quick questions before your first Session', 'Answer six quick questions before your first Session'),
  ('Your sales for the last 12 months', 'Send your sales for the last 12 months'),
  ('What you spend each month', 'List what you spend each month'),
  ('Your price list', 'Send your price list'),
  ('Who works in the business', 'List who works in the business'),
  ('Bank statements for the last 6 months', 'Send bank statements for the last 6 months'),
  ('Money owed to you, and money you owe', 'List money owed to you, and money you owe'),
  ('Anything you already track', 'Send anything you already track'),
  ('Ten customers: why they buy, and why some stopped', 'Tell us why ten customers buy, and why some stopped'),
  ('Your three main competitors and what they charge', 'Find your three main competitors and what they charge'),
  ('Profit by product or outlet, from your numbers', 'Work out profit by product or outlet, from your numbers')
) AS v("old", "new") WHERE t."title" = v."old";

UPDATE "engagement_tasks" SET "title" = left('Send ' || lower(left("title", 1)) || substr("title", 2), 200) WHERE "section" = 'A Records' AND "kind" = 'data_request' AND "title" NOT LIKE 'Send %';

UPDATE "engagement_tasks" SET "title" = left('Answer: ' || "title", 200) WHERE "section" = 'B Questions' AND "kind" = 'data_request' AND "title" NOT LIKE 'Answer%';

insert into drizzle.__drizzle_migrations (hash, created_at) values ('fd096b45df129fbe218cc4db623902ec2a30f84968f83dc8093569be0eaefa00', 1794648485359);

commit;
