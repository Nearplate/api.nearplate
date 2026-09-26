import { AuthRole, type TAuthRole } from "@/domain/enums/auth-role";

/** The authenticated principal; `id` is the JWT `sub`. */
export type TAuthUser = {
	id: string;
	role: TAuthRole;
};

export type { TAuthRole };
export { AuthRole };
