ALTER TABLE "engagement_fee_lines" ADD COLUMN "paidReference" varchar(64);--> statement-breakpoint
ALTER TABLE "engagements" ADD COLUMN "opensOnPayment" boolean DEFAULT false NOT NULL;