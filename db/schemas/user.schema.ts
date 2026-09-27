import { AuthRole } from "@/domain/enums/auth-role";
import {
	boolean,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

/** Roles a stored user can have. `guest` is token-only and never stored. */
export const USER_ROLES = [
	AuthRole.Admin,
	AuthRole.Restaurant,
	AuthRole.User,
] as const;
export type TUserRole = (typeof USER_ROLES)[number];

export const userRoleEnum = pgEnum("user_role", USER_ROLES);

/**
 * One account per email, with exactly one role. `admin` is never assigned by
 * an API request -- set it directly in the database.
 */
export const users = pgTable("users", {
	id: uuid().primaryKey().defaultRandom(),
	/** Lowercased and trimmed before it reaches this table. */
	email: text().notNull().unique(),
	role: userRoleEnum().notNull(),
	/** Null until onboarding, or until Google supplies them. */
	firstName: text(),
	lastName: text(),
	/** True once a first name is known (onboarding or Google profile). */
	isOnboarded: boolean().notNull().default(false),
	avatarUrl: text(),
	/** Google's stable subject id. Unique when present. */
	googleSub: text().unique(),
	/** Set once the user proved control of the email (magic link or Google). */
	emailVerifiedAt: timestamp({ withTimezone: true }),
	lastLoginAt: timestamp({ withTimezone: true }),
	createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp({ withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

/** Plain row shape returned by `UserRepository`. */
export type TUser = {
	id: string;
	email: string;
	role: TUserRole;
	firstName: string | null;
	lastName: string | null;
	isOnboarded: boolean;
	avatarUrl: string | null;
	googleSub: string | null;
	emailVerifiedAt: Date | null;
	lastLoginAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
