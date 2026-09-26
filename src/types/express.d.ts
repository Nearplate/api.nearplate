import type { TAuthUser } from "@/types/auth-user";

declare global {
	namespace Express {
		interface Request {
			authUser?: TAuthUser;
		}
	}
}
