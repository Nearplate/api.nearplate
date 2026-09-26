import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { Logger } from "winston";
import { logContext } from "./logger.context";
import { stripSensitiveQuery } from "./logger.scrub";

export type TAccessLogOptions = {
	/** Path prefixes excluded from access logging (health checks, hot paths). */
	skipPathPrefixes?: string[];
};

const DEFAULT_SKIP_PREFIXES = ["/", "/health"];

function pathname(req: Request): string {
	return req.path ?? req.url?.split("?")[0] ?? "/";
}

function shouldSkipAccessLog(
	req: Request,
	skipPathPrefixes: string[],
): boolean {
	const path = pathname(req);
	for (const prefix of skipPathPrefixes) {
		if (prefix === "/") {
			if (path === "/") {
				return true;
			}
			continue;
		}
		if (path === prefix || path.startsWith(`${prefix}/`)) {
			return true;
		}
	}
	return false;
}

export function traceContextMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	const incoming = req.headers["x-request-id"];
	const traceId =
		(Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
	res.setHeader("x-request-id", traceId);
	req.traceId = traceId;

	logContext.enterWith({ traceId, kind: "http" });
	next();
}

export function accessLogMiddleware(
	logger: Logger,
	options: TAccessLogOptions = {},
) {
	const skipPathPrefixes = options.skipPathPrefixes ?? DEFAULT_SKIP_PREFIXES;

	return (req: Request, res: Response, next: NextFunction): void => {
		if (shouldSkipAccessLog(req, skipPathPrefixes)) {
			next();
			return;
		}

		const start = Date.now();

		res.on("finish", () => {
			const durationMs = Date.now() - start;
			const path = pathname(req);
			const url = stripSensitiveQuery(req.originalUrl ?? req.url ?? path);
			const statusCode = res.statusCode;
			const level =
				statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

			logger.log(
				level,
				`${req.method} ${path} statusCode=${statusCode} ${durationMs}ms`,
				{
					kind: "http",
					traceId: req.traceId,
					method: req.method,
					url,
					path,
					statusCode,
					durationMs,
					contentLength: res.getHeader("content-length"),
				},
			);
		});

		next();
	};
}
