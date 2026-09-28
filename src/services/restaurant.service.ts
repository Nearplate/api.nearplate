import type { TConfig } from "@/app/modules/config/config";
import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type {
	TCreateMenuItemInput,
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import type { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type { ICRUDService, TPage } from "@/domain/interfaces/crud.interface";
import type {
	TCoordinates,
	TCreateRestaurantInput,
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
	TUpdateRestaurantInput,
} from "@/domain/types/restaurant.types";
import { QrCodeHelper } from "@/helpers/qr-code.helper";
import type { OrderStatus } from "@/domain/enums/order-status";
import type { TListOrdersInput } from "@/domain/types/order.types";
import { AddressRepository } from "@/repositories/address.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import {
	RestaurantRepository,
	type TNearbyRestaurant,
} from "@/repositories/restaurant.repository";
import { OrderService } from "@/services/order.service";
import type { TQrCodeResponse } from "@/transformers/restaurant.dto";
import type { TGeoPoint } from "@db/schemas/geo";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TOrder } from "@db/schemas/order.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Restaurant and menu business logic. A restaurant or menu item that is
 * missing, not the caller's, or under a different restaurant is a 404.
 * Multi-table writes (`create`, `update`, `remove`) run inside a Postgres
 * transaction, so a failure partway through leaves nothing behind -- no
 * manual compensation is needed.
 */
@LogClass()
@Injectable()
export class RestaurantService implements ICRUDService<
	TRestaurant,
	TCreateRestaurantInput,
	TUpdateRestaurantInput,
	TListRestaurantsInput
> {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(AddressRepository)
		private readonly _addressRepository: AddressRepository,
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
		@Inject(QrCodeHelper)
		private readonly _qrCodeHelper: QrCodeHelper,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
		@Inject(OrderService)
		private readonly _orderService: OrderService,
	) {}

	/**
	 * Creates the address, then the restaurant, in one transaction. The
	 * caller's role is not changed: only `restaurant` accounts reach this.
	 */
	public async create(
		ownerId: string,
		input: TCreateRestaurantInput,
	): Promise<TRestaurant> {
		return this._databaseService.transaction(async () => {
			const address = await this._addressRepository.create(input.address);
			return this._restaurantRepository.create(ownerId, {
				name: input.name,
				cuisines: input.cuisines,
				isPureVeg: input.isPureVeg,
				location: this._toPoint(input.coordinates),
				addressId: address.id,
			});
		});
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
	 * Updates fields and/or the address, and the denormalized location on its
	 * menu items when coordinates move, all in one transaction. The slug never
	 * changes.
	 */
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateRestaurantInput,
	): Promise<TRestaurant> {
		return this._databaseService.transaction(async () => {
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
		});
	}

	/**
	 * Deletes the restaurant and its address in one transaction; menu items
	 * cascade with the restaurant at the database level.
	 */
	public async remove(ownerId: string, id: string): Promise<void> {
		await this._databaseService.transaction(async () => {
			const current = await this.get(ownerId, id);
			const deleted = await this._restaurantRepository.delete(ownerId, id);
			if (!deleted) {
				throw new NotFoundException();
			}
			await this._addressRepository.delete(current.address.id);
		});
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

	/**
	 * Creates an item on the caller's own restaurant (404 if it is missing or
	 * someone else's) and copies the restaurant's location onto it.
	 */
	public async createMenuItem(
		ownerId: string,
		restaurantId: string,
		input: TCreateMenuItemInput,
	): Promise<TMenuItem> {
		const restaurant = await this.get(ownerId, restaurantId);
		return this._menuItemRepository.create(ownerId, {
			...input,
			restaurantId: restaurant.id,
			location: restaurant.location,
		});
	}

	/** The restaurant's items for its owner; 404 if the restaurant is not theirs. */
	public async listMenuItems(
		ownerId: string,
		restaurantId: string,
		query: TListMenuItemsInput,
	): Promise<TPage<TMenuItem>> {
		await this.get(ownerId, restaurantId);
		return this._menuItemRepository.list(ownerId, restaurantId, query);
	}

	/** One item of the caller's restaurant, or 404. */
	public async getMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
	): Promise<TMenuItem> {
		const item = await this._menuItemRepository.findInRestaurant(
			ownerId,
			restaurantId,
			itemId,
		);
		if (!item) {
			throw new NotFoundException();
		}
		return item;
	}

	/** Updates one item of the caller's restaurant, or 404. */
	public async updateMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		input: TUpdateMenuItemInput,
	): Promise<TMenuItem> {
		const item = await this._menuItemRepository.updateInRestaurant(
			ownerId,
			restaurantId,
			itemId,
			input,
		);
		if (!item) {
			throw new NotFoundException();
		}
		return item;
	}

	/** Marks an item available or sold out. */
	public setMenuItemAvailability(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		isAvailable: boolean,
	): Promise<TMenuItem> {
		return this.updateMenuItem(ownerId, restaurantId, itemId, { isAvailable });
	}

	/** Deletes one item of the caller's restaurant, or 404. */
	public async removeMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
	): Promise<void> {
		const deleted = await this._menuItemRepository.deleteInRestaurant(
			ownerId,
			restaurantId,
			itemId,
		);
		if (!deleted) {
			throw new NotFoundException();
		}
	}

	/** Public menu of a restaurant by slug, sorted by category then name. */
	public async getMenuBySlug(slug: string): Promise<TMenuItem[]> {
		const restaurant = await this.getBySlug(slug);
		return this._menuItemRepository.listByRestaurant(restaurant.id);
	}

	/**
	 * A QR code pointing at the caller's public menu page. 404 if the
	 * restaurant is missing or not theirs.
	 */
	public async getQrCode(
		ownerId: string,
		id: string,
	): Promise<TQrCodeResponse> {
		const restaurant = await this.get(ownerId, id);
		const webAppBaseUrl =
			this._configService.getOrThrow<string>("WEB_APP_BASE_URL");
		const url = `${webAppBaseUrl}/r/${restaurant.slug}`;
		const [pngDataUrl, svgDataUrl] = await Promise.all([
			this._qrCodeHelper.toPngDataUrl(url),
			this._qrCodeHelper.toSvgDataUrl(url),
		]);
		return { url, pngDataUrl, svgDataUrl };
	}

	/** The restaurant's orders for its owner; 404 if the restaurant is not theirs. */
	public async listOrders(
		ownerId: string,
		restaurantId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		await this.get(ownerId, restaurantId);
		return this._orderService.listForOwner(ownerId, restaurantId, query);
	}

	/** Advances one of the caller's orders to a new status; 404/409 as documented on `OrderService.updateStatus`. */
	public async updateOrderStatus(
		ownerId: string,
		restaurantId: string,
		orderId: string,
		status: OrderStatus,
	): Promise<TOrder> {
		await this.get(ownerId, restaurantId);
		return this._orderService.updateStatus(
			ownerId,
			restaurantId,
			orderId,
			status,
		);
	}

	/** `[lng, lat]` → GeoJSON Point. */
	private _toPoint(coordinates: TCoordinates): TGeoPoint {
		return { type: "Point", coordinates };
	}
}
