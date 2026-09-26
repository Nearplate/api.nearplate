import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import {
	Inject,
	Injectable,
	Logger,
	type OnApplicationBootstrap,
	type OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/** Thin ioredis KV wrapper for `@DBCache`. */
@LogClass()
@Injectable()
export class RedisCacheAdapter
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private static _instance: RedisCacheAdapter | null = null;

	private readonly _logger = new Logger(RedisCacheAdapter.name);
	private readonly _client: Redis;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._client = new Redis({
			host: this._configService.getOrThrow("REDIS_HOST"),
			port: this._configService.getOrThrow("REDIS_PORT"),
			lazyConnect: true,
		});
		RedisCacheAdapter._instance = this;
	}

	public static get instance(): RedisCacheAdapter {
		if (!RedisCacheAdapter._instance) {
			throw new Error("RedisCacheAdapter is not initialized");
		}
		return RedisCacheAdapter._instance;
	}

	public async onApplicationBootstrap(): Promise<void> {
		await this._client.connect();
		this._logger.log("Redis cache client connected");
	}

	public async onApplicationShutdown(): Promise<void> {
		await this._client.quit();
		RedisCacheAdapter._instance = null;
	}

	public async get(key: string): Promise<string | null> {
		return this._client.get(key);
	}

	public async set(
		key: string,
		value: string,
		ttlSeconds: number,
	): Promise<void> {
		await this._client.set(key, value, "EX", ttlSeconds);
	}

	public async del(key: string): Promise<void> {
		await this._client.del(key);
	}

	public async delMany(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}
		await this._client.del(...keys);
	}
}
