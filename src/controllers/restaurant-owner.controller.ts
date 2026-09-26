import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import type { ICRUDController } from "@/domain/interfaces/crud.interface";
import { RestaurantService } from "@/services/restaurant.service";
import type { TRestaurantResponse } from "@/transformers/restaurant.dto";
import {
	RestaurantOwnerTransformer,
	type TRestaurantListResponse,
} from "@/transformers/restaurant-owner.transformer";
import type { TAuthUser } from "@/types/auth-user";
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	Patch,
	Post,
	Query,
} from "@nestjs/common";

/** A restaurant owner's own restaurants. `restaurant` accounts only. */
@LogClass()
@Roles(AuthRole.Restaurant)
@Controller("owner/restaurants")
export class RestaurantOwnerController implements ICRUDController<
	TRestaurantResponse,
	TRestaurantListResponse
> {
	constructor(
		@Inject(RestaurantOwnerTransformer)
		private readonly _restaurantOwnerTransformer: RestaurantOwnerTransformer,
		@Inject(RestaurantService)
		private readonly _restaurantService: RestaurantService,
	) {}

	/** Creates a restaurant and its address. */
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const input = this._restaurantOwnerTransformer.toCreateRequestDTO(body);
		const restaurant = await this._restaurantService.create(user.id, input);
		return this._restaurantOwnerTransformer.toCreateResponseDTO(restaurant);
	}

	/** Lists the caller's restaurants, newest first. */
	@Get()
	public async list(
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantListResponse> {
		const input = this._restaurantOwnerTransformer.toListRequestDTO(query);
		const page = await this._restaurantService.list(user.id, input);
		return this._restaurantOwnerTransformer.toListResponseDTO(page);
	}

	/** Fetches one restaurant. */
	@Get(":id")
	public async get(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const restaurant = await this._restaurantService.get(user.id, id);
		return this._restaurantOwnerTransformer.toGetResponseDTO(restaurant);
	}

	/** Partially updates a restaurant and/or its address. */
	@Patch(":id")
	public async update(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const input = this._restaurantOwnerTransformer.toUpdateRequestDTO(body);
		const restaurant = await this._restaurantService.update(user.id, id, input);
		return this._restaurantOwnerTransformer.toUpdateResponseDTO(restaurant);
	}

	/** Puts the restaurant online or offline. */
	@Patch(":id/status")
	public async setStatus(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const { status } =
			this._restaurantOwnerTransformer.toStatusRequestDTO(body);
		const restaurant = await this._restaurantService.setStatus(
			user.id,
			id,
			status,
		);
		return this._restaurantOwnerTransformer.toUpdateResponseDTO(restaurant);
	}

	/** Deletes a restaurant with its menu items and address. */
	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async remove(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._restaurantService.remove(user.id, id);
	}
}
