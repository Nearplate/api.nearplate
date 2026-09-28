import { ORDER_STATUSES } from "@/domain/enums/order-status";
import type {
	TOrderWithItems,
	TOrderWithRestaurantName,
} from "@/repositories/order.repository";
import type { TOrder } from "@db/schemas/order.schema";
import { z } from "zod";

const _date = z.coerce.date().transform((d) => d.toISOString());

const _addressResponseSchema = z.object({
	line1: z.string(),
	line2: z.string().nullable(),
	city: z.string(),
	state: z.string(),
	zipcode: z.string(),
	phoneNumber: z.string().nullable(),
});

const _orderItemSchema = z.object({
	id: z.string(),
	menuItemId: z.string().nullable(),
	nameSnapshot: z.string(),
	priceInPaiseSnapshot: z.number(),
	quantity: z.number(),
});

const _orderFields = {
	id: z.string(),
	restaurantId: z.string(),
	status: z.enum(ORDER_STATUSES),
	totalInPaise: z.number(),
	deliveryAddress: _addressResponseSchema,
	createdAt: _date,
	updatedAt: _date,
};

/** Wire shape of an order without its items, for the owner list endpoint. */
const _orderSummarySchema = z.object(_orderFields);

/** Wire shape of an order without its items, for the customer's own list. */
const _customerOrderSummarySchema = z.object({
	..._orderFields,
	restaurantName: z.string(),
});

/** Wire shape of a single order with its items. `ownerId`/`userId` are stripped. */
const _orderSchema = z.object({
	..._orderFields,
	items: z.array(_orderItemSchema),
});

export type TOrderResponse = z.infer<typeof _orderSchema>;
export type TOrderSummaryResponse = z.infer<typeof _orderSummarySchema>;
export type TCustomerOrderSummaryResponse = z.infer<
	typeof _customerOrderSummarySchema
>;

/** Row (with items) → wire DTO. */
export function toOrderResponse(row: TOrderWithItems): TOrderResponse {
	return _orderSchema.parse(row);
}

/** Row (no items) → wire DTO, for the owner list endpoint. */
export function toOrderSummaryResponse(row: TOrder): TOrderSummaryResponse {
	return _orderSummarySchema.parse(row);
}

/** Row (no items, with restaurant name) → wire DTO, for the customer's own list. */
export function toCustomerOrderSummaryResponse(
	row: TOrderWithRestaurantName,
): TCustomerOrderSummaryResponse {
	return _customerOrderSummarySchema.parse(row);
}
