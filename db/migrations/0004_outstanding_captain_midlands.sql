ALTER TYPE "public"."upload_kind" ADD VALUE 'menu_item';--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "menu_item_id" uuid;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;