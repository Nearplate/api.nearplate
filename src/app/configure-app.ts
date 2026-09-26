import type { TConfig } from "@/app/modules/config";
import {
	accessLogMiddleware,
	traceContextMiddleware,
} from "@/app/modules/logger";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
	WINSTON_MODULE_NEST_PROVIDER,
	WINSTON_MODULE_PROVIDER,
} from "nest-winston";

/** Global route prefix; `/` and `/health` stay unprefixed (Docker healthcheck). */
export const API_PREFIX = "v1";

/**
 * Everything about the HTTP layer that is not a module: logger, tracing,
 * access log, prefix and CORS. Used by both `main.ts` and the e2e harness, so
 * tests exercise exactly what production serves. Requires the app to have been
 * created with `bufferLogs: true`.
 */
export function configureApp(app: INestApplication): void {
	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
	app.flushLogs();

	app.use(traceContextMiddleware);
	app.use(accessLogMiddleware(app.get(WINSTON_MODULE_PROVIDER)));

	app.setGlobalPrefix(API_PREFIX, { exclude: ["/", "health"] });

	const configService = app.get<ConfigService<TConfig>>(ConfigService);
	// CORS is pinned to one origin. PATCH and DELETE must be listed here: leaving
	// a verb out does not fail loudly -- the preflight still answers 204 but
	// omits the method from `Access-Control-Allow-Methods`, so the browser blocks
	// the real request with a bare CORS error. Any new verb has to be added here
	// as well as to a controller.
	app.enableCors({
		origin: configService.getOrThrow<string>("CORS_ORIGIN"),
		methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Authorization", "Content-Type"],
		credentials: false,
		maxAge: 86400,
	});
}
