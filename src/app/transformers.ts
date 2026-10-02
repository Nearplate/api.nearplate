import { AdminTransformer } from "@/transformers/admin.transformer";
import { AddressTransformer } from "@/transformers/address.transformer";
import { AuthTransformer } from "@/transformers/auth.transformer";
import { CartTransformer } from "@/transformers/cart.transformer";
import { OrderTransformer } from "@/transformers/order.transformer";
import { RestaurantTransformer } from "@/transformers/restaurant.transformer";
import { UserTransformer } from "@/transformers/user.transformer";
import type { Provider } from "@nestjs/common";

export const Transformers: Provider[] = [
	AuthTransformer,
	UserTransformer,
	AddressTransformer,
	RestaurantTransformer,
	OrderTransformer,
	CartTransformer,
	AdminTransformer,
];
