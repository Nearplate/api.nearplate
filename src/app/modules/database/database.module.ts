import { Models } from "@db/models";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import type { TConfig } from "../config/config";

@Global()
@Module({
	imports: [
		MongooseModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (configService: ConfigService<TConfig>) => ({
				uri: configService.getOrThrow<string>("MONGODB_URI"),
			}),
		}),
		MongooseModule.forFeature(Models),
	],
	exports: [MongooseModule],
})
export class DatabaseModule {}
