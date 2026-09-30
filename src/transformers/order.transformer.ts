import { MAX_ITEM_QUANTITY } from "@/domain/constants/cart.constants";
import { ORDER_STATUSES } from "@/domain/enums/order-status";
import type { TPage } from "@/domain/types/page.types";
import type {
	TCreateOrderInput,
	TListOrdersInput,
	TUpdateOrderStatusInput,
} from "@/domain/types/order.types";
import type {
	TOrderWithItems,
	TOrderWithRestaurantName,
} from "@/repositories/order.repository";
import type { TOrder } from "@db/schemas/order.schema";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { deliveryAddressSchema } from "./restaurant.transformer";
import {
	type TCustomerOrderSummaryResponse,
	type TOrderResponse,
	type TOrderSummaryResponse,
	toCustomerOrderSummaryResponse,
	toOrderResponse,
	toOrderSummaryResponse,
} from "./order.dto";
import { parseOrBadRequest } from "./parse";

const _MAX_ITEMS = 50;
const _DEFAULT_LIMIT = 50;
const _MAX_LIMIT = 100;

const _limit = z.coerce
	.number()
	.int()
	.min(1)
	.max(_MAX_LIMIT)
	.default(_DEFAULT_LIMIT);
const _offset = z.coerce.number().int().min(0).default(0);

const _orderItemSchema = z
	.object({
		menuItemId: z.string(),
		quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
	})
	.strict();

const _createOrderSchema = z
	.object({
		restaurantId: z.string(),
		items: z.array(_orderItemSchema).min(1).max(_MAX_ITEMS),
		deliveryAddress: deliveryAddressSchema,
	})
	.strict();

const _listOrdersSchema = z.object({
	status: z.enum(ORDER_STATUSES).optional(),
	limit: _limit,
	offset: _offset,
});

const _updateStatusSchema = z
	.object({ status: z.enum(ORDER_STATUSES) })
	.strict();

export type TOrderListResponse = {
	items: TOrderSummaryResponse[];
	total: number;
};

export type TCustomerOrderListResponse = {
	items: TCustomerOrderSummaryResponse[];
	total: number;
};

/** Validates every order request and shapes the wire responses. */
@Injectable()
export class OrderTransformer {
	/**
	 * Body → create input. Duplicate `menuItemId` lines are merged (quantities
	 * summed) so a naive client cart never causes a spurious validation error.
	 */
	public toCreateRequestDTO(body: unknown): TCreateOrderInput {
		const data = parseOrBadRequest(_createOrderSchema, body);
		const quantityByItem = new Map<string, number>();
		for (const item of data.items) {
			quantityByItem.set(
				item.menuItemId,
				(quantityByItem.get(item.menuItemId) ?? 0) + item.quantity,
			);
		}
		return {
			restaurantId: data.restaurantId,
			items: [...quantityByItem].map(([menuItemId, quantity]) => ({
				menuItemId,
				quantity,
			})),
			deliveryAddress: data.deliveryAddress,
		};
	}

	/** Query → list input. */
	public toListRequestDTO(query: unknown): TListOrdersInput {
		const data = parseOrBadRequest(_listOrdersSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.status ? { status: data.status } : {}),
		};
	}

	/** Body → new status. */
	public toUpdateStatusRequestDTO(body: unknown): TUpdateOrderStatusInput {
		return parseOrBadRequest(_updateStatusSchema, body);
	}

	/** Row (with items) → wire DTO. */
	public toOrderResponseDTO(row: TOrderWithItems): TOrderResponse {
		return toOrderResponse(row);
	}

	/** Page of a restaurant owner's order rows (no items) → wire DTO. */
	public toOrderListResponseDTO(page: TPage<TOrder>): TOrderListResponse {
		return {
			items: page.items.map(toOrderSummaryResponse),
			total: page.total,
		};
	}

	/** Page of a customer's own order rows (no items, with restaurant name) → wire DTO. */
	public toCustomerOrderListResponseDTO(
		page: TPage<TOrderWithRestaurantName>,
	): TCustomerOrderListResponse {
		return {
			items: page.items.map(toCustomerOrderSummaryResponse),
			total: page.total,
		};
	}

	/** Row (no items) → wire DTO, for the owner status-update response. */
	public toOrderSummaryResponseDTO(row: TOrder): TOrderSummaryResponse {
		return toOrderSummaryResponse(row);
	}
}
