/** A user may hold this many carts (one per restaurant) at once. */
export const MAX_CARTS_PER_USER = 5;

/** Shared by cart lines and order lines, so a cart never exceeds what an order allows. */
export const MAX_ITEM_QUANTITY = 20;
