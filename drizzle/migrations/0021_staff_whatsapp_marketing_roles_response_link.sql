ALTER TYPE "public"."engagement_team_role" ADD VALUE 'digital_marketer';--> statement-breakpoint
ALTER TYPE "public"."engagement_team_role" ADD VALUE 'content_producer';--> statement-breakpoint
ALTER TABLE "engagement_tasks" ADD COLUMN "responseLink" varchar(2048);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsappConsentAt" timestamp with time zone;