import { AddressController } from "@/controllers/address.controller";
import { AdminRestaurantController } from "@/controllers/admin-restaurant.controller";
import { AppController } from "@/controllers/app.controller";
import { AuthController } from "@/controllers/auth.controller";
import { CartController } from "@/controllers/cart.controller";
import { OrderController } from "@/controllers/order.controller";
import { RestaurantOnboardingController } from "@/controllers/restaurant-onboarding.controller";
import { RestaurantController } from "@/controllers/restaurant.controller";
import { UserController } from "@/controllers/user.controller";

export const Controllers = [
	AppController,
	AuthController,
	UserController,
	AddressController,
	RestaurantController,
	OrderController,
	CartController,
	AdminRestaurantController,
	RestaurantOnboardingController,
];
