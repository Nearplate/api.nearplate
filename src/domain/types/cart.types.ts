import type { TOrderDeliveryAddressInput } from "@/domain/types/order.types";

/** `restaurantId` comes from the route; `menuItemId` must belong to it. */
export type TAddCartItemInput = {
	menuItemId: string;
	quantity: number;
};

/** Sets a line's quantity outright (unlike add, which increments). */
export type TUpdateCartItemInput = {
	quantity: number;
};

/** Turns a cart into an order; the address is not saved on the account. */
export type TCheckoutCartInput = {
	deliveryAddress: TOrderDeliveryAddressInput;
};

/** One priced cart line, joined live against its menu item. */
export type TPricedCartLine = {
	menuItemId: string;
	name: string;
	imageUrl: string | null;
	priceInPaise: number;
	quantity: number;
	lineTotalInPaise: number;
	isAvailable: boolean;
};

/** A cart's summary: its restaurant, priced lines, and totals. */
export type TPricedCart = {
	restaurantId: string;
	restaurant: { name: string; slug: string; status: string };
	items: TPricedCartLine[];
	itemCount: number;
	subtotalInPaise: number;
	/** Equal to `subtotalInPaise` today; a coupon discount would sit between them. */
	totalInPaise: number;
	canCheckout: boolean;
	updatedAt: Date;
};
