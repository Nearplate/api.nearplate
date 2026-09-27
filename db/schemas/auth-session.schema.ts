import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user.schema";

/** A refresh-token session. Rotated (deleted and re-created) on every use. */
export const authSessions = pgTable(
	"auth_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text().notNull().unique(),
		/**
		 * Client-generated UUID identifying the device the session belongs to
		 * (from the `X-Device-Id` header). A refresh token only rotates when it
		 * is presented with this same device id, so a leaked refresh token
		 * alone cannot be replayed from another device.
		 */
		deviceId: text(),
		userAgent: text(),
		/**
		 * Postgres has no TTL index: expired rows are swept hourly by
		 * `AuthCleanupSubscriber` and filtered out of every read here.
		 */
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp({ withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("auth_sessions_user_id_idx").on(table.userId),
		index("auth_sessions_expires_at_idx").on(table.expiresAt),
	],
);

/** Plain row shape returned by `AuthSessionRepository`. */
export type TAuthSession = {
	id: string;
	userId: string;
	tokenHash: string;
	deviceId: string | null;
	userAgent: string | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};
