import {
	MAX_CARTS_PER_USER,
	MAX_ITEM_QUANTITY,
	MAX_MERGE_ITEMS_PER_CART,
} from "@/domain/constants/cart.constants";
import type {
	TAddCartItemInput,
	TCheckoutCartInput,
	TMergeCartsInput,
	TPricedCart,
	TUpdateCartItemInput,
} from "@/domain/types/cart.types";
import type { TOrderWithItems } from "@/repositories/order.repository";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TCartResponse, toCartResponse } from "./cart.dto";
import { type TOrderResponse, toOrderResponse } from "./order.dto";
import { parseOrBadRequest } from "./parse";
import { deliveryAddressSchema } from "./restaurant.transformer";

const _addItemSchema = z
	.object({
		menuItemId: z.string(),
		quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
	})
	.strict();

const _updateItemSchema = z
	.object({ quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY) })
	.strict();

/** Keeps the last entry per key, so a payload with repeats cannot double-write. */
function _dedupeBy<T>(entries: T[], key: (entry: T) => string): T[] {
	return [...new Map(entries.map((entry) => [key(entry), entry])).values()];
}

const _mergeSchema = z
	.object({
		carts: z
			.array(
				z
					.object({
						restaurantId: z.string().uuid(),
						items: z
							.array(
								z
									.object({
										menuItemId: z.string().uuid(),
										quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
									})
									.strict(),
							)
							.max(MAX_MERGE_ITEMS_PER_CART)
							.transform((items) => _dedupeBy(items, (i) => i.menuItemId)),
					})
					.strict(),
			)
			.max(MAX_CARTS_PER_USER)
			.transform((carts) => _dedupeBy(carts, (c) => c.restaurantId)),
	})
	.strict();

const _checkoutSchema = z
	.object({ deliveryAddress: deliveryAddressSchema })
	.strict();

export type TCartListResponse = { items: TCartResponse[] };

/** Validates every cart request and shapes the wire responses. */
@Injectable()
export class CartTransformer {
	/** Body → add-item input. */
	public toAddItemRequestDTO(body: unknown): TAddCartItemInput {
		return parseOrBadRequest(_addItemSchema, body);
	}

	/** Body → update-item input. */
	public toUpdateItemRequestDTO(body: unknown): TUpdateCartItemInput {
		return parseOrBadRequest(_updateItemSchema, body);
	}

	/** Body → guest-cart merge input. */
	public toMergeRequestDTO(body: unknown): TMergeCartsInput {
		return parseOrBadRequest(_mergeSchema, body);
	}

	/** Body → checkout input. */
	public toCheckoutRequestDTO(body: unknown): TCheckoutCartInput {
		return parseOrBadRequest(_checkoutSchema, body);
	}

	/** Priced cart → wire DTO. */
	public toCartResponseDTO(cart: TPricedCart): TCartResponse {
		return toCartResponse(cart);
	}

	/** List of priced carts → wire DTO. */
	public toCartListResponseDTO(carts: TPricedCart[]): TCartListResponse {
		return { items: carts.map(toCartResponse) };
	}

	/** Row (with items) → order wire DTO, for the checkout response. */
	public toOrderResponseDTO(row: TOrderWithItems): TOrderResponse {
		return toOrderResponse(row);
	}
}
