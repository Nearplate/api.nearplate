import { z } from "zod";

const _str = z.string();
const _port = z.coerce.number();
const _seconds = z.coerce.number().int().positive();
const _count = z.coerce.number().int().positive();
const _bool = z
	.union([z.boolean(), z.enum(["true", "false", "1", "0"])])
	.transform((v) => v === true || v === "true" || v === "1");

export const NodeConfigSchema = z.object({
	NODE_ENV: z.enum(["production", "development"]).default("development"),
});

export const LogConfigSchema = z.object({
	LOG_LEVEL: z
		.enum(["fatal", "error", "warn", "info", "http", "debug", "verbose"])
		.default("info"),
	LOKI_HOST: z.string().url().optional(),
});

/** This API's listen port. */
export const ServerAppConfigSchema = z.object({
	SERVER_APP_HTTP_PORT: _port.default(3000),
});

/** The single browser origin allowed by CORS. */
export const CorsConfigSchema = z.object({
	CORS_ORIGIN: _str.default("http://localhost:3400"),
});

export const MongoConfigSchema = z.object({
	MONGODB_URI: _str.default("mongodb://localhost:27017/api_nearplate"),
});

/** Cache Redis for `@DBCache` / `RedisCacheAdapter`. */
export const RedisConfigSchema = z.object({
	REDIS_HOST: _str.default("localhost"),
	REDIS_PORT: _port.default(6379),
});

/**
 * One access-token secret per role, not one secret plus a role claim. A token
 * for one role is then cryptographically incapable of passing another role's
 * check. Guests hold a long-lived anonymous token.
 */
export const JwtConfigSchema = z.object({
	JWT_ADMIN_ACCESS_SECRET: _str.min(1),
	JWT_ADMIN_ACCESS_TTL_SECONDS: _seconds.default(900), // 15 minutes
	JWT_RESTAURANT_ACCESS_SECRET: _str.min(1),
	JWT_RESTAURANT_ACCESS_TTL_SECONDS: _seconds.default(900), // 15 minutes
	JWT_USER_ACCESS_SECRET: _str.min(1),
	JWT_USER_ACCESS_TTL_SECONDS: _seconds.default(900), // 15 minutes
	JWT_GUEST_ACCESS_SECRET: _str.min(1),
	JWT_GUEST_ACCESS_TTL_SECONDS: _seconds.default(2592000), // 30 days
});

/** Sample cron: purge completed todos older than N days. */
export const CronConfigSchema = z.object({
	TODO_CLEANUP_CRON_ENABLED: _bool.default(true),
	TODO_CLEANUP_AFTER_DAYS: _count.default(30),
});

export const ConfigSchema = NodeConfigSchema.merge(LogConfigSchema)
	.merge(ServerAppConfigSchema)
	.merge(CorsConfigSchema)
	.merge(MongoConfigSchema)
	.merge(RedisConfigSchema)
	.merge(JwtConfigSchema)
	.merge(CronConfigSchema);

export type TConfig = z.infer<typeof ConfigSchema>;
