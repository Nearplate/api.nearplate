import { LogClass } from "@/app/modules/logger";
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { AuthTokenRepository } from "@/repositories/auth-token.repository";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Postgres has no TTL index (Mongo's `expireAfterSeconds`), so expired
 * `auth_tokens` and `auth_sessions` rows are swept hourly instead. Reads
 * already filter out expired rows, so this is only about not letting the
 * tables grow forever.
 */
@LogClass()
@Injectable()
export class AuthCleanupSubscriber {
	private readonly _logger = new Logger(AuthCleanupSubscriber.name);

	constructor(
		@Inject(AuthTokenRepository)
		private readonly _authTokenRepository: AuthTokenRepository,
		@Inject(AuthSessionRepository)
		private readonly _authSessionRepository: AuthSessionRepository,
	) {}

	/** Deletes every expired token and session. Errors are caught and logged. */
	@Cron(CronExpression.EVERY_HOUR)
	public async purgeExpired(): Promise<void> {
		try {
			await Promise.all([
				this._authTokenRepository.deleteExpired(),
				this._authSessionRepository.deleteExpired(),
			]);
		} catch (error) {
			this._logger.error("Failed to purge expired auth rows", error);
		}
	}
}
