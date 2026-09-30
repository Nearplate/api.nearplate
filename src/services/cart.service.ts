import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	MAX_CARTS_PER_USER,
	MAX_ITEM_QUANTITY,
} from "@/domain/constants/cart.constants";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type {
	TAddCartItemInput,
	TCheckoutCartInput,
	TMergeCartsInput,
	TPricedCart,
	TPricedCartLine,
	TUpdateCartItemInput,
} from "@/domain/types/cart.types";
import { CartRepository, type TCartRow } from "@/repositories/cart.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import type { TOrderWithItems } from "@/repositories/order.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { OrderService } from "@/services/order.service";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";

/**
 * Cart business logic. A cart's lines are always priced from the current
 * menu (no snapshot), and checkout hands off to `OrderService.place`, which
 * re-validates availability and snapshots prices at that moment.
 */
@LogClass()
@Injectable()
export class CartService {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(CartRepository)
		private readonly _cartRepository: CartRepository,
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
		@Inject(OrderService)
		private readonly _orderService: OrderService,
	) {}

	/** The user's cart for one restaurant, or 404 when none exists. */
	public async get(userId: string, restaurantId: string): Promise<TPricedCart> {
		const cart = await this._cartRepository.findForUser(userId, restaurantId);
		if (!cart) {
			throw new NotFoundException();
		}
		return this._price(cart);
	}

	/** All of the user's carts, most recently touched first. */
	public async list(userId: string): Promise<TPricedCart[]> {
		const carts = await this._cartRepository.listForUser(userId);
		return carts.map((cart) => this._price(cart));
	}

	/**
	 * Adds `quantity` to a line (creating the cart if needed), after checking
	 * the restaurant is online and the item is available. Creating a 6th cart
	 * evicts the least recently touched one. 409 when the resulting quantity
	 * would exceed `MAX_ITEM_QUANTITY`.
	 */
	public async addItem(
		userId: string,
		restaurantId: string,
		input: TAddCartItemInput,
	): Promise<TPricedCart> {
		return this._databaseService.transaction(async () => {
			const restaurant =
				await this._restaurantRepository.findByIdPublic(restaurantId);
			if (!restaurant) {
				throw new NotFoundException();
			}
			if (restaurant.status !== RestaurantStatus.Online) {
				throw new ConflictException();
			}

			const [menuItem] = await this._menuItemRepository.findManyInRestaurant(
				restaurantId,
				[input.menuItemId],
			);
			if (!menuItem) {
				throw new BadRequestException();
			}
			if (!menuItem.isAvailable) {
				throw new ConflictException();
			}

			const cart = await this._cartRepository.upsertCart(userId, restaurantId);
			await this._cartRepository.evictOldest(userId, MAX_CARTS_PER_USER);

			const existing = await this._cartRepository.findForUser(
				userId,
				restaurantId,
			);
			const existingQuantity =
				existing?.items.find((line) => line.menuItemId === input.menuItemId)
					?.quantity ?? 0;
			if (existingQuantity + input.quantity > MAX_ITEM_QUANTITY) {
				throw new ConflictException();
			}

			await this._cartRepository.addItem(
				cart.id,
				input.menuItemId,
				input.quantity,
			);
			return this.get(userId, restaurantId);
		});
	}

	/**
	 * Folds guest carts into the user's server carts on login. Best effort: a
	 * missing restaurant or unknown menu item is dropped rather than failing
	 * the whole call, so a stale browser cart never blocks sign-in. The guest
	 * quantity wins for a line present on both sides; server-only lines stay.
	 * An offline restaurant or unavailable item is kept (`canCheckout` and
	 * `isAvailable` report it). Returns all of the user's carts afterwards.
	 */
	public async merge(
		userId: string,
		input: TMergeCartsInput,
	): Promise<TPricedCart[]> {
		return this._databaseService.transaction(async () => {
			for (const guestCart of input.carts) {
				await this._mergeGuestCart(userId, guestCart);
			}
			await this._cartRepository.evictOldest(userId, MAX_CARTS_PER_USER);
			return this.list(userId);
		});
	}

	/** Sets a line's quantity outright; 404 when the cart or line is missing. */
	public async updateItem(
		userId: string,
		restaurantId: string,
		menuItemId: string,
		input: TUpdateCartItemInput,
	): Promise<TPricedCart> {
		const cart = await this._cartRepository.findForUser(userId, restaurantId);
		if (!cart || !cart.items.some((line) => line.menuItemId === menuItemId)) {
			throw new NotFoundException();
		}
		await this._cartRepository.setItemQuantity(
			cart.id,
			menuItemId,
			input.quantity,
		);
		return this.get(userId, restaurantId);
	}

	/**
	 * Removes a line; 404 when the cart or line is missing. Removing the last
	 * line deletes the cart, so an empty cart never counts toward the limit.
	 */
	public async removeItem(
		userId: string,
		restaurantId: string,
		menuItemId: string,
	): Promise<TPricedCart> {
		const cart = await this._cartRepository.findForUser(userId, restaurantId);
		if (!cart) {
			throw new NotFoundException();
		}
		const removed = await this._cartRepository.deleteItem(cart.id, menuItemId);
		if (!removed) {
			throw new NotFoundException();
		}
		if (cart.items.length === 1) {
			await this._cartRepository.delete(cart.id);
			return this._price({ ...cart, items: [] });
		}
		return this.get(userId, restaurantId);
	}

	/** Deletes a cart outright; 404 when it does not exist. */
	public async clear(userId: string, restaurantId: string): Promise<void> {
		const cart = await this._cartRepository.findForUser(userId, restaurantId);
		if (!cart) {
			throw new NotFoundException();
		}
		await this._cartRepository.delete(cart.id);
	}

	/**
	 * Places an order from the cart's current lines and deletes the cart. 404
	 * when the cart is missing or empty; `OrderService.place` re-checks
	 * availability and throws 409 on its own terms, leaving the cart intact.
	 */
	public async checkout(
		userId: string,
		restaurantId: string,
		input: TCheckoutCartInput,
	): Promise<TOrderWithItems> {
		return this._databaseService.transaction(async () => {
			const cart = await this._cartRepository.findForUser(userId, restaurantId);
			if (!cart || cart.items.length === 0) {
				throw new NotFoundException();
			}
			const order = await this._orderService.place(userId, {
				restaurantId,
				items: cart.items.map((line) => ({
					menuItemId: line.menuItemId,
					quantity: line.quantity,
				})),
				deliveryAddress: input.deliveryAddress,
			});
			await this._cartRepository.delete(cart.id);
			return order;
		});
	}

	/** Merges one guest cart; skips it when nothing in it is still valid. */
	private async _mergeGuestCart(
		userId: string,
		guestCart: TMergeCartsInput["carts"][number],
	): Promise<void> {
		const restaurant = await this._restaurantRepository.findByIdPublic(
			guestCart.restaurantId,
		);
		if (!restaurant) {
			return;
		}
		const known = await this._menuItemRepository.findManyInRestaurant(
			restaurant.id,
			guestCart.items.map((line) => line.menuItemId),
		);
		const knownIds = new Set(known.map((item) => item.id));
		const lines = guestCart.items.filter((line) =>
			knownIds.has(line.menuItemId),
		);
		if (lines.length === 0) {
			return;
		}
		const cart = await this._cartRepository.upsertCart(userId, restaurant.id);
		for (const line of lines) {
			await this._cartRepository.upsertItemQuantity(
				cart.id,
				line.menuItemId,
				line.quantity,
			);
		}
	}

	/** Prices a joined cart row from its live menu-item fields. No mutation. */
	private _price(cart: TCartRow): TPricedCart {
		const items: TPricedCartLine[] = cart.items.map((item) => ({
			menuItemId: item.menuItemId,
			name: item.name,
			imageUrl: item.imageUrl,
			priceInPaise: item.priceInPaise,
			quantity: item.quantity,
			lineTotalInPaise: item.priceInPaise * item.quantity,
			isAvailable: item.isAvailable,
		}));
		const subtotalInPaise = items.reduce(
			(sum, item) => sum + item.lineTotalInPaise,
			0,
		);
		const canCheckout =
			cart.restaurant.status === RestaurantStatus.Online &&
			items.length > 0 &&
			items.every((item) => item.isAvailable);
		return {
			restaurantId: cart.restaurantId,
			restaurant: cart.restaurant,
			items,
			itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
			subtotalInPaise,
			totalInPaise: subtotalInPaise,
			canCheckout,
			updatedAt: cart.updatedAt,
		};
	}
}
