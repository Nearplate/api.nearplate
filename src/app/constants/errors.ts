/**
 * Body of a client-facing error: a stable machine-readable `code` plus a
 * human-readable `message`. `ExceptionFilter` forwards exactly this shape.
 */
export type TAppError = {
	readonly code: string;
	readonly message: string;
};

function appError(code: string, message: string): TAppError {
	return { code, message };
}

/**
 * Global catalogue of client-facing error messages. Pass the result to a Nest
 * exception so the client receives `{ statusCode, code, message }`:
 *
 *   throw new NotFoundException(Errors.orderNotFound(id));
 *
 * Add a new entry here rather than writing message strings at the throw site.
 * Messages must never include internals (SQL, stack traces, secrets, other
 * users' data); interpolate only values the caller already supplied or owns.
 */
export const ErrorMessages = {
	restaurantNotFound: (restaurantId: string): TAppError =>
		appError(
			"RESTAURANT_NOT_FOUND",
			`Restaurant ${restaurantId} was not found`,
		),

	restaurantNotOnline: (restaurantName: string): TAppError =>
		appError(
			"RESTAURANT_NOT_ONLINE",
			`Restaurant ${restaurantName} is not accepting orders right now`,
		),

	menuItemsNotInRestaurant: (restaurantName: string): TAppError =>
		appError(
			"MENU_ITEMS_NOT_IN_RESTAURANT",
			`One or more menu items do not belong to restaurant ${restaurantName}`,
		),

	menuItemsUnavailable: (menuItemIds: readonly string[]): TAppError =>
		appError(
			"MENU_ITEMS_UNAVAILABLE",
			`Menu items are currently unavailable: ${menuItemIds.join(", ")}`,
		),

	orderNotFound: (orderId: string): TAppError =>
		appError("ORDER_NOT_FOUND", `Order ${orderId} was not found`),

	orderStatusTransitionNotAllowed: (from: string, to: string): TAppError =>
		appError(
			"ORDER_STATUS_TRANSITION_NOT_ALLOWED",
			`Order cannot move from ${from} to ${to}`,
		),
} as const;
