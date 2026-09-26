import type { TAuthUser } from "@/types/auth-user";
import {
	type ExecutionContext,
	UnauthorizedException,
	createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";

export type { TAuthUser };

export const AuthUser = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): TAuthUser => {
		const req = ctx.switchToHttp().getRequest<Request>();
		if (!req.authUser) {
			throw new UnauthorizedException();
		}
		return req.authUser;
	},
);
