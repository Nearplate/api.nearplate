/**
 * Force a throwaway test database and fixture secrets before AppModule loads.
 * Always overwrite -- never inherit a developer .env remote DB / secrets.
 */
function applyTestEnv() {
	Object.assign(process.env, {
		NODE_ENV: "development",
		LOG_LEVEL: "error",
		SERVER_APP_HTTP_PORT: "3000",
		CORS_ORIGIN: "http://localhost:3400",
		DATABASE_URL:
			"postgres://postgres:postgres@localhost:5433/api_nearplate_test",
		REDIS_URI: "redis://localhost:6380",
		JWT_ADMIN_ACCESS_SECRET: "e2e-admin-access",
		JWT_RESTAURANT_ACCESS_SECRET: "e2e-restaurant-access",
		JWT_USER_ACCESS_SECRET: "e2e-user-access",
		JWT_GUEST_ACCESS_SECRET: "e2e-guest-access",
		WEB_APP_BASE_URL: "http://localhost:3400",
		WEB_APP_MAGIC_PATH: "/auth/magic",
		MAGIC_LINK_TTL_SECONDS: "900",
		MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR: "3",
		SESSION_TTL_SECONDS: "2592000",
		OAUTH_STATE_TTL_SECONDS: "600",
		GOOGLE_CLIENT_ID: "e2e-client-id",
		GOOGLE_CLIENT_SECRET: "e2e-client-secret",
		GOOGLE_REDIRECT_URI: "http://localhost:3400/auth/google/callback",
		// S3StorageAdapter itself is faked in the harness; these just satisfy
		// config validation at boot.
		S3_IMAGE_BUCKET: "e2e-images",
		S3_DOCUMENTS_BUCKET: "e2e-documents",
		S3_REGION: "us-east-1",
		S3_PUBLIC_BASE_URL: "https://e2e-bucket.s3.us-east-1.amazonaws.com",
		S3_FORCE_PATH_STYLE: "false",
		UPLOAD_URL_TTL_SECONDS: "600",
		UPLOAD_PENDING_TTL_SECONDS: "3600",
		DOCUMENT_URL_TTL_SECONDS: "300",
		// Fixture key (32 bytes of 0x07); never a real one.
		KYC_ENCRYPTION_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
	});

	delete process.env.LOKI_HOST;
	// Mail and Google are faked in the harness; never let a real key leak in.
	delete process.env.RESEND_API_KEY;
}

applyTestEnv();

module.exports = { applyTestEnv };
