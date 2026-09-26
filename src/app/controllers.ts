import { AppController } from "@/controllers/app.controller";
import { AuthController } from "@/controllers/auth.controller";
import { MenuItemOwnerController } from "@/controllers/menu-item-owner.controller";
import { RestaurantController } from "@/controllers/restaurant.controller";
import { RestaurantOwnerController } from "@/controllers/restaurant-owner.controller";
import { UserController } from "@/controllers/user.controller";

export const Controllers = [
	AppController,
	AuthController,
	UserController,
	RestaurantOwnerController,
	MenuItemOwnerController,
	RestaurantController,
];
