import { AppService } from "@/services/app.service";
import { AuthService } from "@/services/auth.service";
import { RestaurantService } from "@/services/restaurant.service";
import { SessionService } from "@/services/session.service";
import { UserService } from "@/services/user.service";
import type { Provider } from "@nestjs/common";

export const Services: Provider[] = [
	AppService,
	AuthService,
	SessionService,
	UserService,
	RestaurantService,
];
