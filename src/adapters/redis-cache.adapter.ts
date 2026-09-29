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
		this._client = new Redis(this._configService.getOrThrow("REDIS_URI"), {
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

	/**
	 * Atomically increments a counter, starting its TTL on the first hit, and
	 * returns the new value (needs Redis >= 7). Used for fixed-window rate limits.
	 */
	public async incrementWithTtl(
		key: string,
		ttlSeconds: number,
	): Promise<number> {
		// One MULTI so a crash cannot leave a counter without a TTL. EXPIRE NX
		// (Redis >= 7) sets the TTL only if the key has none, i.e. on the first hit.
		const results = await this._client
			.multi()
			.incr(key)
			.expire(key, ttlSeconds, "NX")
			.exec();
		const value = results?.[0]?.[1];
		if (typeof value !== "number") {
			throw new Error("Redis INCR did not return a number");
		}
		return value;
	}

	public async delMany(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}
		await this._client.del(...keys);
	}
}
