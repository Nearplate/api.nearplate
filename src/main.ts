import { AppModule } from "@/app/app.module";
import { configureApp } from "@/app/configure-app";
import type { TConfig } from "@/app/modules/config";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";

async function bootstrap() {
	const app = await NestFactory.create<INestApplication>(AppModule, {
		bufferLogs: true,
	});
	configureApp(app);

	const port = app
		.get<ConfigService<TConfig>>(ConfigService)
		.getOrThrow<number>("SERVER_APP_HTTP_PORT");
	await app.listen(port);

	app
		.get(WINSTON_MODULE_NEST_PROVIDER)
		.log(`Listening on port ${port}`, "Bootstrap");
}
bootstrap();
