import { defineConfig } from "drizzle-kit";

/**
 * `npm run db:generate` reads `db/schema.ts` and writes SQL migrations to
 * `db/migrations`; `npm run db:migrate` applies them via `DATABASE_URL`.
 */
export default defineConfig({
	dialect: "postgresql",
	schema: "./db/schema.ts",
	out: "./db/migrations",
	casing: "snake_case",
	dbCredentials: {
		url:
			process.env.DATABASE_URL ??
			"postgres://postgres:postgres@localhost:5432/api_nearplate",
	},
});
