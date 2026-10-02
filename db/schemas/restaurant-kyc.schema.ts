import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { restaurants } from "./restaurant.schema";
import { users } from "./user.schema";

/**
 * KYC and payout details for one restaurant, saved field by field during
 * onboarding (every field nullable so a partial draft can be stored). The
 * PAN and bank account number are AES-256-GCM ciphertext (`EncryptionHelper`)
 * and are never stored or logged in plaintext.
 */
export const restaurantKyc = pgTable("restaurant_kyc", {
	restaurantId: uuid()
		.primaryKey()
		.references(() => restaurants.id, { onDelete: "cascade" }),
	ownerId: uuid()
		.notNull()
		.references(() => users.id),
	panNumberEncrypted: text(),
	/** FSSAI licence number, 14 digits. */
	fssaiNumber: text(),
	accountHolderName: text(),
	accountNumberEncrypted: text(),
	ifscCode: text(),
	bankName: text(),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Plain row shape returned by `RestaurantKycRepository`. */
export type TRestaurantKyc = {
	restaurantId: string;
	ownerId: string;
	panNumberEncrypted: string | null;
	fssaiNumber: string | null;
	accountHolderName: string | null;
	accountNumberEncrypted: string | null;
	ifscCode: string | null;
	bankName: string | null;
	createdAt: Date;
	updatedAt: Date;
};
