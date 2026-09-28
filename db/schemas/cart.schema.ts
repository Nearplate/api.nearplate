import {
	index,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { restaurants } from "./restaurant.schema";
import { users } from "./user.schema";

/**
 * One user's in-progress order against one restaurant. A user may hold up to
 * `MAX_CARTS_PER_USER` (`src/domain/constants/cart.constants.ts`) carts at
 * once; `CartRepository.evictOldest` deletes the least recently touched one
 * past that limit. `updatedAt` is that "last interacted" timestamp -- every
 * write to the cart or one of its items refreshes it.
 */
export const carts = pgTable(
	"carts",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("carts_user_restaurant_uidx").on(
			table.userId,
			table.restaurantId,
		),
		index("carts_user_updated_idx").on(table.userId, table.updatedAt),
	],
);

/** Plain row shape returned by `CartRepository`. */
export type TCart = {
	id: string;
	userId: string;
	restaurantId: string;
	createdAt: Date;
	updatedAt: Date;
};
