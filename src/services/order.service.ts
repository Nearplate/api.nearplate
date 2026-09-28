import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import {
	ORDER_STATUS_TRANSITIONS,
	OrderStatus,
} from "@/domain/enums/order-status";
import type { TPage } from "@/domain/types/page.types";
import type {
	TCreateOrderInput,
	TListOrdersInput,
} from "@/domain/types/order.types";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import {
	OrderRepository,
	type TCreateOrderItemRecord,
	type TOrderWithItems,
} from "@/repositories/order.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import type { TOrder } from "@db/schemas/order.schema";
import {
	ConflictException,
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";

/**
 * Order business logic. Placing an order re-derives the total from the
 * current menu, never trusts a client-sent price, and rejects a cart that
 * mixes items from a different restaurant. Status transitions follow
 * `ORDER_STATUS_TRANSITIONS`; anything else is a 409.
 */
@LogClass()
@Injectable()
export class OrderService {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(OrderRepository)
		private readonly _orderRepository: OrderRepository,
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
	) {}

	/**
	 * Validates the restaurant is online and every item belongs to it and is
	 * available, computes the total server-side, and inserts the order.
	 */
	public async place(
		userId: string,
		input: TCreateOrderInput,
	): Promise<TOrderWithItems> {
		return this._databaseService.transaction(async () => {
			const restaurant = await this._restaurantRepository.findByIdPublic(
				input.restaurantId,
			);
			if (!restaurant) {
				throw new NotFoundException();
			}
			if (restaurant.status !== RestaurantStatus.Online) {
				throw new ConflictException();
			}

			const ids = input.items.map((item) => item.menuItemId);
			const menuItems = await this._menuItemRepository.findManyInRestaurant(
				restaurant.id,
				ids,
			);
			const byId = new Map(menuItems.map((item) => [item.id, item]));
			if (byId.size !== new Set(ids).size) {
				throw new BadRequestException();
			}
			if (menuItems.some((item) => !item.isAvailable)) {
				throw new ConflictException();
			}

			const items: TCreateOrderItemRecord[] = input.items.map((line) => {
				const menuItem = byId.get(line.menuItemId)!;
				return {
					menuItemId: menuItem.id,
					nameSnapshot: menuItem.name,
					priceInPaiseSnapshot: menuItem.priceInPaise,
					quantity: line.quantity,
				};
			});
			const totalInPaise = items.reduce(
				(sum, item) => sum + item.priceInPaiseSnapshot * item.quantity,
				0,
			);

			return this._orderRepository.create(restaurant.ownerId, {
				restaurantId: restaurant.id,
				userId,
				totalInPaise,
				deliveryAddress: {
					line1: input.deliveryAddress.line1,
					line2: input.deliveryAddress.line2 ?? null,
					city: input.deliveryAddress.city,
					state: input.deliveryAddress.state,
					zipcode: input.deliveryAddress.zipcode,
					phoneNumber: input.deliveryAddress.phoneNumber ?? null,
				},
				items,
			});
		});
	}

	/** The customer's own order, or 404. */
	public async getForUser(
		userId: string,
		id: string,
	): Promise<TOrderWithItems> {
		const order = await this._orderRepository.findForUser(userId, id);
		if (!order) {
			throw new NotFoundException();
		}
		return order;
	}

	/** The customer's own orders, newest first. */
	public listForUser(
		userId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		return this._orderRepository.listForUser(userId, query);
	}

	/** A restaurant's orders for its owner (caller already verified ownership). */
	public listForOwner(
		ownerId: string,
		restaurantId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		return this._orderRepository.listForOwner(ownerId, restaurantId, query);
	}

	/**
	 * Moves an order to a new status. 404 when the order is missing, not the
	 * owner's, or not under this restaurant; 409 when the transition is not
	 * allowed from the order's current status.
	 */
	public async updateStatus(
		ownerId: string,
		restaurantId: string,
		id: string,
		status: OrderStatus,
	): Promise<TOrder> {
		const current = await this._orderRepository.findForOwner(ownerId, id);
		if (!current || current.restaurantId !== restaurantId) {
			throw new NotFoundException();
		}
		if (!ORDER_STATUS_TRANSITIONS[current.status].includes(status)) {
			throw new ConflictException();
		}
		const updated = await this._orderRepository.updateStatus(
			ownerId,
			id,
			status,
		);
		if (!updated) {
			throw new NotFoundException();
		}
		return updated;
	}
}
