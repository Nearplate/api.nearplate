import { AppModule } from "@/app/app.module";
import type { TConfig } from "@/app/modules/config";
import {
	accessLogMiddleware,
	traceContextMiddleware,
} from "@/app/modules/logger";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
	WINSTON_MODULE_NEST_PROVIDER,
	WINSTON_MODULE_PROVIDER,
} from "nest-winston";

async function bootstrap() {
	const app = await NestFactory.create<INestApplication>(AppModule, {
		bufferLogs: true,
	});

	const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
	app.useLogger(logger);
	app.flushLogs();

	const winstonLogger = app.get(WINSTON_MODULE_PROVIDER);

	app.use(traceContextMiddleware);
	app.use(accessLogMiddleware(winstonLogger));

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

	const port = configService.getOrThrow<number>("SERVER_APP_HTTP_PORT");
	await app.listen(port);

	logger.log(`Listening on port ${port}`, "Bootstrap");
}
bootstrap();
