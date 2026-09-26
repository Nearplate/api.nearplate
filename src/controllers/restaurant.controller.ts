import { LogClass } from "@/app/modules/logger";
import { MenuItemService } from "@/services/menu-item.service";
import { RestaurantService } from "@/services/restaurant.service";
import type { TMenuItemResponse } from "@/transformers/menu-item.dto";
import type {
	TNearbyRestaurantResponse,
	TRestaurantResponse,
} from "@/transformers/restaurant.dto";
import { RestaurantTransformer } from "@/transformers/restaurant.transformer";
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";

/** Public, unauthenticated restaurant discovery and menus. */
@LogClass()
@Controller("restaurants")
export class RestaurantController {
	constructor(
		@Inject(RestaurantTransformer)
		private readonly _restaurantTransformer: RestaurantTransformer,
		@Inject(RestaurantService)
		private readonly _restaurantService: RestaurantService,
		@Inject(MenuItemService)
		private readonly _menuItemService: MenuItemService,
	) {}

	/**
	 * Online restaurants near a point. Declared before `:slug`, otherwise
	 * `nearby` would be read as a slug.
	 */
	@Get("nearby")
	public async nearby(
		@Query() query: unknown,
	): Promise<{ items: TNearbyRestaurantResponse[] }> {
		const input = this._restaurantTransformer.toNearbyRequestDTO(query);
		const rows = await this._restaurantService.nearby(input);
		return this._restaurantTransformer.toNearbyResponseDTO(rows);
	}

	/** A restaurant by slug (also when offline, so clients can show "closed"). */
	@Get(":slug")
	public async getBySlug(
		@Param("slug") slug: string,
	): Promise<TRestaurantResponse> {
		const restaurant = await this._restaurantService.getBySlug(
			this._restaurantTransformer.toSlugRequestDTO(slug),
		);
		return this._restaurantTransformer.toGetBySlugResponseDTO(restaurant);
	}

	/** A restaurant's menu, sorted by category then name. */
	@Get(":slug/menu")
	public async getMenu(
		@Param("slug") slug: string,
	): Promise<{ items: TMenuItemResponse[] }> {
		const items = await this._menuItemService.getMenuBySlug(
			this._restaurantTransformer.toSlugRequestDTO(slug),
		);
		return this._restaurantTransformer.toGetMenuResponseDTO(items);
	}
}
