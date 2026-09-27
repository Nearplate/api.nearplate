import { z } from "zod";

const _str = z.string();
const _port = z.coerce.number();
const _seconds = z.coerce.number().int().positive();
const _count = z.coerce.number().int().positive();

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

/**
 * The web app that magic links point at. Never this API: a GET on an API route
 * would be fetched -- and therefore burned -- by email link scanners before the
 * recipient ever clicked it.
 */
export const WebAppConfigSchema = z.object({
	WEB_APP_BASE_URL: _str.default("http://localhost:3400"),
	WEB_APP_MAGIC_PATH: _str.default("/auth/magic"),
});

export const AuthConfigSchema = z.object({
	MAGIC_LINK_TTL_SECONDS: _seconds.default(900), // 15 minutes
	MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR: _count.default(5),
	/** Refresh-token lifetime. */
	SESSION_TTL_SECONDS: _seconds.default(2592000), // 30 days
	/** How long a Google OAuth `state`/PKCE verifier stays redeemable. */
	OAUTH_STATE_TTL_SECONDS: _seconds.default(600), // 10 minutes
});

/**
 * Google OAuth (Authorization Code + PKCE). All three are required at boot --
 * unlike Resend, there is no reduced-functionality mode for sign-in.
 */
export const GoogleConfigSchema = z.object({
	GOOGLE_CLIENT_ID: _str.min(1),
	GOOGLE_CLIENT_SECRET: _str.min(1),
	GOOGLE_REDIRECT_URI: _str.url(),
});

/**
 * Magic-link email delivery. In development an unset key means the link is
 * logged instead of sent; production requires the key (see `ConfigSchema`).
 */
export const ResendConfigSchema = z.object({
	RESEND_API_KEY: _str.optional(),
	RESEND_FROM_EMAIL: _str.default("Nearplate <noreply@nearplate.co.in>"),
});

export const ConfigSchema = NodeConfigSchema.merge(LogConfigSchema)
	.merge(ServerAppConfigSchema)
	.merge(CorsConfigSchema)
	.merge(WebAppConfigSchema)
	.merge(MongoConfigSchema)
	.merge(RedisConfigSchema)
	.merge(JwtConfigSchema)
	.merge(AuthConfigSchema)
	.merge(GoogleConfigSchema)
	.merge(ResendConfigSchema)
	.superRefine((config, ctx) => {
		if (config.NODE_ENV === "production" && !config.RESEND_API_KEY) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["RESEND_API_KEY"],
				message: "RESEND_API_KEY is required when NODE_ENV=production",
			});
		}
	});

export type TConfig = z.infer<typeof ConfigSchema>;
