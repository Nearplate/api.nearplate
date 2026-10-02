import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { Logger as NestLogger } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Writable } from "node:stream";
import { transports, type Logger } from "winston";
import { getE2eApp } from "../../helpers/app.harness";

const PAN = "ABCDE1234F";
const ACCOUNT = "123456789012";
const IFSC = "HDFC0001234";
const FSSAI = "12345678901234";

describe("log scrubbing", () => {
	let captured: unknown[];
	let capture: InstanceType<typeof transports.Stream>;
	let logger: Logger;

	/** Lets winston's stream pipeline deliver pending entries. */
	const flush = () => new Promise((resolve) => setImmediate(resolve));

	beforeEach(() => {
		captured = [];
		logger = getE2eApp().app.get<Logger>(WINSTON_MODULE_PROVIDER);
		capture = new transports.Stream({
			stream: new Writable({
				objectMode: true,
				write(info, _encoding, callback) {
					captured.push(info);
					callback();
				},
			}),
		});
		logger.add(capture);
	});

	afterEach(() => {
		logger.remove(capture);
	});

	it("redacts KYC identifiers from messages and stacks", async () => {
		const error = new Error(
			`Failed query params: ${PAN},${ACCOUNT},${IFSC},${FSSAI}`,
		);
		new NestLogger("ScrubSpec").error(
			`insert failed for ${PAN.toLowerCase()} / ${ACCOUNT}`,
			error.stack,
		);
		await flush();

		const text = JSON.stringify(captured);
		expect(captured.length).toBeGreaterThan(0);
		expect(text).toContain("[redacted]");
		for (const value of [PAN, PAN.toLowerCase(), ACCOUNT, IFSC, FSSAI]) {
			expect(text).not.toContain(value);
		}
	});

	it("never echoes submitted KYC values in a 400 body or the logs", async () => {
		const { seedUser, seedRestaurant, http } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(
			user.id,
			{},
			{
				verificationStatus: RestaurantVerificationStatus.Draft,
				status: RestaurantStatus.Offline,
			},
		);
		const badPan = "ABCD1234F";
		const badAccount = "98765abc4321";

		const res = await http
			.patch(`/v1/restaurants/${restaurant.id}/kyc`)
			.set("Authorization", `Bearer ${user.accessToken}`)
			.send({ panNumber: badPan, accountNumber: badAccount })
			.expect(400);
		await flush();

		for (const text of [JSON.stringify(res.body), JSON.stringify(captured)]) {
			expect(text).not.toContain(badPan);
			expect(text).not.toContain(badAccount);
		}
	});
});
