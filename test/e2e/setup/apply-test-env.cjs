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
		MONGODB_URI: "mongodb://localhost:27017/api_nearplate_test",
		REDIS_HOST: "localhost",
		REDIS_PORT: "6380",
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
	});

	delete process.env.LOKI_HOST;
	// Mail and Google are faked in the harness; never let a real key leak in.
	delete process.env.RESEND_API_KEY;
}

applyTestEnv();

module.exports = { applyTestEnv };
