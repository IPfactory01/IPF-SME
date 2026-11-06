CREATE TYPE "public"."engagements_type" AS ENUM('business_review', 'digital_marketing');--> statement-breakpoint
ALTER TYPE "public"."account_invitations_kind" ADD VALUE 'business_owner';--> statement-breakpoint
ALTER TABLE "engagements" ALTER COLUMN "businessCheckId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "type" "engagements_type" DEFAULT 'business_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "startedOn" date;--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "contactName" varchar(200);--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "contactEmail" varchar(320);