/** Dietary classification of a menu item. */
export enum FoodType {
	Veg = "veg",
	Egg = "egg",
	NonVeg = "non-veg",
}

export const FOOD_TYPES = [
	FoodType.Veg,
	FoodType.Egg,
	FoodType.NonVeg,
] as const;
