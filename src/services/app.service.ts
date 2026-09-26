import { LogClass } from "@/app/modules/logger";
import type { TConfig } from "@/app/modules/config";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
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
		@InjectConnection()
		private readonly _connection: Connection,
	) {
		this._packageInfo = JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf-8"),
		) as TPackageInfo;
		this._env = this._configService.getOrThrow<string>("NODE_ENV");
	}

	/** Liveness plus a MongoDB ping. */
	public async getHealth(): Promise<{
		status: THealthStatus;
		database: THealthStatus;
	}> {
		const database = await this._checkDbHealth();

		return {
			status: "ok",
			database,
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

	/** Pings MongoDB; any failure reports "error" rather than throwing. */
	private async _checkDbHealth(): Promise<THealthStatus> {
		try {
			await this._connection.db?.admin().ping();
			return this._connection.readyState === 1 ? "ok" : "error";
		} catch {
			return "error";
		}
	}
}
