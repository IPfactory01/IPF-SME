ALTER TYPE "public"."engagement_team_role" ADD VALUE 'manager' BEFORE 'lead';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "jobTitle" varchar(80);