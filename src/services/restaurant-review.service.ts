import { ErrorMessages } from "@/app/constants/errors";
import { LogClass } from "@/app/modules/logger";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type { TPage } from "@/domain/types/page.types";
import type { TListRestaurantsForReviewInput } from "@/domain/types/restaurant.types";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import {
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";

/**
 * Admin review of restaurant verification. Only `pending_review` restaurants
 * can be approved or rejected (409 otherwise); an unknown id is a 404.
 */
@LogClass()
@Injectable()
export class RestaurantReviewService {
	constructor(
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
	) {}

	/** One page of the review queue for a verification state. */
	public list(
		query: TListRestaurantsForReviewInput,
	): Promise<TPage<TRestaurant>> {
		return this._restaurantRepository.listByVerificationStatus(query);
	}

	/** Any restaurant by id, or 404. */
	public async get(id: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findByIdAny(id);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/** Approves a pending restaurant, making it visible to customers. */
	public approve(id: string): Promise<TRestaurant> {
		return this._review(id, RestaurantVerificationStatus.Approved, null);
	}

	/** Rejects a pending restaurant with a reason the owner will see. */
	public reject(id: string, reason: string): Promise<TRestaurant> {
		return this._review(id, RestaurantVerificationStatus.Rejected, reason);
	}

	/** Applies a `pending_review` → `to` transition, or throws 404/409. */
	private async _review(
		id: string,
		to: RestaurantVerificationStatus,
		rejectionReason: string | null,
	): Promise<TRestaurant> {
		const current = await this.get(id);
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
		return updated;
	}
}
