import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { userRoleEnum, type TUserRole } from "./user.schema";

/**
 * Single-use tokens. Only the sha256 hash is stored; magic-link tokens are
 * emailed, oauth_state tokens are round-tripped through Google as `state`.
 */
export const AUTH_TOKEN_PURPOSES = {
	MagicLink: "magic_link",
	OauthState: "oauth_state",
} as const;
export type TAuthTokenPurpose =
	(typeof AUTH_TOKEN_PURPOSES)[keyof typeof AUTH_TOKEN_PURPOSES];

export const authTokenPurposeEnum = pgEnum("auth_token_purpose", [
	AUTH_TOKEN_PURPOSES.MagicLink,
	AUTH_TOKEN_PURPOSES.OauthState,
]);

export const authTokens = pgTable(
	"auth_tokens",
	{
		id: uuid().primaryKey().defaultRandom(),
		tokenHash: text().notNull().unique(),
		/** Null for an oauth_state row: Google state has no email yet. */
		email: text(),
		purpose: authTokenPurposeEnum().notNull(),
		/** Role picked on the login screen; applied only when the user is new. */
		intendedRole: userRoleEnum(),
		/** PKCE code verifier for an oauth_state row; null for magic-link tokens. */
		codeVerifier: text(),
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
		index("auth_tokens_email_idx").on(table.email),
		index("auth_tokens_expires_at_idx").on(table.expiresAt),
	],
);

/** Plain row shape returned by `AuthTokenRepository`. */
export type TAuthToken = {
	id: string;
	tokenHash: string;
	email: string | null;
	purpose: TAuthTokenPurpose;
	intendedRole: TUserRole | null;
	codeVerifier: string | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};
