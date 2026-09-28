import { ORDER_STATUSES } from "@/domain/enums/order-status";
import type { TOrderWithItems } from "@/repositories/order.repository";
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

/** Wire shape of an order without its items, for list endpoints. */
const _orderSummarySchema = z.object(_orderFields);

/** Wire shape of a single order with its items. `ownerId`/`userId` are stripped. */
const _orderSchema = z.object({
	..._orderFields,
	items: z.array(_orderItemSchema),
});

export type TOrderResponse = z.infer<typeof _orderSchema>;
export type TOrderSummaryResponse = z.infer<typeof _orderSummarySchema>;

/** Row (with items) → wire DTO. */
export function toOrderResponse(row: TOrderWithItems): TOrderResponse {
	return _orderSchema.parse(row);
}

/** Row (no items) → wire DTO, for list endpoints. */
export function toOrderSummaryResponse(row: TOrder): TOrderSummaryResponse {
	return _orderSummarySchema.parse(row);
}
