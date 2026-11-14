CREATE TYPE "public"."engagement_tasks_work" AS ENUM('content', 'marketing', 'engagement');--> statement-breakpoint
ALTER TABLE "engagement_tasks" ADD COLUMN "work" "engagement_tasks_work";--> statement-breakpoint
UPDATE "engagement_tasks" t SET "work" = 'content' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND (t."title" IN ('Logo, colours and fonts', 'Past content that worked', 'Approve the first reels', 'Content plan for month 1', 'Content plan for month 2', 'Content plan for month 3') OR t."title" LIKE 'Send week % footage' OR t."turnaround" IS NOT NULL);
--> statement-breakpoint
UPDATE "engagement_tasks" t SET "work" = 'marketing' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND t."title" IN ('Access to your accounts', 'Your services and prices', 'Your booking link and opening hours', 'Baseline numbers', 'Google Business Profile assessment and growth plan');
--> statement-breakpoint
UPDATE "engagement_tasks" t SET "work" = 'engagement' FROM "engagements" e WHERE e."id" = t."engagementId" AND e."type" = 'digital_marketing' AND t."work" IS NULL AND t."title" = 'Kick-off questions';
--> statement-breakpoint
UPDATE "engagement_tasks" t SET "work" = (CASE m."role" WHEN 'content_producer' THEN 'content' WHEN 'digital_marketer' THEN 'marketing' ELSE 'engagement' END)::"engagement_tasks_work" FROM "engagement_team" m WHERE m."engagementId" = t."engagementId" AND m."userId" = t."requestedByUserId" AND t."work" IS NULL AND t."side" = 'client' AND m."role" IN ('content_producer', 'digital_marketer', 'manager', 'lead');
--> statement-breakpoint
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
--> statement-breakpoint
UPDATE "engagement_tasks" SET "title" = left('Send ' || lower(left("title", 1)) || substr("title", 2), 200) WHERE "section" = 'A Records' AND "kind" = 'data_request' AND "title" NOT LIKE 'Send %';
--> statement-breakpoint
UPDATE "engagement_tasks" SET "title" = left('Answer: ' || "title", 200) WHERE "section" = 'B Questions' AND "kind" = 'data_request' AND "title" NOT LIKE 'Answer%';
