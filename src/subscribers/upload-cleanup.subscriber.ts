import { LogClass } from "@/app/modules/logger";
import { RestaurantService } from "@/services/restaurant.service";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

/**
 * Every unsaved upload (abandoned pick, closed tab, never-confirmed form) is
 * a pending row past its `expiresAt` and a live S3 object -- both get cleaned
 * up here instead of accumulating forever.
 */
@LogClass()
@Injectable()
export class UploadCleanupSubscriber {
	private readonly _logger = new Logger(UploadCleanupSubscriber.name);

	constructor(
		@Inject(RestaurantService)
		private readonly _restaurantService: RestaurantService,
	) {}

	/** Deletes every expired pending upload's S3 object and row. */
	@Cron(CronExpression.EVERY_10_MINUTES)
	public async sweepExpiredUploads(): Promise<void> {
		try {
			await this._restaurantService.sweepExpiredUploads();
		} catch (error) {
			this._logger.error("Failed to sweep expired uploads", error);
		}
	}
}
