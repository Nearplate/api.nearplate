import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type { TConfig } from "@/app/modules/config";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type TPackageInfo = {
	name: string;
	version: string;
	description?: string;
};

type THealthStatus = "ok" | "error";

@LogClass()
@Injectable()
export class AppService {
	private readonly _packageInfo: TPackageInfo;
	private readonly _env: string;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {
		this._packageInfo = JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf-8"),
		) as TPackageInfo;
		this._env = this._configService.getOrThrow<string>("NODE_ENV");
	}

	/** Liveness plus a Postgres ping. */
	public async getHealth(): Promise<{
		status: THealthStatus;
		database: THealthStatus;
	}> {
		let status: THealthStatus = "ok";
		const dbHealth = await this._checkDbHealth();
		status = dbHealth;
		return {
			status,
			database: dbHealth,
		};
	}

	/** Package metadata for `GET /`. */
	public getInfo(): {
		name: string;
		version: string;
		description: string;
		env: string;
	} {
		return {
			name: this._packageInfo.name,
			version: this._packageInfo.version,
			description: this._packageInfo.description ?? "",
			env: this._env ?? "development",
		};
	}

	/** Pings Postgres; any failure reports "error" rather than throwing. */
	private async _checkDbHealth(): Promise<THealthStatus> {
		try {
			await this._databaseService.ping();
			return "ok";
		} catch {
			return "error";
		}
	}
}
