import type { TConfig } from "@/app/modules/config";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WinstonModule } from "nest-winston";
import { buildWinstonOptions, type TLogLevel } from "./logger.config";

const SERVICE_NAME = "api.nearplate";

@Global()
@Module({
	imports: [
		WinstonModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService<TConfig>) =>
				buildWinstonOptions({
					serviceName: SERVICE_NAME,
					port: configService.getOrThrow("SERVER_APP_HTTP_PORT"),
					level: configService.getOrThrow<TLogLevel>("LOG_LEVEL"),
					env: configService.getOrThrow("NODE_ENV"),
					lokiHost: configService.get("LOKI_HOST"),
				}),
		}),
	],
})
export class LoggerModule {}
