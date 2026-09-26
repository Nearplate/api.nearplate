import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { AuthRole } from "@/domain/enums/auth-role";
import type { HydratedDocument } from "mongoose";

/** Roles a stored user can have. `guest` is token-only and never stored. */
export const USER_ROLES = [
	AuthRole.Admin,
	AuthRole.Restaurant,
	AuthRole.User,
] as const;
export type TUserRole = (typeof USER_ROLES)[number];

/**
 * One account per email, with exactly one role. `admin` is never assigned by
 * an API request -- set it directly in the database.
 */
@Schema({ collection: "users", timestamps: true })
export class User {
	/** Lowercased and trimmed before it reaches the schema. */
	@Prop({ type: String, required: true, unique: true })
	email!: string;

	@Prop({ type: String, required: true, enum: USER_ROLES })
	role!: TUserRole;

	/** Null until onboarding, or until Google supplies them. */
	@Prop({ type: String, default: null, trim: true })
	firstName!: string | null;

	@Prop({ type: String, default: null, trim: true })
	lastName!: string | null;

	/** True once a first name is known (onboarding or Google profile). */
	@Prop({ type: Boolean, default: false })
	isOnboarded!: boolean;

	@Prop({ type: String, default: null })
	avatarUrl!: string | null;

	/** Google's stable subject id. Unique when present (sparse index below). */
	@Prop({ type: String, default: undefined })
	googleSub?: string;

	/** Set once the user proved control of the email (magic link or Google). */
	@Prop({ type: Date, default: null })
	emailVerifiedAt!: Date | null;

	@Prop({ type: Date, default: null })
	lastLoginAt!: Date | null;

	createdAt!: Date;
	updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

/** Plain (lean) row shape with `_id` mapped to `id` by the repository. */
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

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ googleSub: 1 }, { unique: true, sparse: true });
