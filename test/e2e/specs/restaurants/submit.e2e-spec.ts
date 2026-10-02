import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { getE2eApp } from "../../helpers/app.harness";

describe("POST /v1/restaurants/:id/submit", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	it("moves a complete draft restaurant to pending_review", async () => {
		const { http, seedRestaurant, seedOnboarding } = getE2eApp();
		const { user, auth } = await owner();
		const r = await seedRestaurant(
			user.id,
			{},
			{ verificationStatus: RestaurantVerificationStatus.Draft },
		);
		await seedOnboarding(user.id, r.id);

		const res = await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", auth)
			.expect(200);

		expect(res.body.verificationStatus).toBe("pending_review");
		expect(res.body.rejectionReason).toBeNull();
	});

	it("lets a rejected restaurant resubmit and clears the reason", async () => {
		const { http, seedRestaurant, seedOnboarding } = getE2eApp();
		const { user, auth } = await owner();
		const r = await seedRestaurant(
			user.id,
			{},
			{
				verificationStatus: RestaurantVerificationStatus.Rejected,
				rejectionReason: "Blurry documents",
			},
		);
		await seedOnboarding(user.id, r.id);

		const res = await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", auth)
			.expect(200);

		expect(res.body).toMatchObject({
			verificationStatus: "pending_review",
			rejectionReason: null,
		});
	});

	it("returns 409 listing everything a bare draft is missing", async () => {
		const { http, seedRestaurant } = getE2eApp();
		const { user, auth } = await owner();
		const r = await seedRestaurant(
			user.id,
			{},
			{ verificationStatus: RestaurantVerificationStatus.Draft },
		);

		const res = await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", auth)
			.expect(409);

		expect(res.body.code).toBe("RESTAURANT_INCOMPLETE");
		expect(res.body.message).toBe(
			"Restaurant is missing required data: aadhaar_front, aadhaar_back, " +
				"pan_front, pan_back, fssai_certificate, bank_proof, panNumber, " +
				"fssaiNumber, accountHolderName, accountNumber, ifscCode, bankName",
		);
		const mine = await http
			.get("/v1/restaurants/mine")
			.set("Authorization", auth)
			.expect(200);
		expect(mine.body.items[0].verificationStatus).toBe("draft");
	});

	it("lists only what is still missing, ignoring unconfirmed uploads", async () => {
		const { http, seedRestaurant } = getE2eApp();
		const { user, auth } = await owner();
		const r = await seedRestaurant(
			user.id,
			{},
			{ verificationStatus: RestaurantVerificationStatus.Draft },
		);
		await http
			.patch(`/v1/restaurants/${r.id}/kyc`)
			.set("Authorization", auth)
			.send({
				panNumber: "ABCDE1234F",
				fssaiNumber: "12345678901234",
				accountHolderName: "Asha Rao",
				accountNumber: "123456789012",
				ifscCode: "HDFC0001234",
			})
			.expect(200);
		const { documents } = getE2eApp();
		for (const type of ["aadhaar_front", "aadhaar_back"]) {
			const post = await http
				.post(`/v1/restaurants/${r.id}/documents`)
				.set("Authorization", auth)
				.send({ type, contentType: "image/png", size: 1024 })
				.expect(201);
			documents.simulateUpload(post.body.fields.key, 1024, "image/png");
			await http
				.post(`/v1/restaurants/${r.id}/documents/${type}/confirm`)
				.set("Authorization", auth)
				.expect(200);
		}
		// Presigned but never confirmed: still counts as missing.
		await http
			.post(`/v1/restaurants/${r.id}/documents`)
			.set("Authorization", auth)
			.send({ type: "pan_front", contentType: "image/png", size: 1024 })
			.expect(201);

		const res = await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", auth)
			.expect(409);

		expect(res.body.message).toBe(
			"Restaurant is missing required data: pan_front, pan_back, " +
				"fssai_certificate, bank_proof, bankName",
		);
	});

	it.each([
		RestaurantVerificationStatus.PendingReview,
		RestaurantVerificationStatus.Approved,
	])("returns 409 when the restaurant is %s", async (verificationStatus) => {
		const { http, seedRestaurant } = getE2eApp();
		const { user, auth } = await owner();
		const r = await seedRestaurant(user.id, {}, { verificationStatus });

		const res = await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", auth)
			.expect(409);

		expect(res.body.code).toBe(
			"RESTAURANT_VERIFICATION_TRANSITION_NOT_ALLOWED",
		);
	});

	it("returns 404 for another owner's or an unknown restaurant", async () => {
		const { http, seedRestaurant } = getE2eApp();
		const a = await owner();
		const b = await owner();
		const r = await seedRestaurant(
			a.user.id,
			{},
			{ verificationStatus: RestaurantVerificationStatus.Draft },
		);

		await http
			.post(`/v1/restaurants/${r.id}/submit`)
			.set("Authorization", b.auth)
			.expect(404);
		await http
			.post("/v1/restaurants/64b7f0c2a1b2c3d4e5f60718/submit")
			.set("Authorization", a.auth)
			.expect(404);
	});

	it("returns 401 without a token and 403 for non-restaurant roles", async () => {
		const { http, seedUser } = getE2eApp();
		const id = "11111111-1111-4111-8111-111111111111";
		const customer = await seedUser({ role: AuthRole.User });

		await http.post(`/v1/restaurants/${id}/submit`).expect(401);
		await http
			.post(`/v1/restaurants/${id}/submit`)
			.set("Authorization", `Bearer ${customer.accessToken}`)
			.expect(403);
	});
});
