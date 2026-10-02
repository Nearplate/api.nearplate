CREATE TYPE "public"."restaurant_verification_status" AS ENUM('draft', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "status" SET DEFAULT 'offline';--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "verification_status" "restaurant_verification_status" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "verification_status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "restaurants_verification_status_idx" ON "restaurants" USING btree ("verification_status");