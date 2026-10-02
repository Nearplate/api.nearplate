import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "6f1c2b9e-4a3d-4c1b-9e2f-0a1b2c3d4e5f";
const PDF_BODY = {
	type: "aadhaar_front",
	contentType: "application/pdf",
	size: 2048,
};
const MAX_BYTES = 5 * 1024 * 1024;

describe("restaurant documents", () => {
	async function ownerWithRestaurant(
		verificationStatus = RestaurantVerificationStatus.Draft,
		name?: string,
	) {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(user.id, name ? { name } : {}, {
			verificationStatus,
			status: RestaurantStatus.Offline,
		});
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	async function presign(auth: string, id: string, body: object = PDF_BODY) {
		const res = await getE2eApp()
			.http.post(`/v1/restaurants/${id}/documents`)
			.set("Authorization", auth)
			.send(body)
			.expect(201);
		return res.body as {
			type: string;
			url: string;
			fields: Record<string, string>;
			expiresAt: string;
		};
	}

	async function upload(auth: string, id: string, body = PDF_BODY) {
		const { http, documents } = getE2eApp();
		const post = await presign(auth, id, body);
		documents.simulateUpload(post.fields.key, body.size, body.contentType);
		await http
			.post(`/v1/restaurants/${id}/documents/${body.type}/confirm`)
			.set("Authorization", auth)
			.expect(200);
		return post.fields.key;
	}

	function setVerification(
		ownerId: string,
		id: string,
		verificationStatus: RestaurantVerificationStatus,
	) {
		return getE2eApp()
			.app.get(RestaurantRepository)
			.update(ownerId, id, { verificationStatus });
	}

	describe("presign", () => {
		it("returns a presigned post with a server-generated key", async () => {
			const { restaurant, auth } = await ownerWithRestaurant();
			const post = await presign(auth, restaurant.id);
			expect(post).toMatchObject({
				type: "aadhaar_front",
				url: expect.any(String),
				expiresAt: expect.any(String),
			});
			expect(post.fields.key).toBe(
				`${restaurant.id}_Spice_Hub_aadhaar_front.pdf`,
			);
			expect(post.url).not.toContain("fake-bucket.test");
		});

		it("sanitises the restaurant name into an S3-safe key", async () => {
			const { restaurant, auth } = await ownerWithRestaurant(
				RestaurantVerificationStatus.Draft,
				"  Tasty   Bites!/../x  ",
			);
			const post = await presign(auth, restaurant.id, {
				type: "pan_front",
				contentType: "image/png",
				size: 1024,
			});
			expect(post.fields.key).toBe(
				`${restaurant.id}_Tasty_Bitesx_pan_front.png`,
			);
		});

		it.each([
			["unknown type", { ...PDF_BODY, type: "passport" }],
			["disallowed content type", { ...PDF_BODY, contentType: "image/gif" }],
			["oversize file", { ...PDF_BODY, size: MAX_BYTES + 1 }],
			["zero size", { ...PDF_BODY, size: 0 }],
			["client-supplied key", { ...PDF_BODY, key: "../evil.pdf" }],
		])("rejects %s with 400", async (_label, body) => {
			const { restaurant, auth } = await ownerWithRestaurant();
			await getE2eApp()
				.http.post(`/v1/restaurants/${restaurant.id}/documents`)
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("deletes the old object when a re-upload changes the key", async () => {
			const { documents } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			const pdfKey = await upload(auth, restaurant.id);
			const png = await presign(auth, restaurant.id, {
				type: "aadhaar_front",
				contentType: "image/png",
				size: 1024,
			});
			expect(png.fields.key).not.toBe(pdfKey);
			await documents.waitForDelete(pdfKey);
		});
	});

	describe("confirm", () => {
		it("marks the document uploaded with a presigned download URL", async () => {
			const { http, documents } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			const post = await presign(auth, restaurant.id);
			documents.simulateUpload(post.fields.key, 1500, "application/pdf");
			const res = await http
				.post(
					`/v1/restaurants/${restaurant.id}/documents/aadhaar_front/confirm`,
				)
				.set("Authorization", auth)
				.expect(200);
			expect(res.body).toEqual({
				type: "aadhaar_front",
				status: "uploaded",
				contentType: "application/pdf",
				size: 1500,
				url: expect.stringContaining("X-Amz-Signature"),
				updatedAt: expect.any(String),
			});
		});

		it.each([
			["the object is missing", null],
			["the content type differs", { size: 2048, contentType: "image/png" }],
			[
				"the object is over the cap",
				{ size: MAX_BYTES + 1, contentType: "application/pdf" },
			],
		])("returns 409 when %s", async (_label, object) => {
			const { http, documents } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			const post = await presign(auth, restaurant.id);
			if (object) {
				documents.simulateUpload(
					post.fields.key,
					object.size,
					object.contentType,
				);
			}
			const res = await http
				.post(
					`/v1/restaurants/${restaurant.id}/documents/aadhaar_front/confirm`,
				)
				.set("Authorization", auth)
				.expect(409);
			expect(res.body.code).toBe("RESTAURANT_DOCUMENT_UPLOAD_MISMATCH");
		});

		it("returns 404 without a presign and for an unknown type", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			await http
				.post(`/v1/restaurants/${restaurant.id}/documents/pan_back/confirm`)
				.set("Authorization", auth)
				.expect(404);
			await http
				.post(`/v1/restaurants/${restaurant.id}/documents/passport/confirm`)
				.set("Authorization", auth)
				.expect(404);
		});
	});

	describe("list", () => {
		it("lists pending and uploaded documents without exposing keys", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			await upload(auth, restaurant.id);
			await presign(auth, restaurant.id, { ...PDF_BODY, type: "pan_front" });
			const res = await http
				.get(`/v1/restaurants/${restaurant.id}/documents`)
				.set("Authorization", auth)
				.expect(200);
			expect(res.body.items).toEqual([
				expect.objectContaining({
					type: "aadhaar_front",
					status: "uploaded",
					url: expect.stringContaining("fake-documents.test"),
				}),
				expect.objectContaining({
					type: "pan_front",
					status: "pending",
					url: null,
				}),
			]);
			for (const item of res.body.items) {
				expect(item).not.toHaveProperty("objectKey");
				expect(item).not.toHaveProperty("ownerId");
			}
		});

		it("stays readable while the restaurant is pending review", async () => {
			const { http } = getE2eApp();
			const { user, restaurant, auth } = await ownerWithRestaurant();
			await upload(auth, restaurant.id);
			await setVerification(
				user.id,
				restaurant.id,
				RestaurantVerificationStatus.PendingReview,
			);
			const res = await http
				.get(`/v1/restaurants/${restaurant.id}/documents`)
				.set("Authorization", auth)
				.expect(200);
			expect(res.body.items).toHaveLength(1);
		});
	});

	describe("delete", () => {
		it("removes the row and the S3 object", async () => {
			const { http, documents } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			const key = await upload(auth, restaurant.id);
			await http
				.delete(`/v1/restaurants/${restaurant.id}/documents/aadhaar_front`)
				.set("Authorization", auth)
				.expect(204);
			expect(documents.deletedKeys).toContain(key);
			const list = await http
				.get(`/v1/restaurants/${restaurant.id}/documents`)
				.set("Authorization", auth)
				.expect(200);
			expect(list.body.items).toEqual([]);
			await http
				.delete(`/v1/restaurants/${restaurant.id}/documents/aadhaar_front`)
				.set("Authorization", auth)
				.expect(404);
		});
	});

	describe("verification lock", () => {
		it.each([
			RestaurantVerificationStatus.PendingReview,
			RestaurantVerificationStatus.Approved,
		])("returns 409 for every write while %s", async (status) => {
			const { http, documents } = getE2eApp();
			const { user, restaurant, auth } = await ownerWithRestaurant();
			const post = await presign(auth, restaurant.id);
			documents.simulateUpload(post.fields.key, 2048, "application/pdf");
			await setVerification(user.id, restaurant.id, status);

			// Built lazily: a supertest request starts its server when created.
			const writes = [
				() =>
					http
						.post(`/v1/restaurants/${restaurant.id}/documents`)
						.set("Authorization", auth)
						.send(PDF_BODY),
				() =>
					http
						.post(
							`/v1/restaurants/${restaurant.id}/documents/aadhaar_front/confirm`,
						)
						.set("Authorization", auth),
				() =>
					http
						.delete(`/v1/restaurants/${restaurant.id}/documents/aadhaar_front`)
						.set("Authorization", auth),
			];
			for (const write of writes) {
				const res = await write().expect(409);
				expect(res.body.code).toBe("RESTAURANT_ONBOARDING_LOCKED");
			}
		});

		it("allows uploads again once rejected", async () => {
			const { restaurant, auth } = await ownerWithRestaurant(
				RestaurantVerificationStatus.Rejected,
			);
			await presign(auth, restaurant.id);
		});
	});

	describe("access", () => {
		const routes = (id: string) => [
			{ method: "post" as const, path: `/v1/restaurants/${id}/documents` },
			{ method: "get" as const, path: `/v1/restaurants/${id}/documents` },
			{
				method: "post" as const,
				path: `/v1/restaurants/${id}/documents/aadhaar_front/confirm`,
			},
			{
				method: "delete" as const,
				path: `/v1/restaurants/${id}/documents/aadhaar_front`,
			},
		];

		it("returns 401 without a token and 403 for the user role", async () => {
			const { http, authHeader } = getE2eApp();
			const { restaurant } = await ownerWithRestaurant();
			for (const route of routes(restaurant.id)) {
				await http[route.method](route.path).send(PDF_BODY).expect(401);
				await http[route.method](route.path)
					.set("Authorization", authHeader(AuthRole.User))
					.send(PDF_BODY)
					.expect(403);
			}
		});

		it("returns 404 for another owner's or an unknown restaurant", async () => {
			const { http } = getE2eApp();
			const a = await ownerWithRestaurant();
			const b = await ownerWithRestaurant();
			await presign(a.auth, a.restaurant.id);
			for (const route of [...routes(a.restaurant.id), ...routes(MISSING_ID)]) {
				await http[route.method](route.path)
					.set("Authorization", b.auth)
					.send(PDF_BODY)
					.expect(404);
			}
		});
	});
});
