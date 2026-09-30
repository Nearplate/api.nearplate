import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { S3StorageAdapter } from "@/adapters/s3-storage.adapter";
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

/** Upper bound per dependency ping so a hung dependency cannot hang `/health`. */
const _HEALTH_PROBE_TIMEOUT_MS = 3000;

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
		@Inject(RedisCacheAdapter)
		private readonly _redisCacheAdapter: RedisCacheAdapter,
		@Inject(S3StorageAdapter)
		private readonly _s3StorageAdapter: S3StorageAdapter,
	) {
		this._packageInfo = JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf-8"),
		) as TPackageInfo;
		this._env = this._configService.getOrThrow<string>("NODE_ENV");
	}

	/** Liveness plus Postgres, Redis and S3 pings; `status` is "ok" only if all pass. */
	public async getHealth(): Promise<{
		status: THealthStatus;
		database: THealthStatus;
		redis: THealthStatus;
		storage: THealthStatus;
	}> {
		const [database, redis, storage] = await Promise.all([
			this._probe(() => this._databaseService.ping()),
			this._probe(() => this._redisCacheAdapter.ping()),
			this._probe(() => this._s3StorageAdapter.ping()),
		]);
		const status: THealthStatus = [database, redis, storage].every(
			(result) => result === "ok",
		)
			? "ok"
			: "error";
		return { status, database, redis, storage };
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

	/** Runs one dependency ping; a failure or timeout reports "error" rather than throwing. */
	private async _probe(ping: () => Promise<void>): Promise<THealthStatus> {
		let timer: NodeJS.Timeout | undefined;
		try {
			await Promise.race([
				ping(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("Health probe timed out")),
						_HEALTH_PROBE_TIMEOUT_MS,
					);
				}),
			]);
			return "ok";
		} catch {
			return "error";
		} finally {
			clearTimeout(timer);
		}
	}
}
