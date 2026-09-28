/** Lifecycle of an order, owner-driven except the customer's own `cancelled`. */
export enum OrderStatus {
	Placed = "placed",
	Accepted = "accepted",
	Preparing = "preparing",
	OutForDelivery = "out_for_delivery",
	Delivered = "delivered",
	Cancelled = "cancelled",
}

export const ORDER_STATUSES = [
	OrderStatus.Placed,
	OrderStatus.Accepted,
	OrderStatus.Preparing,
	OrderStatus.OutForDelivery,
	OrderStatus.Delivered,
	OrderStatus.Cancelled,
] as const;

/**
 * Valid next statuses per current status. `OrderService.updateStatus` uses
 * this to turn an out-of-order transition into a 409, not a silent write.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.Placed]: [OrderStatus.Accepted, OrderStatus.Cancelled],
	[OrderStatus.Accepted]: [OrderStatus.Preparing, OrderStatus.Cancelled],
	[OrderStatus.Preparing]: [OrderStatus.OutForDelivery, OrderStatus.Cancelled],
	[OrderStatus.OutForDelivery]: [OrderStatus.Delivered],
	[OrderStatus.Delivered]: [],
	[OrderStatus.Cancelled]: [],
};
