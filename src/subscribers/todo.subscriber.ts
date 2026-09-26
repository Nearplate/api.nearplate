import type { TConfig } from "@/app/modules/config";
import { TodoService } from "@/services/todo.service";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Schedule entrypoints for todo cron jobs. The subscriber owns the schedule;
 * `TodoService` owns the work.
 */
@Injectable()
export class TodoSubscriber {
	private readonly _logger = new Logger(TodoSubscriber.name);

	constructor(
		@Inject(TodoService)
		private readonly _todoService: TodoService,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {}

	/** Daily purge of old completed todos; never throws. */
	@Cron(CronExpression.EVERY_DAY_AT_3AM, { name: "todo-cleanup" })
	public async runCleanup(): Promise<void> {
		if (!this._configService.getOrThrow<boolean>("TODO_CLEANUP_CRON_ENABLED")) {
			return;
		}
		try {
			const removed = await this._todoService.purgeCompleted();
			this._logger.log(`Todo cleanup removed ${removed} todo(s)`);
		} catch (error) {
			this._logger.error(`Scheduled todo cleanup failed: ${error}`);
		}
	}
}
