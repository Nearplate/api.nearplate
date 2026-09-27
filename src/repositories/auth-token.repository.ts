import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	authTokens,
	type TAuthToken,
	type TAuthTokenPurpose,
} from "@db/schemas/auth-token.schema";
import type { TUserRole } from "@db/schemas/user.schema";
import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, lt } from "drizzle-orm";

export type TCreateAuthTokenInput = {
	tokenHash: string;
	email: string | null;
	purpose: TAuthTokenPurpose;
	intendedRole: TUserRole | null;
	codeVerifier: string | null;
	expiresAt: Date;
};

/** Single-use emailed tokens. Never cached: they are short-lived secrets. */
@LogClass()
@Injectable()
export class AuthTokenRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Stores a token hash. */
	public async create(input: TCreateAuthTokenInput): Promise<void> {
		await this._databaseService.db.insert(authTokens).values(input);
	}

	/**
	 * Atomically deletes and returns the token. A single `delete … returning`
	 * makes it single-use even under concurrent requests. Expiry is checked in
	 * the query because there is no TTL index; expired rows only disappear
	 * once `AuthCleanupSubscriber` next runs.
	 */
	public async consumeByHash(
		tokenHash: string,
		purpose: TAuthTokenPurpose,
	): Promise<TAuthToken | null> {
		const [row] = await this._databaseService.db
			.delete(authTokens)
			.where(
				and(
					eq(authTokens.tokenHash, tokenHash),
					eq(authTokens.purpose, purpose),
					gt(authTokens.expiresAt, new Date()),
				),
			)
			.returning();
		return row ?? null;
	}

	/** Revokes every outstanding token of `purpose` for `email`. */
	public async deleteByEmail(
		email: string,
		purpose: TAuthTokenPurpose,
	): Promise<void> {
		await this._databaseService.db
			.delete(authTokens)
			.where(and(eq(authTokens.email, email), eq(authTokens.purpose, purpose)));
	}

	/** Removes every token past its `expiresAt`. Run hourly by the cron job. */
	public async deleteExpired(): Promise<void> {
		await this._databaseService.db
			.delete(authTokens)
			.where(lt(authTokens.expiresAt, new Date()));
	}
}
