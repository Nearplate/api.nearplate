const net = require("node:net");
const path = require("node:path");
const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");

require("./apply-test-env.cjs");

const WAIT_MS = 30_000;
const STEP_MS = 250;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTcp(host, port, label) {
	const deadline = Date.now() + WAIT_MS;
	while (Date.now() < deadline) {
		const ok = await new Promise((resolve) => {
			const socket = net.connect({ host, port }, () => {
				socket.end();
				resolve(true);
			});
			socket.on("error", () => resolve(false));
		});
		if (ok) {
			return;
		}
		await sleep(STEP_MS);
	}
	throw new Error(
		`${label} not reachable at ${host}:${port} within ${WAIT_MS}ms. Start it with npm run test:deps.`,
	);
}

module.exports = async function globalSetup() {
	const uri = new URL(process.env.DATABASE_URL);
	if (!uri.pathname.endsWith("_test")) {
		throw new Error(
			`Refusing to run e2e against '${uri.pathname}': the database name must end in _test`,
		);
	}
	await waitForTcp(uri.hostname, Number(uri.port || 5432), "Postgres");
	await waitForTcp(
		process.env.REDIS_HOST,
		Number(process.env.REDIS_PORT),
		"Redis cache",
	);

	// Applies any migration not yet run, so the schema (including PostGIS
	// extension/indexes) is current before the first spec connects.
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	try {
		await migrate(drizzle(pool), {
			migrationsFolder: path.join(__dirname, "../../../db/migrations"),
		});
	} finally {
		await pool.end();
	}
};
