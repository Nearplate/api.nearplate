import { FOOD_TYPES } from "@/domain/enums/food-type";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import { z } from "zod";

const _date = z.coerce.date().transform((d) => d.toISOString());

/** Wire shape of a menu item; `ownerId` and `location` are internal. */
const _menuItemSchema = z.object({
	id: z.string(),
	restaurantId: z.string(),
	name: z.string(),
	category: z.string(),
	description: z.string().nullable(),
	imageUrl: z.string().nullable(),
	priceInPaise: z.number().int(),
	foodType: z.enum(FOOD_TYPES),
	isAvailable: z.boolean(),
	createdAt: _date,
	updatedAt: _date,
});

export type TMenuItemResponse = z.infer<typeof _menuItemSchema>;

/** Row → wire DTO. */
export function toMenuItemResponse(row: TMenuItem): TMenuItemResponse {
	return _menuItemSchema.parse(row);
}
