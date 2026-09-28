import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type { OrderStatus } from "@/domain/enums/order-status";
import type { TListOrdersInput } from "@/domain/types/order.types";
import type { TPage } from "@/domain/interfaces/crud.interface";
import { isUuid } from "@/repositories/repository.utils";
import { orderItems, type TOrderItem } from "@db/schemas/order-item.schema";
import {
	orders,
	type TOrder,
	type TOrderDeliveryAddress,
} from "@db/schemas/order.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq } from "drizzle-orm";

/** Persistence-level line item: name/price already resolved from the menu item. */
export type TCreateOrderItemRecord = {
	menuItemId: string;
	nameSnapshot: string;
	priceInPaiseSnapshot: number;
	quantity: number;
};

/** Persistence-level create: total is already computed, address already a snapshot. */
export type TCreateOrderRecord = {
	restaurantId: string;
	userId: string;
	totalInPaise: number;
	deliveryAddress: TOrderDeliveryAddress;
	items: TCreateOrderItemRecord[];
};

export type TOrderWithItems = TOrder & { items: TOrderItem[] };

/**
 * Data access for `orders`/`order_items`. An order is reachable either by its
 * owner (restaurant side) or by the customer who placed it, never both at
 * once, so lookups take an explicit scope rather than a single `ownerId`
 * like `ICRUDRepository` -- this is why the class does not implement it.
 */
@LogClass()
@Injectable()
export class OrderRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Inserts the order and its items in one transaction. */
	public async create(
		ownerId: string,
		input: TCreateOrderRecord,
	): Promise<TOrderWithItems> {
		return this._databaseService.transaction(async () => {
			const [order] = await this._databaseService.db
				.insert(orders)
				.values({
					restaurantId: input.restaurantId,
					ownerId,
					userId: input.userId,
					totalInPaise: input.totalInPaise,
					deliveryAddress: input.deliveryAddress,
				})
				.returning();
			const items = await this._databaseService.db
				.insert(orderItems)
				.values(input.items.map((item) => ({ ...item, orderId: order.id })))
				.returning();
			return { ...order, items };
		});
	}

	/** Null when missing, malformed id, or not this owner's restaurant's order. */
	public async findForOwner(
		ownerId: string,
		id: string,
	): Promise<TOrderWithItems | null> {
		if (!isUuid(id)) {
			return null;
		}
		return this._findWithItems(
			and(eq(orders.id, id), eq(orders.ownerId, ownerId)),
		);
	}

	/** Null when missing, malformed id, or not this user's order. */
	public async findForUser(
		userId: string,
		id: string,
	): Promise<TOrderWithItems | null> {
		if (!isUuid(id)) {
			return null;
		}
		return this._findWithItems(
			and(eq(orders.id, id), eq(orders.userId, userId)),
		);
	}

	/** A restaurant's orders for its owner, newest first. */
	public async listForOwner(
		ownerId: string,
		restaurantId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		if (!isUuid(restaurantId)) {
			return { items: [], total: 0 };
		}
		return this._list(
			and(
				eq(orders.ownerId, ownerId),
				eq(orders.restaurantId, restaurantId),
				query.status ? eq(orders.status, query.status) : undefined,
			),
			query,
		);
	}

	/** A customer's own orders, newest first. */
	public async listForUser(
		userId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		return this._list(
			and(
				eq(orders.userId, userId),
				query.status ? eq(orders.status, query.status) : undefined,
			),
			query,
		);
	}

	/** Applies the new status; null when missing or not this owner's. */
	public async updateStatus(
		ownerId: string,
		id: string,
		status: OrderStatus,
	): Promise<TOrder | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.update(orders)
			.set({ status })
			.where(and(eq(orders.id, id), eq(orders.ownerId, ownerId)))
			.returning();
		return row ?? null;
	}

	/** Shared list query: page of orders plus the total matching the filter. */
	private async _list(
		filter: ReturnType<typeof and>,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		const [rows, [totalRow]] = await Promise.all([
			this._databaseService.db
				.select()
				.from(orders)
				.where(filter)
				.orderBy(desc(orders.createdAt), desc(orders.id))
				.limit(query.limit)
				.offset(query.offset),
			this._databaseService.db
				.select({ total: count() })
				.from(orders)
				.where(filter),
		]);
		return { items: rows, total: totalRow?.total ?? 0 };
	}

	/** One order plus its items, or null when the filter matches nothing. */
	private async _findWithItems(
		filter: ReturnType<typeof and>,
	): Promise<TOrderWithItems | null> {
		const [order] = await this._databaseService.db
			.select()
			.from(orders)
			.where(filter);
		if (!order) {
			return null;
		}
		const items = await this._databaseService.db
			.select()
			.from(orderItems)
			.where(eq(orderItems.orderId, order.id))
			.orderBy(asc(orderItems.id));
		return { ...order, items };
	}
}
