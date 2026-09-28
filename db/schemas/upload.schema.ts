import { UPLOAD_KINDS, type UploadKind } from "@/domain/enums/upload-kind";
import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { menuItems } from "./menu-item.schema";
import { restaurants } from "./restaurant.schema";
import { users } from "./user.schema";

export const uploadKindEnum = pgEnum("upload_kind", UPLOAD_KINDS);

/**
 * A pending (not yet confirmed) S3 upload for a restaurant's logo/banner or a
 * menu item's photo. The row is deleted the moment it is either confirmed
 * (`RestaurantService.confirmImageUpload`/`confirmMenuItemImageUpload`) or
 * cancelled/swept -- this table never holds confirmed uploads, only
 * in-flight ones.
 *
 * `restaurantId` and `menuItemId` are `onDelete: "set null"` rather than
 * `cascade`: the restaurant or item can be deleted while an upload for it is
 * mid-flight, and the row must survive so `UploadCleanupSubscriber` still
 * finds and deletes the orphaned S3 object.
 */
export const uploads = pgTable(
	"uploads",
	{
		id: uuid().primaryKey().defaultRandom(),
		ownerId: uuid()
			.notNull()
			.references(() => users.id),
		restaurantId: uuid().references(() => restaurants.id, {
			onDelete: "set null",
		}),
		/** Set only for a `menu_item` kind upload. */
		menuItemId: uuid().references(() => menuItems.id, {
			onDelete: "set null",
		}),
		kind: uploadKindEnum().notNull(),
		/** Unique S3 object key the presigned POST was issued for. */
		objectKey: text().notNull().unique(),
		contentType: text().notNull(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("uploads_expires_at_idx").on(table.expiresAt)],
);

/** Plain row shape returned by `UploadRepository`. */
export type TUpload = {
	id: string;
	ownerId: string;
	restaurantId: string | null;
	menuItemId: string | null;
	kind: UploadKind;
	objectKey: string;
	contentType: string;
	expiresAt: Date;
	createdAt: Date;
};
