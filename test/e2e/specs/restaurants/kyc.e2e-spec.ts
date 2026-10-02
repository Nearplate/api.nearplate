import { DatabaseService } from "@/app/modules/database";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { restaurantKyc } from "@db/schemas/restaurant-kyc.schema";
import { eq } from "drizzle-orm";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "6f1c2b9e-4a3d-4c1b-9e2f-0a1b2c3d4e5f";
const PAN = "ABCDE1234F";
const ACCOUNT = "123456789012";
const BANK_BODY = {
	accountHolderName: "Asha Rao",
	accountNumber: ACCOUNT,
	ifscCode: "hdfc0001234",
	bankName: "HDFC Bank",
};

describe("restaurant KYC", () => {
	async function ownerWithRestaurant(
		verificationStatus = RestaurantVerificationStatus.Draft,
	) {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(
			user.id,
			{},
			{ verificationStatus, status: RestaurantStatus.Offline },
		);
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	function patchKyc(auth: string, id: string, body: object) {
		return getE2eApp()
			.http.patch(`/v1/restaurants/${id}/kyc`)
			.set("Authorization", auth)
			.send(body);
	}

	it("returns all-null details before anything is saved", async () => {
		const { restaurant, auth } = await ownerWithRestaurant();
		const res = await getE2eApp()
			.http.get(`/v1/restaurants/${restaurant.id}/kyc`)
			.set("Authorization", auth)
			.expect(200);
		expect(res.body).toEqual({
			panNumber: null,
			fssaiNumber: null,
			accountHolderName: null,
			accountNumber: null,
			ifscCode: null,
			bankName: null,
			updatedAt: null,
		});
	});

	it("saves partial drafts, merges them and masks PAN and account number", async () => {
		const { restaurant, auth } = await ownerWithRestaurant();
		const first = await patchKyc(auth, restaurant.id, {
			panNumber: "abcde1234f",
			fssaiNumber: "12345678901234",
		}).expect(200);
		expect(first.body).toMatchObject({
			panNumber: "XXXXX1234F",
			fssaiNumber: "12345678901234",
			accountNumber: null,
		});

		await patchKyc(auth, restaurant.id, BANK_BODY).expect(200);
		const res = await getE2eApp()
			.http.get(`/v1/restaurants/${restaurant.id}/kyc`)
			.set("Authorization", auth)
			.expect(200);
		expect(res.body).toEqual({
			panNumber: "XXXXX1234F",
			fssaiNumber: "12345678901234",
			accountHolderName: "Asha Rao",
			accountNumber: "XXXXXXXX9012",
			ifscCode: "HDFC0001234",
			bankName: "HDFC Bank",
			updatedAt: expect.any(String),
		});
	});

	it("stores PAN and account number only as ciphertext", async () => {
		const { restaurant, auth } = await ownerWithRestaurant();
		await patchKyc(auth, restaurant.id, {
			panNumber: PAN,
			...BANK_BODY,
		}).expect(200);
		const [row] = await getE2eApp()
			.app.get(DatabaseService)
			.db.select()
			.from(restaurantKyc)
			.where(eq(restaurantKyc.restaurantId, restaurant.id));
		expect(row.panNumberEncrypted).toMatch(/^v1:/);
		expect(row.accountNumberEncrypted).toMatch(/^v1:/);
		expect(JSON.stringify(row)).not.toContain(PAN);
		expect(JSON.stringify(row)).not.toContain(ACCOUNT);
	});

	it.each([
		["a malformed PAN", { panNumber: "ABCD1234F" }],
		["an IFSC without the 0", { ifscCode: "HDFC1001234" }],
		["a short FSSAI number", { fssaiNumber: "1234" }],
		["a non-numeric account number", { accountNumber: "12345abc901" }],
		["a too-short account number", { accountNumber: "12345678" }],
		["a blank bank name", { bankName: "   " }],
		["an unknown field", { upiId: "asha@okhdfc" }],
		["an empty body", {}],
	])("rejects %s with 400", async (_label, body) => {
		const { restaurant, auth } = await ownerWithRestaurant();
		await patchKyc(auth, restaurant.id, body).expect(400);
	});

	it.each([
		RestaurantVerificationStatus.PendingReview,
		RestaurantVerificationStatus.Approved,
	])("locks edits with 409 while %s but stays readable", async (status) => {
		const { http } = getE2eApp();
		const { user, restaurant, auth } = await ownerWithRestaurant();
		await patchKyc(auth, restaurant.id, { panNumber: PAN }).expect(200);
		await getE2eApp()
			.app.get(RestaurantRepository)
			.update(user.id, restaurant.id, { verificationStatus: status });

		const res = await patchKyc(auth, restaurant.id, BANK_BODY).expect(409);
		expect(res.body.code).toBe("RESTAURANT_ONBOARDING_LOCKED");
		const read = await http
			.get(`/v1/restaurants/${restaurant.id}/kyc`)
			.set("Authorization", auth)
			.expect(200);
		expect(read.body.panNumber).toBe("XXXXX1234F");
		expect(read.body.accountNumber).toBeNull();
	});

	it("allows edits again once rejected", async () => {
		const { restaurant, auth } = await ownerWithRestaurant(
			RestaurantVerificationStatus.Rejected,
		);
		await patchKyc(auth, restaurant.id, { panNumber: PAN }).expect(200);
	});

	it("returns 404 for another owner's or an unknown restaurant", async () => {
		const { http } = getE2eApp();
		const a = await ownerWithRestaurant();
		const b = await ownerWithRestaurant();
		await patchKyc(a.auth, a.restaurant.id, { panNumber: PAN }).expect(200);
		for (const id of [a.restaurant.id, MISSING_ID]) {
			await http
				.get(`/v1/restaurants/${id}/kyc`)
				.set("Authorization", b.auth)
				.expect(404);
			await patchKyc(b.auth, id, { panNumber: PAN }).expect(404);
		}
	});

	it("returns 401 without a token and 403 for the user role", async () => {
		const { http, authHeader } = getE2eApp();
		const { restaurant } = await ownerWithRestaurant();
		const path = `/v1/restaurants/${restaurant.id}/kyc`;
		await http.get(path).expect(401);
		await http.patch(path).send({ panNumber: PAN }).expect(401);
		await http
			.get(path)
			.set("Authorization", authHeader(AuthRole.User))
			.expect(403);
		await http
			.patch(path)
			.set("Authorization", authHeader(AuthRole.User))
			.send({ panNumber: PAN })
			.expect(403);
	});
});
