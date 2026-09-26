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
		TODO_CLEANUP_CRON_ENABLED: "false",
		TODO_CLEANUP_AFTER_DAYS: "30",
	});

	delete process.env.LOKI_HOST;
}

applyTestEnv();

module.exports = { applyTestEnv };
