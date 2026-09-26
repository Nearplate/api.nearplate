import { LogClass } from "@/app/modules/logger";
import type { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type { ICRUDService, TPage } from "@/domain/interfaces/crud.interface";
import type {
	TCoordinates,
	TCreateRestaurantInput,
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
	TUpdateRestaurantInput,
} from "@/domain/types/restaurant.types";
import { AddressRepository } from "@/repositories/address.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import {
	RestaurantRepository,
	type TNearbyRestaurant,
} from "@/repositories/restaurant.repository";
import type { TGeoPoint } from "@db/schemas/geo";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

/**
 * Restaurant business logic. A restaurant that is missing or not the caller's
 * is a 404. MongoDB transactions are not assumed (a standalone server has
 * none), so multi-collection writes are ordered and compensated instead.
 */
@LogClass()
@Injectable()
export class RestaurantService implements ICRUDService<
	TRestaurant,
	TCreateRestaurantInput,
	TUpdateRestaurantInput,
	TListRestaurantsInput
> {
	private readonly _logger = new Logger(RestaurantService.name);

	constructor(
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(AddressRepository)
		private readonly _addressRepository: AddressRepository,
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
	) {}

	/**
	 * Creates the address, then the restaurant. If the restaurant cannot be
	 * created the address is deleted again, so no orphan is left behind. The
	 * caller's role is not changed: only `restaurant` accounts reach this.
	 */
	public async create(
		ownerId: string,
		input: TCreateRestaurantInput,
	): Promise<TRestaurant> {
		const address = await this._addressRepository.create(input.address);
		try {
			return await this._restaurantRepository.create(ownerId, {
				name: input.name,
				cuisines: input.cuisines,
				isPureVeg: input.isPureVeg,
				location: this._toPoint(input.coordinates),
				addressId: address.id,
			});
		} catch (error) {
			await this._discardAddress(address.id);
			throw error;
		}
	}

	/** The caller's restaurants. */
	public list(
		ownerId: string,
		query: TListRestaurantsInput,
	): Promise<TPage<TRestaurant>> {
		return this._restaurantRepository.list(ownerId, query);
	}

	/** The caller's restaurant or 404. */
	public async get(ownerId: string, id: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findById(ownerId, id);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/**
	 * Updates fields and/or the address. Moving the restaurant also moves the
	 * denormalized location on its menu items. The slug never changes.
	 */
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateRestaurantInput,
	): Promise<TRestaurant> {
		const current = await this.get(ownerId, id);
		const { address, coordinates, ...fields } = input;

		if (address && Object.keys(address).length > 0) {
			await this._addressRepository.update(current.address.id, address);
		}
		const location = coordinates ? this._toPoint(coordinates) : undefined;
		const patch = { ...fields, ...(location ? { location } : {}) };
		if (Object.keys(patch).length > 0) {
			const updated = await this._restaurantRepository.update(
				ownerId,
				id,
				patch,
			);
			if (!updated) {
				throw new NotFoundException();
			}
		}
		if (location) {
			await this._menuItemRepository.updateLocationByRestaurant(id, location);
		}
		return this.get(ownerId, id);
	}

	/**
	 * Deletes the restaurant first (so it disappears from public reads at once),
	 * then its menu items and address. A failure after the first step leaves only
	 * unreachable orphans.
	 */
	public async remove(ownerId: string, id: string): Promise<void> {
		const current = await this.get(ownerId, id);
		const deleted = await this._restaurantRepository.delete(ownerId, id);
		if (!deleted) {
			throw new NotFoundException();
		}
		await this._menuItemRepository.deleteByRestaurant(id);
		await this._addressRepository.delete(current.address.id);
	}

	/** Puts the caller's restaurant online or offline. */
	public async setStatus(
		ownerId: string,
		id: string,
		status: RestaurantStatus,
	): Promise<TRestaurant> {
		const updated = await this._restaurantRepository.update(ownerId, id, {
			status,
		});
		if (!updated) {
			throw new NotFoundException();
		}
		return updated;
	}

	/** Public lookup by slug; an offline restaurant is still returned. */
	public async getBySlug(slug: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findBySlug(slug);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/** Public search: online restaurants near a point, nearest first. */
	public nearby(input: TNearbyRestaurantsInput): Promise<TNearbyRestaurant[]> {
		return this._restaurantRepository.nearby(input);
	}

	/** `[lng, lat]` → GeoJSON Point. */
	private _toPoint(coordinates: TCoordinates): TGeoPoint {
		return { type: "Point", coordinates };
	}

	/** Compensating delete; a failure here is logged, never hides the real error. */
	private async _discardAddress(addressId: string): Promise<void> {
		try {
			await this._addressRepository.delete(addressId);
		} catch (error) {
			this._logger.error(
				`Failed to discard orphan address ${addressId}: ${error}`,
			);
		}
	}
}
