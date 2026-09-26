import type { TClientContext } from "@/types/client-context";
import { type ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

/**
 * `{ ip, userAgent }` of the caller. `req.ip` is the direct peer unless the
 * app is configured with `trust proxy`; enable that in `main.ts` when deployed
 * behind a load balancer, or every session will record the proxy's address.
 */
export const ClientContext = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): TClientContext => {
		const req = ctx.switchToHttp().getRequest<Request>();
		const userAgent = req.headers["user-agent"];
		return {
			ip: req.ip ?? null,
			userAgent: typeof userAgent === "string" ? userAgent : null,
		};
	},
);
