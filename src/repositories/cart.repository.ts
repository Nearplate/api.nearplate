import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { isUuid } from "@/repositories/repository.utils";
import { cartItems, type TCartItem } from "@db/schemas/cart-item.schema";
import { carts, type TCart } from "@db/schemas/cart.schema";
import { menuItems } from "@db/schemas/menu-item.schema";
import { restaurants } from "@db/schemas/restaurant.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

/** One cart line, joined live against its menu item; no snapshot fields. */
export type TCartItemRow = {
	menuItemId: string;
	name: string;
	imageUrl: string | null;
	priceInPaise: number;
	isAvailable: boolean;
	quantity: number;
};

/** A cart plus its restaurant and lines, all read live -- no pricing here. */
export type TCartRow = TCart & {
	restaurant: {
		name: string;
		slug: string;
		status: RestaurantStatus;
		verificationStatus: RestaurantVerificationStatus;
	};
	items: TCartItemRow[];
};

/**
 * Data access for `carts`/`cart_items`, always scoped by `userId`. Prices
 * are never stored here: every read joins `menu_items` live, so
 * `CartService` prices a cart from the current menu, not a snapshot.
 */
@LogClass()
@Injectable()
export class CartRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Null when the user has no cart for that restaurant, or a malformed id. */
	public async findForUser(
		userId: string,
		restaurantId: string,
	): Promise<TCartRow | null> {
		if (!isUuid(restaurantId)) {
			return null;
		}
		const [cart] = await this._databaseService.db
			.select()
			.from(carts)
			.where(
				and(eq(carts.userId, userId), eq(carts.restaurantId, restaurantId)),
			);
		if (!cart) {
			return null;
		}
		return this._withRestaurantAndItems(cart);
	}

	/** All of the user's carts (at most `MAX_CARTS_PER_USER`), newest-touched first. */
	public async listForUser(userId: string): Promise<TCartRow[]> {
		const rows = await this._databaseService.db
			.select()
			.from(carts)
			.where(eq(carts.userId, userId))
			.orderBy(desc(carts.updatedAt), desc(carts.id));
		return Promise.all(rows.map((cart) => this._withRestaurantAndItems(cart)));
	}

	/**
	 * Creates the cart if missing, or just refreshes `updatedAt` if it already
	 * exists -- either way this call counts as "interacting" with the cart.
	 */
	public async upsertCart(
		userId: string,
		restaurantId: string,
	): Promise<TCart> {
		const [row] = await this._databaseService.db
			.insert(carts)
			.values({ userId, restaurantId })
			.onConflictDoUpdate({
				target: [carts.userId, carts.restaurantId],
				set: { updatedAt: new Date() },
			})
			.returning();
		return row;
	}

	/**
	 * Deletes every cart of `userId` beyond the `keep` most recently touched,
	 * so a user never holds more than `keep` carts at once.
	 */
	public async evictOldest(userId: string, keep: number): Promise<void> {
		const stale = await this._databaseService.db
			.select({ id: carts.id })
			.from(carts)
			.where(eq(carts.userId, userId))
			.orderBy(desc(carts.updatedAt), desc(carts.id))
			.offset(keep);
		for (const row of stale) {
			await this._databaseService.db.delete(carts).where(eq(carts.id, row.id));
		}
	}

	/** Adds `quantity` to an existing line, or inserts a new one. */
	public async addItem(
		cartId: string,
		menuItemId: string,
		quantity: number,
	): Promise<void> {
		await this._databaseService.db
			.insert(cartItems)
			.values({ cartId, menuItemId, quantity })
			.onConflictDoUpdate({
				target: [cartItems.cartId, cartItems.menuItemId],
				set: { quantity: quantity },
			});
		await this._touch(cartId);
	}

	/**
	 * Sets a line's quantity outright, inserting the line when it does not
	 * exist yet (unlike `setItemQuantity`, which never inserts).
	 */
	public async upsertItemQuantity(
		cartId: string,
		menuItemId: string,
		quantity: number,
	): Promise<void> {
		await this._databaseService.db
			.insert(cartItems)
			.values({ cartId, menuItemId, quantity })
			.onConflictDoUpdate({
				target: [cartItems.cartId, cartItems.menuItemId],
				set: { quantity },
			});
		await this._touch(cartId);
	}

	/** Sets a line's quantity outright; null when the line does not exist. */
	public async setItemQuantity(
		cartId: string,
		menuItemId: string,
		quantity: number,
	): Promise<TCartItem | null> {
		const [row] = await this._databaseService.db
			.update(cartItems)
			.set({ quantity })
			.where(
				and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)),
			)
			.returning();
		if (row) {
			await this._touch(cartId);
		}
		return row ?? null;
	}

	/** True when a line was removed. */
	public async deleteItem(
		cartId: string,
		menuItemId: string,
	): Promise<boolean> {
		const rows = await this._databaseService.db
			.delete(cartItems)
			.where(
				and(eq(cartItems.cartId, cartId), eq(cartItems.menuItemId, menuItemId)),
			)
			.returning({ id: cartItems.id });
		if (rows.length === 1) {
			await this._touch(cartId);
		}
		return rows.length === 1;
	}

	/** Deletes the cart (and its items, via cascade). */
	public async delete(cartId: string): Promise<void> {
		await this._databaseService.db.delete(carts).where(eq(carts.id, cartId));
	}

	/** Refreshes `updatedAt` so the cart counts as recently interacted with. */
	private async _touch(cartId: string): Promise<void> {
		await this._databaseService.db
			.update(carts)
			.set({ updatedAt: new Date() })
			.where(eq(carts.id, cartId));
	}

	/** Joins one cart row with its restaurant summary and live-priced items. */
	private async _withRestaurantAndItems(cart: TCart): Promise<TCartRow> {
		const [restaurant] = await this._databaseService.db
			.select({
				name: restaurants.name,
				slug: restaurants.slug,
				status: restaurants.status,
				verificationStatus: restaurants.verificationStatus,
			})
			.from(restaurants)
			.where(eq(restaurants.id, cart.restaurantId));
		const items = await this._itemsFor(cart.id);
		return { ...cart, restaurant, items };
	}

	/** A cart's lines joined live against their menu items, insertion order. */
	private async _itemsFor(cartId: string): Promise<TCartItemRow[]> {
		return this._databaseService.db
			.select({
				menuItemId: menuItems.id,
				name: menuItems.name,
				imageUrl: menuItems.imageUrl,
				priceInPaise: menuItems.priceInPaise,
				isAvailable: menuItems.isAvailable,
				quantity: cartItems.quantity,
			})
			.from(cartItems)
			.innerJoin(menuItems, eq(cartItems.menuItemId, menuItems.id))
			.where(eq(cartItems.cartId, cartId))
			.orderBy(cartItems.createdAt);
	}
}
