import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/** A refresh-token session. Rotated (deleted and re-created) on every use. */
@Schema({ collection: "auth_sessions", timestamps: true })
export class AuthSession {
	@Prop({ type: String, required: true, index: true })
	userId!: string;

	@Prop({ type: String, required: true, unique: true })
	tokenHash!: string;

	/**
	 * Client-generated UUID identifying the device the session belongs to
	 * (from the `X-Device-Id` header). A refresh token only rotates when it is
	 * presented with this same device id, so a leaked refresh token alone
	 * cannot be replayed from another device.
	 */
	@Prop({ type: String, default: null })
	deviceId!: string | null;

	@Prop({ type: String, default: null })
	userAgent!: string | null;

	/** MongoDB removes the document once this passes (TTL index below). */
	@Prop({ type: Date, required: true })
	expiresAt!: Date;

	createdAt!: Date;
	updatedAt!: Date;
}

export type AuthSessionDocument = HydratedDocument<AuthSession>;

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

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
