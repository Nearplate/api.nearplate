import { AddressService } from "@/services/address.service";
import { AppService } from "@/services/app.service";
import { AuthService } from "@/services/auth.service";
import { CartService } from "@/services/cart.service";
import { OrderService } from "@/services/order.service";
import { RestaurantOnboardingService } from "@/services/restaurant-onboarding.service";
import { RestaurantReviewService } from "@/services/restaurant-review.service";
import { RestaurantService } from "@/services/restaurant.service";
import { SessionService } from "@/services/session.service";
import { UserService } from "@/services/user.service";
import type { Provider } from "@nestjs/common";

export const Services: Provider[] = [
	AppService,
	AuthService,
	SessionService,
	UserService,
	AddressService,
	OrderService,
	RestaurantService,
	CartService,
	RestaurantReviewService,
	RestaurantOnboardingService,
];
