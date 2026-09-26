import type { ModelDefinition } from "@nestjs/mongoose";
import { Address, AddressSchema } from "./schemas/address.schema";
import { AuthSession, AuthSessionSchema } from "./schemas/auth-session.schema";
import { AuthToken, AuthTokenSchema } from "./schemas/auth-token.schema";
import { MenuItem, MenuItemSchema } from "./schemas/menu-item.schema";
import { Restaurant, RestaurantSchema } from "./schemas/restaurant.schema";
import { User, UserSchema } from "./schemas/user.schema";

/** Register every Mongoose model here; `DatabaseModule` wires them up. */
export const Models: ModelDefinition[] = [
	{ name: User.name, schema: UserSchema },
	{ name: AuthToken.name, schema: AuthTokenSchema },
	{ name: AuthSession.name, schema: AuthSessionSchema },
	{ name: Address.name, schema: AddressSchema },
	{ name: Restaurant.name, schema: RestaurantSchema },
	{ name: MenuItem.name, schema: MenuItemSchema },
];
