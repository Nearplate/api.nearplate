import type { ModelDefinition } from "@nestjs/mongoose";
import { AuthSession, AuthSessionSchema } from "./schemas/auth-session.schema";
import { AuthToken, AuthTokenSchema } from "./schemas/auth-token.schema";
import { User, UserSchema } from "./schemas/user.schema";

/** Register every Mongoose model here; `DatabaseModule` wires them up. */
export const Models: ModelDefinition[] = [
	{ name: User.name, schema: UserSchema },
	{ name: AuthToken.name, schema: AuthTokenSchema },
	{ name: AuthSession.name, schema: AuthSessionSchema },
];
