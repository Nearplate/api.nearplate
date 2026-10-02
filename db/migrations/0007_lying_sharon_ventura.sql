CREATE TYPE "public"."restaurant_document_status" AS ENUM('pending', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."restaurant_document_type" AS ENUM('aadhaar_front', 'aadhaar_back', 'pan_front', 'pan_back', 'fssai_certificate', 'bank_proof');--> statement-breakpoint
CREATE TABLE "restaurant_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" "restaurant_document_type" NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" "restaurant_document_status" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_documents_objectKey_unique" UNIQUE("object_key"),
	CONSTRAINT "restaurant_documents_restaurant_type_key" UNIQUE("restaurant_id","type")
);
--> statement-breakpoint
ALTER TABLE "restaurant_documents" ADD CONSTRAINT "restaurant_documents_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_documents" ADD CONSTRAINT "restaurant_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "restaurant_documents_expires_at_idx" ON "restaurant_documents" USING btree ("expires_at");