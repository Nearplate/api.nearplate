import type { FoodType } from "@/domain/enums/food-type";

export type TCreateMenuItemInput = {
	restaurantId: string;
	name: string;
	category: string;
	/** Integer paise (1/100 rupee). */
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
};

/** A menu item never moves between restaurants, so `restaurantId` is absent. */
export type TUpdateMenuItemInput = Partial<{
	name: string;
	category: string;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
}>;

export type TListMenuItemsInput = {
	restaurantId?: string;
	category?: string;
	isAvailable?: boolean;
	limit: number;
	offset: number;
};
