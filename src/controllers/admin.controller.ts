import { LogClass } from "@/app/modules/logger";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { AdminService } from "@/services/admin.service";
import {
	AdminTransformer,
	type TAdminRestaurantDetailResponse,
	type TAdminRestaurantListResponse,
} from "@/transformers/admin.transformer";
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
 * Every admin-only route, under the `admin` prefix (currently restaurant
 * verification review at `admin/restaurants`). Admin accounts are created in
 * the database; every handler carries `@Roles(AuthRole.Admin)`.
 */
@LogClass()
@Controller("admin")
export class AdminController {
	constructor(
		@Inject(AdminTransformer)
		private readonly _adminTransformer: AdminTransformer,
		@Inject(AdminService)
		private readonly _adminService: AdminService,
	) {}

	/** The review queue for one verification state (default `pending_review`). */
	@Roles(AuthRole.Admin)
	@Get("restaurants")
	public async listRestaurants(
		@Query() query: unknown,
	): Promise<TAdminRestaurantListResponse> {
		const input = this._adminTransformer.toListRestaurantsRequestDTO(query);
		const page = await this._adminService.listRestaurants(input);
		return this._adminTransformer.toListRestaurantsResponseDTO(page);
	}

	/**
	 * One restaurant in any verification state, with its full KYC details and
	 * documents (short-lived download URLs) for review.
	 */
	@Roles(AuthRole.Admin)
	@Get("restaurants/:id")
	public async getRestaurant(
		@Param("id") id: string,
	): Promise<TAdminRestaurantDetailResponse> {
		const detail = await this._adminService.getRestaurantDetail(id);
		return this._adminTransformer.toGetRestaurantResponseDTO(detail);
	}

	/** Approves a pending restaurant. */
	@Roles(AuthRole.Admin)
	@Post("restaurants/:id/approve")
	@HttpCode(HttpStatus.OK)
	public async approveRestaurant(
		@Param("id") id: string,
	): Promise<TAdminRestaurantResponse> {
		const restaurant = await this._adminService.approveRestaurant(id);
		return this._adminTransformer.toRestaurantResponseDTO(restaurant);
	}

	/** Rejects a pending restaurant with a reason. */
	@Roles(AuthRole.Admin)
	@Post("restaurants/:id/reject")
	@HttpCode(HttpStatus.OK)
	public async rejectRestaurant(
		@Param("id") id: string,
		@Body() body: unknown,
	): Promise<TAdminRestaurantResponse> {
		const { reason } =
			this._adminTransformer.toRejectRestaurantRequestDTO(body);
		const restaurant = await this._adminService.rejectRestaurant(id, reason);
		return this._adminTransformer.toRestaurantResponseDTO(restaurant);
	}
}
