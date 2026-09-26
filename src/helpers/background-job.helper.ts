import { LogClass } from "@/app/modules/logger";
import { Injectable, Logger } from "@nestjs/common";

export type TBackgroundJobOptions = {
	/** Stable name for logs, e.g. `embed-ad:{id}`. */
	name: string;
	/**
	 * Retries after the first failure. Total attempts = retries + 1.
	 * Defaults to 2 (3 attempts).
	 */
	retries?: number;
	/** Base delay between retries; multiplied by attempt number (linear backoff). */
	retryDelayMs?: number;
};

const _DEFAULT_RETRIES = 2;
const _DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Fire-and-forget background work with in-process retries and descriptive logs.
 *
 * Never blocks the caller and never rethrows to them. After all attempts fail,
 * logs an error (Loki / Nest) so operators see exhausted jobs.
 */
@LogClass()
@Injectable()
export class BackgroundJobHelper {
	private readonly _logger = new Logger(BackgroundJobHelper.name);

	/**
	 * Schedules `job` on the next microtask turn. Returns immediately.
	 * Failures are retried per `options`; exhaustion is logged as error.
	 */
	public run(
		job: () => Promise<unknown>,
		options: TBackgroundJobOptions,
	): void {
		void this._execute(job, options);
	}

	private async _execute(
		job: () => Promise<unknown>,
		options: TBackgroundJobOptions,
	): Promise<void> {
		const name = options.name;
		const retries = options.retries ?? _DEFAULT_RETRIES;
		const retryDelayMs = options.retryDelayMs ?? _DEFAULT_RETRY_DELAY_MS;
		const maxAttempts = retries + 1;

		this._logger.log(
			`Background job "${name}" started (maxAttempts=${maxAttempts}, retryDelayMs=${retryDelayMs})`,
		);

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await job();
				this._logger.log(
					`Background job "${name}" completed on attempt ${attempt}/${maxAttempts}`,
				);
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const stack = error instanceof Error ? error.stack : undefined;

				if (attempt < maxAttempts) {
					const delay = retryDelayMs * attempt;
					this._logger.warn(
						`Background job "${name}" failed on attempt ${attempt}/${maxAttempts}: ${message}; retrying in ${delay}ms`,
					);
					await this._sleep(delay);
					continue;
				}

				this._logger.error(
					`Background job "${name}" failed after ${maxAttempts} attempts: ${message}`,
					stack,
				);
			}
		}
	}

	private _sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
