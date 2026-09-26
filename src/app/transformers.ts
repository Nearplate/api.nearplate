import { AuthTransformer } from "@/transformers/auth.transformer";
import { MenuItemOwnerTransformer } from "@/transformers/menu-item-owner.transformer";
import { RestaurantOwnerTransformer } from "@/transformers/restaurant-owner.transformer";
import { RestaurantTransformer } from "@/transformers/restaurant.transformer";
import { UserTransformer } from "@/transformers/user.transformer";
import type { Provider } from "@nestjs/common";

export const Transformers: Provider[] = [
	AuthTransformer,
	UserTransformer,
	RestaurantOwnerTransformer,
	MenuItemOwnerTransformer,
	RestaurantTransformer,
];
