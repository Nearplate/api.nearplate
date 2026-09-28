import { MAX_ITEM_QUANTITY } from "@/domain/constants/cart.constants";
import type {
	TAddCartItemInput,
	TCheckoutCartInput,
	TPricedCart,
	TUpdateCartItemInput,
} from "@/domain/types/cart.types";
import type { TOrderWithItems } from "@/repositories/order.repository";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TCartResponse, toCartResponse } from "./cart.dto";
import { type TOrderResponse, toOrderResponse } from "./order.dto";
import { parseOrBadRequest } from "./parse";
import { addressSchema } from "./restaurant.transformer";

const _addItemSchema = z
	.object({
		menuItemId: z.string(),
		quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY),
	})
	.strict();

const _updateItemSchema = z
	.object({ quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY) })
	.strict();

const _checkoutSchema = z.object({ deliveryAddress: addressSchema }).strict();

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
