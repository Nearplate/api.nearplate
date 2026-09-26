import {
	type ArgumentsHost,
	Catch,
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
	type LoggerService,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Request } from "express";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { stripSensitiveQuery } from "@/app/modules/logger";

/**
 * The response body stays a bare `{statusCode}` -- that contract is relied on
 * elsewhere and error messages can leak internals. But until now nothing was
 * logged server-side either, so a 500 left no trace anywhere. This logs full
 * detail to stderr (visible in the platform's log viewer) while the client
 * still sees only the status code.
 */
@Injectable()
@Catch()
export class ExceptionFilter {
	constructor(
		@Inject(HttpAdapterHost)
		private readonly _httpAdapterHost: HttpAdapterHost,
		@Inject(WINSTON_MODULE_NEST_PROVIDER)
		private readonly _loggerService: LoggerService,
	) {}

	catch(exception: unknown, host: ArgumentsHost) {
		const { httpAdapter } = this._httpAdapterHost;
		const ctx = host.switchToHttp();

		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR;

		this._log(exception, status, ctx.getRequest<Request>());

		httpAdapter.reply(ctx.getResponse(), { statusCode: status }, status);
	}

	private _log(exception: unknown, status: number, req: Request): void {
		const method = req?.method ?? "?";
		const url = stripSensitiveQuery(req?.originalUrl ?? req?.url ?? "?");
		const message =
			exception instanceof Error ? exception.message : String(exception);
		const stack = exception instanceof Error ? exception.stack : undefined;
		const payload = {
			message: `${method} ${url} -> ${status}: ${message}`,
			method,
			url,
			statusCode: status,
			traceId: req?.traceId,
		};

		if (status >= 500) {
			this._loggerService.error(payload, stack, "ExceptionFilter");
		} else {
			this._loggerService.warn(payload, "ExceptionFilter");
		}
	}
}
