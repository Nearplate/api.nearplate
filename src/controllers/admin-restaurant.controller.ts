import { LogClass } from "@/app/modules/logger";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantReviewService } from "@/services/restaurant-review.service";
import {
	AdminRestaurantTransformer,
	type TAdminRestaurantDetailResponse,
	type TAdminRestaurantListResponse,
} from "@/transformers/admin-restaurant.transformer";
import type { TAdminRestaurantResponse } from "@/transformers/restaurant.dto";
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	Post,
	Query,
} from "@nestjs/common";

/**
 * Admin review of restaurant verification. Admin accounts are created in the
 * database; every handler carries `@Roles(AuthRole.Admin)`.
 */
@LogClass()
@Controller("admin/restaurants")
export class AdminRestaurantController {
	constructor(
		@Inject(AdminRestaurantTransformer)
		private readonly _adminRestaurantTransformer: AdminRestaurantTransformer,
		@Inject(RestaurantReviewService)
		private readonly _restaurantReviewService: RestaurantReviewService,
	) {}

	/** The review queue for one verification state (default `pending_review`). */
	@Roles(AuthRole.Admin)
	@Get()
	public async list(
		@Query() query: unknown,
	): Promise<TAdminRestaurantListResponse> {
		const input = this._adminRestaurantTransformer.toListRequestDTO(query);
		const page = await this._restaurantReviewService.list(input);
		return this._adminRestaurantTransformer.toListResponseDTO(page);
	}

	/**
	 * One restaurant in any verification state, with its full KYC details and
	 * documents (short-lived download URLs) for review.
	 */
	@Roles(AuthRole.Admin)
	@Get(":id")
	public async get(
		@Param("id") id: string,
	): Promise<TAdminRestaurantDetailResponse> {
		const detail = await this._restaurantReviewService.getDetail(id);
		return this._adminRestaurantTransformer.toGetResponseDTO(detail);
	}

	/** Approves a pending restaurant. */
	@Roles(AuthRole.Admin)
	@Post(":id/approve")
	@HttpCode(HttpStatus.OK)
	public async approve(
		@Param("id") id: string,
	): Promise<TAdminRestaurantResponse> {
		const restaurant = await this._restaurantReviewService.approve(id);
		return this._adminRestaurantTransformer.toResponseDTO(restaurant);
	}

	/** Rejects a pending restaurant with a reason. */
	@Roles(AuthRole.Admin)
	@Post(":id/reject")
	@HttpCode(HttpStatus.OK)
	public async reject(
		@Param("id") id: string,
		@Body() body: unknown,
	): Promise<TAdminRestaurantResponse> {
		const { reason } =
			this._adminRestaurantTransformer.toRejectRequestDTO(body);
		const restaurant = await this._restaurantReviewService.reject(id, reason);
		return this._adminRestaurantTransformer.toResponseDTO(restaurant);
	}
}
