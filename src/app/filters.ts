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
import type { TAppError } from "@/app/constants/errors";
import { stripSensitiveQuery } from "@/app/modules/logger";

/**
 * The response body is a bare `{statusCode}` unless the exception was built
 * from the `Errors` catalogue (`src/app/constants/errors.ts`), in which case
 * its `code` and `message` are forwarded too. Free-form exception messages
 * and non-HTTP errors are never sent, since they can leak internals. Full
 * detail is always logged to stderr (visible in the platform's log viewer).
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

		httpAdapter.reply(
			ctx.getResponse(),
			{ statusCode: status, ...this._clientError(exception) },
			status,
		);
	}

	/** The catalogue `{code, message}` carried by an HttpException, else nothing. */
	private _clientError(exception: unknown): Partial<TAppError> {
		if (!(exception instanceof HttpException)) {
			return {};
		}
		const body = exception.getResponse();
		if (
			typeof body === "object" &&
			body !== null &&
			"code" in body &&
			typeof body.code === "string" &&
			"message" in body &&
			typeof body.message === "string"
		) {
			return { code: body.code, message: body.message };
		}
		return {};
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
