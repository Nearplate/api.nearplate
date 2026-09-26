import { AppService } from "@/services/app.service";
import { Controller, Get, Inject } from "@nestjs/common";
import { LogClass } from "@/app/modules/logger";

@LogClass()
@Controller()
export class AppController {
	constructor(
		@Inject(AppService)
		private readonly _appService: AppService,
	) {}

	@Get("health")
	public health() {
		return this._appService.getHealth();
	}

	@Get()
	public root() {
		return this._appService.getInfo();
	}
}
