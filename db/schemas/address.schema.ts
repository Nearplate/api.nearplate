import { sql } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	index,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.schema";

/**
 * A postal address; referenced by a restaurant, or owned by a user (their
 * address book). `userId` is null for restaurant addresses.
 */
export const addresses = pgTable(
	"addresses",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid().references(() => users.id, { onDelete: "cascade" }),
		/** Short name the owner picks, e.g. "Home", "Work". */
		label: text(),
		/** True for at most one address per user (enforced by the partial index). */
		isDefault: boolean().notNull().default(false),
		line1: text().notNull(),
		line2: text(),
		city: text().notNull(),
		state: text().notNull(),
		zipcode: text().notNull(),
		phoneNumber: text(),
		/** Map pin, set when the user picked the address on the map. */
		lat: doublePrecision(),
		lng: doublePrecision(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("addresses_user_id_idx").on(table.userId),
		uniqueIndex("addresses_user_default_uidx")
			.on(table.userId)
			.where(sql`${table.isDefault}`),
	],
);

/** Plain row shape returned by `AddressRepository` (also nested in `TRestaurant`). */
export type TAddress = {
	id: string;
	userId: string | null;
	label: string | null;
	isDefault: boolean;
	line1: string;
	line2: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber: string | null;
	lat: number | null;
	lng: number | null;
	createdAt: Date;
	updatedAt: Date;
};
