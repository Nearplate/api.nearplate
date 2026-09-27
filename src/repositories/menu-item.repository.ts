import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type { FoodType } from "@/domain/enums/food-type";
import type { TPage } from "@/domain/interfaces/crud.interface";
import type {
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import { isUuid } from "@/repositories/repository.utils";
import type { TGeoPoint } from "@db/schemas/geo";
import { menuItems, type TMenuItem } from "@db/schemas/menu-item.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, eq } from "drizzle-orm";

/** Persistence-level create: the location is copied from the restaurant. */
export type TCreateMenuItemRecord = {
	restaurantId: string;
	name: string;
	category: string;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
	location: TGeoPoint;
};

/**
 * Data access for `menu_items`. Menu items are only reachable through their
 * restaurant, so every owner-facing query is scoped by **both** `ownerId` and
 * `restaurantId` in the filter: an item under the wrong restaurant, or someone
 * else's, is simply not found. That is why this class does not implement the
 * id-only `ICRUDRepository` signatures.
 */
@LogClass()
@Injectable()
export class MenuItemRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Inserts an item for `ownerId` (who must own the restaurant). */
	public async create(
		ownerId: string,
		input: TCreateMenuItemRecord,
	): Promise<TMenuItem> {
		const [row] = await this._databaseService.db
			.insert(menuItems)
			.values({ ...input, ownerId })
			.returning();
		return row;
	}

	/** The restaurant's items for its owner, sorted by category then name. */
	public async list(
		ownerId: string,
		restaurantId: string,
		query: TListMenuItemsInput,
	): Promise<TPage<TMenuItem>> {
		if (!isUuid(restaurantId)) {
			return { items: [], total: 0 };
		}
		const filter = and(
			eq(menuItems.ownerId, ownerId),
			eq(menuItems.restaurantId, restaurantId),
			query.category ? eq(menuItems.category, query.category) : undefined,
			query.isAvailable !== undefined
				? eq(menuItems.isAvailable, query.isAvailable)
				: undefined,
		);
		const [rows, [totalRow]] = await Promise.all([
			this._databaseService.db
				.select()
				.from(menuItems)
				.where(filter)
				.orderBy(
					asc(menuItems.category),
					asc(menuItems.name),
					asc(menuItems.id),
				)
				.limit(query.limit)
				.offset(query.offset),
			this._databaseService.db
				.select({ total: count() })
				.from(menuItems)
				.where(filter),
		]);
		return { items: rows, total: totalRow?.total ?? 0 };
	}

	/** Null when missing, malformed ids, wrong restaurant, or not the owner's. */
	public async findInRestaurant(
		ownerId: string,
		restaurantId: string,
		id: string,
	): Promise<TMenuItem | null> {
		if (!this._validIds(restaurantId, id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.select()
			.from(menuItems)
			.where(
				and(
					eq(menuItems.id, id),
					eq(menuItems.ownerId, ownerId),
					eq(menuItems.restaurantId, restaurantId),
				),
			);
		return row ?? null;
	}

	/** Applies only the keys present; null when not found in that scope. */
	public async updateInRestaurant(
		ownerId: string,
		restaurantId: string,
		id: string,
		patch: TUpdateMenuItemInput,
	): Promise<TMenuItem | null> {
		if (!this._validIds(restaurantId, id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.update(menuItems)
			.set(patch)
			.where(
				and(
					eq(menuItems.id, id),
					eq(menuItems.ownerId, ownerId),
					eq(menuItems.restaurantId, restaurantId),
				),
			)
			.returning();
		return row ?? null;
	}

	/** True when an item was deleted from that scope. */
	public async deleteInRestaurant(
		ownerId: string,
		restaurantId: string,
		id: string,
	): Promise<boolean> {
		if (!this._validIds(restaurantId, id)) {
			return false;
		}
		const rows = await this._databaseService.db
			.delete(menuItems)
			.where(
				and(
					eq(menuItems.id, id),
					eq(menuItems.ownerId, ownerId),
					eq(menuItems.restaurantId, restaurantId),
				),
			)
			.returning({ id: menuItems.id });
		return rows.length === 1;
	}

	/** Every item of a restaurant for the public menu, by category then name. */
	public async listByRestaurant(restaurantId: string): Promise<TMenuItem[]> {
		if (!isUuid(restaurantId)) {
			return [];
		}
		return this._databaseService.db
			.select()
			.from(menuItems)
			.where(eq(menuItems.restaurantId, restaurantId))
			.orderBy(asc(menuItems.category), asc(menuItems.name), asc(menuItems.id));
	}

	/** Keeps the denormalized location in step with the restaurant's. */
	public async updateLocationByRestaurant(
		restaurantId: string,
		location: TGeoPoint,
	): Promise<void> {
		await this._databaseService.db
			.update(menuItems)
			.set({ location })
			.where(eq(menuItems.restaurantId, restaurantId));
	}

	/** Both path ids must be valid UUIDs before they reach a query. */
	private _validIds(restaurantId: string, id: string): boolean {
		return isUuid(restaurantId) && isUuid(id);
	}
}
