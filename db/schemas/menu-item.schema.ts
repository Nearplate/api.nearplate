import { FOOD_TYPES, type FoodType } from "@/domain/enums/food-type";
import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { geoPoint, type TGeoPoint } from "./geo";
import { restaurants } from "./restaurant.schema";

export const foodTypeEnum = pgEnum("food_type", FOOD_TYPES);

/** One dish on a restaurant's menu. */
export const menuItems = pgTable(
	"menu_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		/**
		 * Denormalized from the restaurant so owner-scoped queries need no join.
		 * Must be kept equal to the restaurant's `ownerId` (ownership never
		 * transfers).
		 */
		ownerId: uuid().notNull(),
		name: text().notNull(),
		category: text().notNull(),
		/** Integer paise (1/100 rupee): no floating-point money. */
		priceInPaise: integer().notNull(),
		foodType: foodTypeEnum().notNull(),
		isAvailable: boolean().notNull().default(true),
		/** Short description shown on the item's card. */
		description: text(),
		/** Public https URL to the item's photo. */
		imageUrl: text(),
		/**
		 * Denormalized copy of the restaurant's location, for geo queries on
		 * items. Must be updated whenever the restaurant's location changes.
		 */
		location: geoPoint().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("menu_items_restaurant_category_name_idx").on(
			table.restaurantId,
			table.category,
			table.name,
		),
		index("menu_items_owner_id_idx").on(table.ownerId),
		index("menu_items_location_gix").using("gist", table.location),
		check("menu_items_price_in_paise_check", sql`${table.priceInPaise} >= 0`),
	],
);

/** Plain row shape returned by `MenuItemRepository`. */
export type TMenuItem = {
	id: string;
	restaurantId: string;
	ownerId: string;
	name: string;
	category: string;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
	description: string | null;
	imageUrl: string | null;
	location: TGeoPoint;
	createdAt: Date;
	updatedAt: Date;
};
