import type { FoodType } from "@/domain/enums/food-type";

/** The restaurant comes from the route path, not the body. */
export type TCreateMenuItemInput = {
	name: string;
	category: string;
	description?: string | null;
	imageUrl?: string | null;
	/** Integer paise (1/100 rupee). */
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
};

/** A menu item never moves between restaurants, so `restaurantId` is absent. */
export type TUpdateMenuItemInput = Partial<{
	name: string;
	category: string;
	description: string | null;
	imageUrl: string | null;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
}>;

export type TListMenuItemsInput = {
	category?: string;
	isAvailable?: boolean;
	limit: number;
	offset: number;
};
