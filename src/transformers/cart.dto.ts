import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";
import type { TPricedCart } from "@/domain/types/cart.types";
import { z } from "zod";

const _date = z.coerce.date().transform((d) => d.toISOString());

const _cartItemSchema = z.object({
	menuItemId: z.string(),
	name: z.string(),
	imageUrl: z.string().nullable(),
	priceInPaise: z.number().int(),
	quantity: z.number().int(),
	lineTotalInPaise: z.number().int(),
	isAvailable: z.boolean(),
});

/** Wire shape of a priced cart; `userId` never reaches the wire. */
const _cartSchema = z.object({
	restaurantId: z.string(),
	restaurant: z.object({
		name: z.string(),
		slug: z.string(),
		status: z.enum(RESTAURANT_STATUSES),
	}),
	items: z.array(_cartItemSchema),
	itemCount: z.number().int(),
	subtotalInPaise: z.number().int(),
	totalInPaise: z.number().int(),
	canCheckout: z.boolean(),
	updatedAt: _date,
});

export type TCartResponse = z.infer<typeof _cartSchema>;

/** Priced cart → wire DTO. */
export function toCartResponse(cart: TPricedCart): TCartResponse {
	return _cartSchema.parse(cart);
}
