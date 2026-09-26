import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import type { TUserRole } from "./user.schema";

/** Single-use tokens. Only the sha256 hash is stored; the token is emailed. */
export const AUTH_TOKEN_PURPOSES = { MagicLink: "magic_link" } as const;
export type TAuthTokenPurpose =
	(typeof AUTH_TOKEN_PURPOSES)[keyof typeof AUTH_TOKEN_PURPOSES];

@Schema({ collection: "auth_tokens", timestamps: true })
export class AuthToken {
	@Prop({ type: String, required: true, unique: true })
	tokenHash!: string;

	@Prop({ type: String, required: true, index: true })
	email!: string;

	@Prop({ type: String, required: true })
	purpose!: TAuthTokenPurpose;

	/** Role picked on the login screen; applied only when the user is new. */
	@Prop({ type: String, default: null })
	intendedRole!: TUserRole | null;

	/** MongoDB removes the document once this passes (TTL index below). */
	@Prop({ type: Date, required: true })
	expiresAt!: Date;

	createdAt!: Date;
	updatedAt!: Date;
}

export type AuthTokenDocument = HydratedDocument<AuthToken>;

export type TAuthToken = {
	id: string;
	tokenHash: string;
	email: string;
	purpose: TAuthTokenPurpose;
	intendedRole: TUserRole | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
