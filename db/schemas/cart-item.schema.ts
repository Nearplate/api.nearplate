import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { carts } from "./cart.schema";
import { menuItems } from "./menu-item.schema";

/**
 * One line of a cart. There is no price column: prices are always read live
 * from `menu_items`, so a cart's total always reflects the current menu
 * price (unlike an order, which snapshots price and name at checkout time).
 * `menuItemId` cascades, so a deleted dish simply disappears from any cart
 * that held it.
 */
export const cartItems = pgTable(
	"cart_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		cartId: uuid()
			.notNull()
			.references(() => carts.id, { onDelete: "cascade" }),
		menuItemId: uuid()
			.notNull()
			.references(() => menuItems.id, { onDelete: "cascade" }),
		quantity: integer().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("cart_items_cart_menu_item_uidx").on(
			table.cartId,
			table.menuItemId,
		),
		check("cart_items_quantity_check", sql`${table.quantity} > 0`),
	],
);

/** Plain row shape returned by `CartRepository`. */
export type TCartItem = {
	id: string;
	cartId: string;
	menuItemId: string;
	quantity: number;
	createdAt: Date;
};
