import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { Adapters } from "./adapters";
import { Controllers } from "./controllers";
import { ExceptionFilter } from "./filters";
import { Guards } from "./guards";
import { Helpers } from "./helpers";
import { ConfigModule } from "./modules/config";
import { DatabaseModule } from "./modules/database";
import { LoggerModule } from "./modules/logger";
import { Repositories } from "./repositories";
import { Services } from "./services";
import { Subscribers } from "./subscribers";
import { Transformers } from "./transformers";

@Module({
	imports: [
		ConfigModule,
		DatabaseModule,
		LoggerModule,
		ScheduleModule.forRoot(),
	],
	controllers: [...Controllers],
	providers: [
		...Helpers,
		...Transformers,
		...Services,
		...Guards,
		...Repositories,
		...Adapters,
		...Subscribers,
		{
			provide: APP_FILTER,
			useClass: ExceptionFilter,
		},
	],
})
export class AppModule {}
