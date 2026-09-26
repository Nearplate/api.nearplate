import { Global, Module } from "@nestjs/common";
import {
	ConfigService,
	ConfigModule as NestConfigModule,
} from "@nestjs/config";

import { ConfigSchema } from "./config";

@Global()
@Module({
	imports: [
		NestConfigModule.forRoot({
			isGlobal: true,
			envFilePath: ["/etc/secrets/api.nearplate/.env", ".env"],
			validationSchema: ConfigSchema,
			validate: (config) => ConfigSchema.parse(config),
		}),
	],
	providers: [ConfigService],
	exports: [ConfigService],
})
export class ConfigModule {}
