import { AppController } from "@/controllers/app.controller";
import { AuthController } from "@/controllers/auth.controller";
import { OrderController } from "@/controllers/order.controller";
import { RestaurantController } from "@/controllers/restaurant.controller";
import { UserController } from "@/controllers/user.controller";

export const Controllers = [
	AppController,
	AuthController,
	UserController,
	RestaurantController,
	OrderController,
];
