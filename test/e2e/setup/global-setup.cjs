const net = require("node:net");

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
	const uri = new URL(process.env.MONGODB_URI);
	if (!uri.pathname.endsWith("_test")) {
		throw new Error(
			`Refusing to run e2e against '${uri.pathname}': the database name must end in _test`,
		);
	}
	await waitForTcp(uri.hostname, Number(uri.port || 27017), "MongoDB");
	await waitForTcp(
		process.env.REDIS_HOST,
		Number(process.env.REDIS_PORT),
		"Redis cache",
	);
};
