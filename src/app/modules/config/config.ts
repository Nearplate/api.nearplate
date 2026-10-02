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

export const PostgresConfigSchema = z.object({
	DATABASE_URL: _str.default(
		"postgres://postgres:postgres@localhost:5432/api_nearplate",
	),
});

/** Cache Redis for `@DBCache` / `RedisCacheAdapter`. */
export const RedisConfigSchema = z.object({
	REDIS_URI: _str.url().default("redis://localhost:6379"),
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

/**
 * Public S3 (or S3-compatible: MinIO, R2) bucket for restaurant logo/banner
 * uploads. `S3_PUBLIC_BASE_URL` is the origin `S3StorageAdapter` builds public
 * URLs from and matches URLs against -- a bucket origin or a CDN in front of
 * it. Credentials are optional: unset falls back to the AWS default
 * credential chain (instance role, etc).
 */
export const S3ConfigSchema = z.object({
	S3_BUCKET: _str.min(1),
	S3_REGION: _str.min(1),
	S3_PUBLIC_BASE_URL: _str.url(),
	S3_ENDPOINT: _str.url().optional(),
	S3_FORCE_PATH_STYLE: z
		.enum(["true", "false"])
		.transform((v) => v === "true")
		.default("false"),
	S3_ACCESS_KEY_ID: _str.optional(),
	S3_SECRET_ACCESS_KEY: _str.optional(),
	/**
	 * Private bucket for restaurant KYC documents, on the same region, endpoint
	 * and credentials as `S3_BUCKET`. Objects are only ever read through
	 * short-lived presigned GET URLs; it must not allow public reads.
	 */
	S3_DOCUMENTS_BUCKET: _str.min(1),
});

/** Presigned-upload lifetime and how long an unconfirmed upload is kept. */
export const UploadConfigSchema = z.object({
	UPLOAD_URL_TTL_SECONDS: _seconds.default(600), // 10 minutes
	UPLOAD_PENDING_TTL_SECONDS: _seconds.default(3600), // 1 hour
	/** Lifetime of a presigned GET URL for a private KYC document. */
	DOCUMENT_URL_TTL_SECONDS: _seconds.default(300), // 5 minutes
});

/** Bytes in an AES-256 key. */
const _AES_256_KEY_BYTES = 32;

/**
 * Key for `EncryptionHelper` (AES-256-GCM), which encrypts KYC bank account
 * and PAN numbers at rest. Required at boot: 32 random bytes, base64-encoded.
 * Rotating it makes existing ciphertext unreadable, so never change it
 * without re-encrypting.
 */
export const KycConfigSchema = z.object({
	KYC_ENCRYPTION_KEY: _str.refine(
		(value) =>
			/^[A-Za-z0-9+/]+={0,2}$/.test(value) &&
			Buffer.from(value, "base64").length === _AES_256_KEY_BYTES,
		{ message: "KYC_ENCRYPTION_KEY must be 32 bytes, base64-encoded" },
	),
});

export const ConfigSchema = NodeConfigSchema.merge(LogConfigSchema)
	.merge(ServerAppConfigSchema)
	.merge(CorsConfigSchema)
	.merge(WebAppConfigSchema)
	.merge(PostgresConfigSchema)
	.merge(RedisConfigSchema)
	.merge(JwtConfigSchema)
	.merge(AuthConfigSchema)
	.merge(GoogleConfigSchema)
	.merge(ResendConfigSchema)
	.merge(S3ConfigSchema)
	.merge(UploadConfigSchema)
	.merge(KycConfigSchema)
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
