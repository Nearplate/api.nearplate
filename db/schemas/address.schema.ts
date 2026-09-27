import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** A postal address; referenced by a restaurant. */
export const addresses = pgTable("addresses", {
	id: uuid().primaryKey().defaultRandom(),
	line1: text().notNull(),
	line2: text(),
	city: text().notNull(),
	state: text().notNull(),
	zipcode: text().notNull(),
	phoneNumber: text(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

/** Plain row shape returned by `AddressRepository` (also nested in `TRestaurant`). */
export type TAddress = {
	id: string;
	line1: string;
	line2: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber: string | null;
	createdAt: Date;
	updatedAt: Date;
};
