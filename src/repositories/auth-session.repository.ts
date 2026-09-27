import { LogClass } from "@/app/modules/logger";
import {
	AuthSession,
	type AuthSessionDocument,
	type TAuthSession,
} from "@db/schemas/auth-session.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";

export type TCreateAuthSessionInput = {
	userId: string;
	tokenHash: string;
	deviceId: string | null;
	userAgent: string | null;
	expiresAt: Date;
};

type TLeanSession = Omit<TAuthSession, "id"> & { _id: { toString(): string } };

/** Refresh-token sessions. Never cached: they are security-sensitive. */
@LogClass()
@Injectable()
export class AuthSessionRepository {
	constructor(
		@InjectModel(AuthSession.name)
		private readonly _model: Model<AuthSessionDocument>,
	) {}

	/** Stores a session for a refresh-token hash. */
	public async create(input: TCreateAuthSessionInput): Promise<void> {
		await this._model.create(input);
	}

	/**
	 * Atomically deletes and returns the live session for a refresh-token hash,
	 * scoped to the device it was issued to. This is what makes rotation safe:
	 * a refresh token can be spent once, and only from its own device — a
	 * mismatched or missing `deviceId` leaves the original session untouched.
	 */
	public async consumeByHash(
		tokenHash: string,
		deviceId: string | null,
	): Promise<TAuthSession | null> {
		const row = await this._model
			.findOneAndDelete({
				tokenHash,
				deviceId,
				expiresAt: { $gt: new Date() },
			})
			.lean<TLeanSession>();
		if (!row) {
			return null;
		}
		const { _id, ...rest } = row;
		return { id: _id.toString(), ...rest };
	}

	/** Revokes one session; true when it existed. */
	public async deleteByHash(tokenHash: string): Promise<boolean> {
		const result = await this._model.deleteOne({ tokenHash });
		return result.deletedCount === 1;
	}
}
