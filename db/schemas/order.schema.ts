import { ORDER_STATUSES, OrderStatus } from "@/domain/enums/order-status";
import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { restaurants } from "./restaurant.schema";
import { users } from "./user.schema";

export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);

/** A snapshot of the delivery address at order time; addresses have no owning user until O5. */
export type TOrderDeliveryAddress = {
	line1: string;
	line2: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber: string | null;
};

/** One order placed by a customer against one restaurant. */
export const orders = pgTable(
	"orders",
	{
		id: uuid().primaryKey().defaultRandom(),
		restaurantId: uuid()
			.notNull()
			.references(() => restaurants.id, { onDelete: "cascade" }),
		/**
		 * Denormalized from the restaurant, so owner-scoped queries need no
		 * join. Must be kept equal to the restaurant's `ownerId`.
		 */
		ownerId: uuid().notNull(),
		userId: uuid()
			.notNull()
			.references(() => users.id),
		status: orderStatusEnum().notNull().default(OrderStatus.Placed),
		/** Sum of item `priceInPaiseSnapshot * quantity`, computed server-side. */
		totalInPaise: integer().notNull(),
		deliveryAddress: jsonb().$type<TOrderDeliveryAddress>().notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("orders_owner_restaurant_created_idx").on(
			table.ownerId,
			table.restaurantId,
			table.createdAt,
		),
		index("orders_user_created_idx").on(table.userId, table.createdAt),
		check("orders_total_in_paise_check", sql`${table.totalInPaise} >= 0`),
	],
);

/** Plain row shape returned by `OrderRepository`. */
export type TOrder = {
	id: string;
	restaurantId: string;
	ownerId: string;
	userId: string;
	status: OrderStatus;
	totalInPaise: number;
	deliveryAddress: TOrderDeliveryAddress;
	createdAt: Date;
	updatedAt: Date;
};
