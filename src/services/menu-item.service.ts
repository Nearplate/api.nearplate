import { LogClass } from "@/app/modules/logger";
import type { ICRUDService, TPage } from "@/domain/interfaces/crud.interface";
import type {
	TCreateMenuItemInput,
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

/**
 * Menu-item business logic. An item or restaurant that is missing or not the
 * caller's is a 404, so ownership is never revealed.
 */
@LogClass()
@Injectable()
export class MenuItemService implements ICRUDService<
	TMenuItem,
	TCreateMenuItemInput,
	TUpdateMenuItemInput,
	TListMenuItemsInput
> {
	constructor(
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
	) {}

	/**
	 * Creates an item on the caller's own restaurant (404 if it is missing or
	 * someone else's) and copies the restaurant's location onto it.
	 */
	public async create(
		ownerId: string,
		input: TCreateMenuItemInput,
	): Promise<TMenuItem> {
		const restaurant = await this._restaurantRepository.findById(
			ownerId,
			input.restaurantId,
		);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return this._menuItemRepository.create(ownerId, {
			...input,
			location: restaurant.location,
		});
	}

	/** The caller's items. */
	public list(
		ownerId: string,
		query: TListMenuItemsInput,
	): Promise<TPage<TMenuItem>> {
		return this._menuItemRepository.list(ownerId, query);
	}

	/** The caller's item or 404. */
	public async get(ownerId: string, id: string): Promise<TMenuItem> {
		const item = await this._menuItemRepository.findById(ownerId, id);
		if (!item) {
			throw new NotFoundException();
		}
		return item;
	}

	/** Updates the caller's item or 404. */
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateMenuItemInput,
	): Promise<TMenuItem> {
		const item = await this._menuItemRepository.update(ownerId, id, input);
		if (!item) {
			throw new NotFoundException();
		}
		return item;
	}

	/** Deletes the caller's item or 404. */
	public async remove(ownerId: string, id: string): Promise<void> {
		const deleted = await this._menuItemRepository.delete(ownerId, id);
		if (!deleted) {
			throw new NotFoundException();
		}
	}

	/** Marks the caller's item available or sold out. */
	public setAvailability(
		ownerId: string,
		id: string,
		isAvailable: boolean,
	): Promise<TMenuItem> {
		return this.update(ownerId, id, { isAvailable });
	}

	/** Public menu of a restaurant by slug, sorted by category then name. */
	public async getMenuBySlug(slug: string): Promise<TMenuItem[]> {
		const restaurant = await this._restaurantRepository.findBySlug(slug);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return this._menuItemRepository.listByRestaurant(restaurant.id);
	}
}
