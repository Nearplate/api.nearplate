import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	authSessions,
	type TAuthSession,
} from "@db/schemas/auth-session.schema";
import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, isNull, lt } from "drizzle-orm";

export type TCreateAuthSessionInput = {
	userId: string;
	tokenHash: string;
	deviceId: string | null;
	userAgent: string | null;
	expiresAt: Date;
};

/** Refresh-token sessions. Never cached: they are security-sensitive. */
@LogClass()
@Injectable()
export class AuthSessionRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Stores a session for a refresh-token hash. */
	public async create(input: TCreateAuthSessionInput): Promise<void> {
		await this._databaseService.db.insert(authSessions).values(input);
	}

	/**
	 * Atomically deletes and returns the live session for a refresh-token hash,
	 * scoped to the device it was issued to. This is what makes rotation safe:
	 * a refresh token can be spent once, and only from its own device -- a
	 * mismatched or missing `deviceId` leaves the original session untouched.
	 */
	public async consumeByHash(
		tokenHash: string,
		deviceId: string | null,
	): Promise<TAuthSession | null> {
		const [row] = await this._databaseService.db
			.delete(authSessions)
			.where(
				and(
					eq(authSessions.tokenHash, tokenHash),
					deviceId === null
						? isNull(authSessions.deviceId)
						: eq(authSessions.deviceId, deviceId),
					gt(authSessions.expiresAt, new Date()),
				),
			)
			.returning();
		return row ?? null;
	}

	/** Revokes one session; true when it existed. */
	public async deleteByHash(tokenHash: string): Promise<boolean> {
		const rows = await this._databaseService.db
			.delete(authSessions)
			.where(eq(authSessions.tokenHash, tokenHash))
			.returning({ id: authSessions.id });
		return rows.length === 1;
	}

	/** Removes every session past its `expiresAt`. Run hourly by the cron job. */
	public async deleteExpired(): Promise<void> {
		await this._databaseService.db
			.delete(authSessions)
			.where(lt(authSessions.expiresAt, new Date()));
	}
}
