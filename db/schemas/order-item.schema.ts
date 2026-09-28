import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { menuItems } from "./menu-item.schema";
import { orders } from "./order.schema";

/**
 * One line of an order, with the menu item's name and price snapshotted at
 * order time so later menu edits never change a past order's total.
 */
export const orderItems = pgTable(
	"order_items",
	{
		id: uuid().primaryKey().defaultRandom(),
		orderId: uuid()
			.notNull()
			.references(() => orders.id, { onDelete: "cascade" }),
		/** Null once the source item is deleted; the snapshot fields still apply. */
		menuItemId: uuid().references(() => menuItems.id, {
			onDelete: "set null",
		}),
		nameSnapshot: text().notNull(),
		priceInPaiseSnapshot: integer().notNull(),
		quantity: integer().notNull(),
	},
	(table) => [
		index("order_items_order_id_idx").on(table.orderId),
		check(
			"order_items_price_in_paise_check",
			sql`${table.priceInPaiseSnapshot} >= 0`,
		),
		check("order_items_quantity_check", sql`${table.quantity} > 0`),
	],
);

/** Plain row shape returned by `OrderRepository`. */
export type TOrderItem = {
	id: string;
	orderId: string;
	menuItemId: string | null;
	nameSnapshot: string;
	priceInPaiseSnapshot: number;
	quantity: number;
};
