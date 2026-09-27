CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."auth_token_purpose" AS ENUM('magic_link', 'oauth_state');--> statement-breakpoint
CREATE TYPE "public"."food_type" AS ENUM('veg', 'egg', 'non-veg');--> statement-breakpoint
CREATE TYPE "public"."restaurant_status" AS ENUM('online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'restaurant', 'user');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zipcode" text NOT NULL,
	"phone_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"purpose" "auth_token_purpose" NOT NULL,
	"intended_role" "user_role",
	"code_verifier" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price_in_paise" integer NOT NULL,
	"food_type" "food_type" NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_price_in_paise_check" CHECK ("menu_items"."price_in_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "restaurants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "restaurant_status" DEFAULT 'online' NOT NULL,
	"address_id" uuid NOT NULL,
	"cuisines" text[] DEFAULT '{}' NOT NULL,
	"is_pure_veg" boolean DEFAULT false NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "restaurants_addressId_unique" UNIQUE("address_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"first_name" text,
	"last_name" text,
	"is_onboarded" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"google_sub" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_googleSub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_email_idx" ON "auth_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "menu_items_restaurant_category_name_idx" ON "menu_items" USING btree ("restaurant_id","category","name");--> statement-breakpoint
CREATE INDEX "menu_items_owner_id_idx" ON "menu_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "menu_items_location_gix" ON "menu_items" USING gist ("location");--> statement-breakpoint
CREATE INDEX "restaurants_owner_id_idx" ON "restaurants" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "restaurants_status_idx" ON "restaurants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "restaurants_location_gix" ON "restaurants" USING gist ("location");