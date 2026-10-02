CREATE TABLE "restaurant_kyc" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"pan_number_encrypted" text,
	"fssai_number" text,
	"account_holder_name" text,
	"account_number_encrypted" text,
	"ifsc_code" text,
	"bank_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_kyc" ADD CONSTRAINT "restaurant_kyc_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_kyc" ADD CONSTRAINT "restaurant_kyc_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;