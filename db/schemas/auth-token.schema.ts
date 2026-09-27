import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import type { TUserRole } from "./user.schema";

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

@Schema({ collection: "auth_tokens", timestamps: true })
export class AuthToken {
	@Prop({ type: String, required: true, unique: true })
	tokenHash!: string;

	/** Null for an oauth_state row: Google state has no email yet. */
	@Prop({ type: String, default: null, index: true })
	email!: string | null;

	@Prop({ type: String, required: true })
	purpose!: TAuthTokenPurpose;

	/** Role picked on the login screen; applied only when the user is new. */
	@Prop({ type: String, default: null })
	intendedRole!: TUserRole | null;

	/** PKCE code verifier for an oauth_state row; null for magic-link tokens. */
	@Prop({ type: String, default: null })
	codeVerifier!: string | null;

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
	email: string | null;
	purpose: TAuthTokenPurpose;
	intendedRole: TUserRole | null;
	codeVerifier: string | null;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
};

export const AuthTokenSchema = SchemaFactory.createForClass(AuthToken);
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
