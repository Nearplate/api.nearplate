import type { OrderStatus } from "@/domain/enums/order-status";

export type TOrderDeliveryAddressInput = {
	line1: string;
	line2?: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber?: string | null;
};

/** One line item as the customer sends it; price and name come from the menu item. */
export type TCreateOrderItemInput = {
	menuItemId: string;
	quantity: number;
};

/** `restaurantId` and `userId` come from the route/token, not the body. */
export type TCreateOrderInput = {
	restaurantId: string;
	items: TCreateOrderItemInput[];
	deliveryAddress: TOrderDeliveryAddressInput;
};

export type TListOrdersInput = {
	status?: OrderStatus;
	limit: number;
	offset: number;
};

export type TUpdateOrderStatusInput = {
	status: OrderStatus;
};
