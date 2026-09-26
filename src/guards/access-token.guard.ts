import { JwtAdapter } from "@/adapters/jwt.adapter";
import type { AuthRole } from "@/domain/enums/auth-role";
import {
	type CanActivate,
	type ExecutionContext,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

export const ROLES_KEY = "roles";

/**
 * Generic bearer-token guard. Allowed roles come from `@Roles(...)`; a missing
 * or invalid token is 401, a valid token with a disallowed role is 403.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
	constructor(
		@Inject(JwtAdapter)
		private readonly _jwtAdapter: JwtAdapter,
		@Inject(Reflector)
		private readonly _reflector: Reflector,
	) {}

	/** Verifies the bearer token and attaches `req.authUser`. */
	public canActivate(context: ExecutionContext): boolean {
		const allowedRoles =
			this._reflector.getAllAndOverride<AuthRole[] | undefined>(ROLES_KEY, [
				context.getHandler(),
				context.getClass(),
			]) ?? [];
		const req = context.switchToHttp().getRequest<Request>();
		const token = this._bearer(req);
		if (!token) {
			throw new UnauthorizedException();
		}
		const payload = this._jwtAdapter.verifyAccessToken(token, allowedRoles);
		req.authUser = { id: payload.sub, role: payload.role };
		return true;
	}

	/** Extracts the token from `Authorization: Bearer <token>`. */
	private _bearer(req: Request): string | null {
		const header = req.headers.authorization;
		if (typeof header !== "string") {
			return null;
		}
		const [scheme, token] = header.split(" ");
		return scheme === "Bearer" && token ? token : null;
	}
}
