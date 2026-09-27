import {
	RESTAURANT_STATUSES,
	RestaurantStatus,
} from "@/domain/enums/restaurant-status";
import {
	boolean,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import type { TAddress } from "./address.schema";
import { addresses } from "./address.schema";
import { geoPoint, type TGeoPoint } from "./geo";
import { users } from "./user.schema";

export const restaurantStatusEnum = pgEnum(
	"restaurant_status",
	RESTAURANT_STATUSES,
);

/** A restaurant owned by exactly one user (`ownerId` = that user's id). */
export const restaurants = pgTable(
	"restaurants",
	{
		id: uuid().primaryKey().defaultRandom(),
		/** Every owner-facing query must be scoped by it. */
		ownerId: uuid()
			.notNull()
			.references(() => users.id),
		name: text().notNull(),
		/** Public URL identifier, generated from `name`; stable across renames. */
		slug: text().notNull().unique(),
		status: restaurantStatusEnum().notNull().default(RestaurantStatus.Online),
		addressId: uuid()
			.notNull()
			.unique()
			.references(() => addresses.id, { onDelete: "restrict" }),
		/** Lowercased and trimmed, so filters match exactly. */
		cuisines: text().array().notNull().default([]),
		isPureVeg: boolean().notNull().default(false),
		location: geoPoint().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("restaurants_owner_id_idx").on(table.ownerId),
		index("restaurants_status_idx").on(table.status),
		index("restaurants_location_gix").using("gist", table.location),
	],
);

/** Plain (read) row shape: `address` populated. */
export type TRestaurant = {
	id: string;
	ownerId: string;
	name: string;
	slug: string;
	status: RestaurantStatus;
	address: TAddress;
	cuisines: string[];
	isPureVeg: boolean;
	location: TGeoPoint;
	createdAt: Date;
	updatedAt: Date;
};
