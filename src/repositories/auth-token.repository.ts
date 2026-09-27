import { LogClass } from "@/app/modules/logger";
import {
	AuthToken,
	type AuthTokenDocument,
	type TAuthToken,
	type TAuthTokenPurpose,
} from "@db/schemas/auth-token.schema";
import type { TUserRole } from "@db/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";

export type TCreateAuthTokenInput = {
	tokenHash: string;
	email: string | null;
	purpose: TAuthTokenPurpose;
	intendedRole: TUserRole | null;
	codeVerifier: string | null;
	expiresAt: Date;
};

type TLeanToken = Omit<TAuthToken, "id"> & { _id: { toString(): string } };

/** Single-use emailed tokens. Never cached: they are short-lived secrets. */
@LogClass()
@Injectable()
export class AuthTokenRepository {
	constructor(
		@InjectModel(AuthToken.name)
		private readonly _model: Model<AuthTokenDocument>,
	) {}

	/** Stores a token hash. */
	public async create(input: TCreateAuthTokenInput): Promise<void> {
		await this._model.create(input);
	}

	/**
	 * Atomically deletes and returns the token. `findOneAndDelete` makes it
	 * single-use even under concurrent requests. Expiry is checked in the
	 * query because the TTL index only sweeps about once a minute.
	 */
	public async consumeByHash(
		tokenHash: string,
		purpose: TAuthTokenPurpose,
	): Promise<TAuthToken | null> {
		const row = await this._model
			.findOneAndDelete({ tokenHash, purpose, expiresAt: { $gt: new Date() } })
			.lean<TLeanToken>();
		if (!row) {
			return null;
		}
		const { _id, ...rest } = row;
		return { id: _id.toString(), ...rest };
	}

	/** Revokes every outstanding token of `purpose` for `email`. */
	public async deleteByEmail(
		email: string,
		purpose: TAuthTokenPurpose,
	): Promise<void> {
		await this._model.deleteMany({ email, purpose });
	}
}
