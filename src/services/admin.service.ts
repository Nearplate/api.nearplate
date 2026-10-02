import { ResendAdapter } from "@/adapters/resend.adapter";
import { ErrorMessages } from "@/app/constants/errors";
import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type { TPage } from "@/domain/types/page.types";
import type { TRestaurantReviewDetail } from "@/domain/types/admin.types";
import type { TListRestaurantsForReviewInput } from "@/domain/types/restaurant.types";
import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { UserRepository } from "@/repositories/user.repository";
import { RestaurantOnboardingService } from "@/services/restaurant-onboarding.service";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import {
	ConflictException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const _DASHBOARD_PATH = "/restaurant";
const _ONBOARDING_PATH = "/restaurant/onboarding";

/**
 * Admin review of restaurant verification. Only `pending_review` restaurants
 * can be approved or rejected (409 otherwise); an unknown id is a 404.
 */
@LogClass()
@Injectable()
export class AdminService {
	private readonly _logger = new Logger(AdminService.name);
	private readonly _webAppBaseUrl: string;

	constructor(
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(RestaurantOnboardingService)
		private readonly _restaurantOnboardingService: RestaurantOnboardingService,
		@Inject(UserRepository)
		private readonly _userRepository: UserRepository,
		@Inject(ResendAdapter)
		private readonly _resendAdapter: ResendAdapter,
		@Inject(BackgroundJobHelper)
		private readonly _backgroundJobHelper: BackgroundJobHelper,
		@Inject(ConfigService)
		configService: ConfigService<TConfig>,
	) {
		this._webAppBaseUrl = configService.getOrThrow("WEB_APP_BASE_URL");
	}

	/** One page of the review queue for a verification state. */
	public listRestaurants(
		query: TListRestaurantsForReviewInput,
	): Promise<TPage<TRestaurant>> {
		return this._restaurantRepository.listByVerificationStatus(query);
	}

	/** Any restaurant by id, or 404. */
	public async getRestaurant(id: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findByIdAny(id);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/**
	 * Any restaurant by id with its onboarding data for review: full KYC
	 * details and every document with a short-lived download URL. 404 if
	 * unknown.
	 */
	public async getRestaurantDetail(
		id: string,
	): Promise<TRestaurantReviewDetail> {
		const restaurant = await this.getRestaurant(id);
		const onboarding =
			await this._restaurantOnboardingService.getOnboardingForReview(
				restaurant.id,
			);
		return { restaurant, ...onboarding };
	}

	/** Approves a pending restaurant, making it visible to customers. */
	public approveRestaurant(id: string): Promise<TRestaurant> {
		return this._reviewRestaurant(
			id,
			RestaurantVerificationStatus.Approved,
			null,
		);
	}

	/** Rejects a pending restaurant with a reason the owner will see. */
	public rejectRestaurant(id: string, reason: string): Promise<TRestaurant> {
		return this._reviewRestaurant(
			id,
			RestaurantVerificationStatus.Rejected,
			reason,
		);
	}

	/** Applies a `pending_review` → `to` transition, or throws 404/409. */
	private async _reviewRestaurant(
		id: string,
		to: RestaurantVerificationStatus,
		rejectionReason: string | null,
	): Promise<TRestaurant> {
		const current = await this.getRestaurant(id);
		const updated = await this._restaurantRepository.updateVerification(
			id,
			[RestaurantVerificationStatus.PendingReview],
			{
				verificationStatus: to,
				rejectionReason,
				reviewedAt: new Date(),
			},
		);
		if (!updated) {
			throw new ConflictException(
				ErrorMessages.restaurantVerificationTransitionNotAllowed(
					current.verificationStatus,
					to,
				),
			);
		}
		this._notifyOwner(updated);
		return updated;
	}

	/**
	 * Emails the owner the decision from a background job, after the status
	 * change is saved. Lookup and send failures are logged, never thrown.
	 */
	private _notifyOwner(restaurant: TRestaurant): void {
		this._backgroundJobHelper.run(
			async () => {
				const owner = await this._userRepository.findById(restaurant.ownerId);
				if (!owner) {
					this._logger.warn(
						`Owner of restaurant ${restaurant.id} not found; review email skipped`,
					);
					return;
				}
				if (
					restaurant.verificationStatus ===
					RestaurantVerificationStatus.Approved
				) {
					await this._resendAdapter.sendRestaurantApproved(
						owner.email,
						restaurant.name,
						`${this._webAppBaseUrl}${_DASHBOARD_PATH}`,
					);
					return;
				}
				await this._resendAdapter.sendRestaurantRejected(
					owner.email,
					restaurant.name,
					restaurant.rejectionReason ?? "",
					`${this._webAppBaseUrl}${_ONBOARDING_PATH}`,
				);
			},
			{
				name: `restaurant-review:${restaurant.id}:${restaurant.verificationStatus}`,
			},
		);
	}
}
