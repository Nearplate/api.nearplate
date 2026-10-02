import {
	RESTAURANT_DOCUMENT_STATUSES,
	type RestaurantDocumentStatus,
} from "@/domain/enums/restaurant-document-status";
import {
	RESTAURANT_DOCUMENT_TYPES,
	type RestaurantDocumentType,
} from "@/domain/enums/restaurant-document-type";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { restaurants } from "./restaurant.schema";
import { users } from "./user.schema";

export const restaurantDocumentTypeEnum = pgEnum(
	"restaurant_document_type",
	RESTAURANT_DOCUMENT_TYPES,
);

export const restaurantDocumentStatusEnum = pgEnum(
	"restaurant_document_status",
	RESTAURANT_DOCUMENT_STATUSES,
);

/**
 * One KYC document per (restaurant, type), stored in the private documents
 * bucket (`S3DocumentStorageAdapter`). A new upload for a type overwrites the
 * row back to `pending` until it is confirmed; `expiresAt` is set only while
 * pending so `UploadCleanupSubscriber` can sweep abandoned uploads.
 */
export const restaurantDocuments = pgTable(
	"restaurant_documents",
	{
		id: uuid().primaryKey().defaultRandom(),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		ownerId: uuid()
			.notNull()
			.references(() => users.id),
		type: restaurantDocumentTypeEnum().notNull(),
		/** Server-generated key in the private bucket; never client-supplied. */
		objectKey: text().notNull().unique(),
		contentType: text().notNull(),
		/** Declared size in bytes; checked against S3 on confirm. */
		size: integer().notNull(),
		status: restaurantDocumentStatusEnum().notNull(),
		expiresAt: timestamp({ withTimezone: true }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("restaurant_documents_restaurant_type_key").on(
			table.restaurantId,
			table.type,
		),
		index("restaurant_documents_expires_at_idx").on(table.expiresAt),
	],
);

/** Plain row shape returned by `RestaurantDocumentRepository`. */
export type TRestaurantDocument = {
	id: string;
	restaurantId: string;
	ownerId: string;
	type: RestaurantDocumentType;
	objectKey: string;
	contentType: string;
	size: number;
	status: RestaurantDocumentStatus;
	expiresAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
