import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantService } from "@/services/restaurant.service";
import type { TMenuItemResponse } from "@/transformers/menu-item.dto";
import type { TOrderSummaryResponse } from "@/transformers/order.dto";
import {
	OrderTransformer,
	type TOrderListResponse,
} from "@/transformers/order.transformer";
import type {
	TNearbyRestaurantResponse,
	TQrCodeResponse,
	TRestaurantResponse,
} from "@/transformers/restaurant.dto";
import {
	RestaurantTransformer,
	type TMenuItemListResponse,
	type TRestaurantListResponse,
} from "@/transformers/restaurant.transformer";
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

/**
 * Restaurants and their menus: public discovery plus owner management.
 *
 * The class mixes public and owner routes, so `@Roles(AuthRole.Restaurant)` is
 * on each owner handler rather than on the class. Owner routes are scoped to
 * the caller in the repository filter (foreign or unknown ids are 404).
 *
 * Route order matters: `mine` and `nearby` are declared before `:slug`,
 * otherwise they would be read as slugs. There is no owner `get(id)` route
 * (`GET :slug` is the public lookup and `GET mine` lists the caller's
 * restaurants).
 */
@LogClass()
@Controller("restaurants")
export class RestaurantController {
	constructor(
		@Inject(RestaurantTransformer)
		private readonly _restaurantTransformer: RestaurantTransformer,
		@Inject(RestaurantService)
		private readonly _restaurantService: RestaurantService,
		@Inject(OrderTransformer)
		private readonly _orderTransformer: OrderTransformer,
	) {}

	/** Creates a restaurant and its address. */
	@Roles(AuthRole.Restaurant)
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const input = this._restaurantTransformer.toCreateRequestDTO(body);
		const restaurant = await this._restaurantService.create(user.id, input);
		return this._restaurantTransformer.toCreateResponseDTO(restaurant);
	}

	/** The caller's restaurants, newest first. */
	@Roles(AuthRole.Restaurant)
	@Get("mine")
	public async list(
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantListResponse> {
		const input = this._restaurantTransformer.toListRequestDTO(query);
		const page = await this._restaurantService.list(user.id, input);
		return this._restaurantTransformer.toListResponseDTO(page);
	}

	/** Online restaurants near a point, nearest first. Public. */
	@Get("nearby")
	public async nearby(
		@Query() query: unknown,
	): Promise<{ items: TNearbyRestaurantResponse[] }> {
		const input = this._restaurantTransformer.toNearbyRequestDTO(query);
		const rows = await this._restaurantService.nearby(input);
		return this._restaurantTransformer.toNearbyResponseDTO(rows);
	}

	/** A restaurant by slug (also when offline, so clients can show "closed"). Public. */
	@Get(":slug")
	public async getBySlug(
		@Param("slug") slug: string,
	): Promise<TRestaurantResponse> {
		const restaurant = await this._restaurantService.getBySlug(
			this._restaurantTransformer.toSlugRequestDTO(slug),
		);
		return this._restaurantTransformer.toGetBySlugResponseDTO(restaurant);
	}

	/** Partially updates the caller's restaurant and/or its address. */
	@Roles(AuthRole.Restaurant)
	@Patch(":id")
	public async update(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const input = this._restaurantTransformer.toUpdateRequestDTO(body);
		const restaurant = await this._restaurantService.update(user.id, id, input);
		return this._restaurantTransformer.toUpdateResponseDTO(restaurant);
	}

	/** Puts the caller's restaurant online or offline. */
	@Roles(AuthRole.Restaurant)
	@Patch(":id/status")
	public async setStatus(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantResponse> {
		const { status } = this._restaurantTransformer.toStatusRequestDTO(body);
		const restaurant = await this._restaurantService.setStatus(
			user.id,
			id,
			status,
		);
		return this._restaurantTransformer.toUpdateResponseDTO(restaurant);
	}

	/** Deletes the caller's restaurant with its menu items and address. */
	@Roles(AuthRole.Restaurant)
	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async remove(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._restaurantService.remove(user.id, id);
	}

	/** A restaurant's menu, sorted by category then name. Public. */
	@Get(":slug/menu")
	public async getMenu(
		@Param("slug") slug: string,
	): Promise<{ items: TMenuItemResponse[] }> {
		const items = await this._restaurantService.getMenuBySlug(
			this._restaurantTransformer.toSlugRequestDTO(slug),
		);
		return this._restaurantTransformer.toGetMenuResponseDTO(items);
	}

	/** Creates a menu item on the caller's restaurant. */
	@Roles(AuthRole.Restaurant)
	@Post(":id/menu/items")
	@HttpCode(HttpStatus.CREATED)
	public async createMenuItem(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const input = this._restaurantTransformer.toCreateMenuItemRequestDTO(body);
		const item = await this._restaurantService.createMenuItem(
			user.id,
			id,
			input,
		);
		return this._restaurantTransformer.toMenuItemResponseDTO(item);
	}

	/** Lists the caller's menu items for a restaurant, optionally filtered. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/menu/items")
	public async listMenuItems(
		@Param("id") id: string,
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemListResponse> {
		const input = this._restaurantTransformer.toListMenuItemsRequestDTO(query);
		const page = await this._restaurantService.listMenuItems(
			user.id,
			id,
			input,
		);
		return this._restaurantTransformer.toMenuItemListResponseDTO(page);
	}

	/** One menu item. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/menu/items/:itemId")
	public async getMenuItem(
		@Param("id") id: string,
		@Param("itemId") itemId: string,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const item = await this._restaurantService.getMenuItem(user.id, id, itemId);
		return this._restaurantTransformer.toMenuItemResponseDTO(item);
	}

	/** Partially updates a menu item. */
	@Roles(AuthRole.Restaurant)
	@Patch(":id/menu/items/:itemId")
	public async updateMenuItem(
		@Param("id") id: string,
		@Param("itemId") itemId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const input = this._restaurantTransformer.toUpdateMenuItemRequestDTO(body);
		const item = await this._restaurantService.updateMenuItem(
			user.id,
			id,
			itemId,
			input,
		);
		return this._restaurantTransformer.toMenuItemResponseDTO(item);
	}

	/** Marks a menu item available or sold out. */
	@Roles(AuthRole.Restaurant)
	@Patch(":id/menu/items/:itemId/availability")
	public async setMenuItemAvailability(
		@Param("id") id: string,
		@Param("itemId") itemId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const { isAvailable } =
			this._restaurantTransformer.toAvailabilityRequestDTO(body);
		const item = await this._restaurantService.setMenuItemAvailability(
			user.id,
			id,
			itemId,
			isAvailable,
		);
		return this._restaurantTransformer.toMenuItemResponseDTO(item);
	}

	/** Deletes a menu item. */
	@Roles(AuthRole.Restaurant)
	@Delete(":id/menu/items/:itemId")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async removeMenuItem(
		@Param("id") id: string,
		@Param("itemId") itemId: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._restaurantService.removeMenuItem(user.id, id, itemId);
	}

	/** A QR code for the caller's public menu page. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/qr-code")
	public async getQrCode(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TQrCodeResponse> {
		const data = await this._restaurantService.getQrCode(user.id, id);
		return this._restaurantTransformer.toQrCodeResponseDTO(data);
	}

	/** The caller's incoming orders for this restaurant, newest first. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/orders")
	public async listOrders(
		@Param("id") id: string,
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TOrderListResponse> {
		const input = this._orderTransformer.toListRequestDTO(query);
		const page = await this._restaurantService.listOrders(user.id, id, input);
		return this._orderTransformer.toOrderListResponseDTO(page);
	}

	/** Advances (or cancels) one of the caller's orders. */
	@Roles(AuthRole.Restaurant)
	@Patch(":id/orders/:orderId/status")
	public async updateOrderStatus(
		@Param("id") id: string,
		@Param("orderId") orderId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TOrderSummaryResponse> {
		const { status } = this._orderTransformer.toUpdateStatusRequestDTO(body);
		const order = await this._restaurantService.updateOrderStatus(
			user.id,
			id,
			orderId,
			status,
		);
		return this._orderTransformer.toOrderSummaryResponseDTO(order);
	}
}
