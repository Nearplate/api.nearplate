CREATE TYPE "public"."order_status" AS ENUM('placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"name_snapshot" text NOT NULL,
	"price_in_paise_snapshot" integer NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "order_items_price_in_paise_check" CHECK ("order_items"."price_in_paise_snapshot" >= 0),
	CONSTRAINT "order_items_quantity_check" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'placed' NOT NULL,
	"total_in_paise" integer NOT NULL,
	"delivery_address" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_in_paise_check" CHECK ("orders"."total_in_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_owner_restaurant_created_idx" ON "orders" USING btree ("owner_id","restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");