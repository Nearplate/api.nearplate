import type { TClientContext } from "@/types/client-context";
import { type ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

const deviceIdSchema = z.string().uuid();

/**
 * `{ deviceId, userAgent }` of the caller. `deviceId` is a client-generated
 * UUID sent as `X-Device-Id`; a missing or malformed header is treated as
 * `null` rather than rejected, so older clients keep working.
 */
export const ClientContext = createParamDecorator(
	(_data: unknown, ctx: ExecutionContext): TClientContext => {
		const req = ctx.switchToHttp().getRequest<Request>();
		const userAgent = req.headers["user-agent"];
		const deviceIdHeader = req.headers["x-device-id"];
		const parsedDeviceId = deviceIdSchema.safeParse(deviceIdHeader);
		return {
			deviceId: parsedDeviceId.success ? parsedDeviceId.data : null,
			userAgent: typeof userAgent === "string" ? userAgent : null,
		};
	},
);
