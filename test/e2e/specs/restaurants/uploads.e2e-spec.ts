import { DatabaseService } from "@/app/modules/database";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantService } from "@/services/restaurant.service";
import { uploads } from "@db/schemas/upload.schema";
import { eq } from "drizzle-orm";
import { getE2eApp } from "../../helpers/app.harness";

const RESTAURANT_BODY = {
	name: "Spice Hub",
	cuisines: ["indian"],
	isPureVeg: false,
	coordinates: [77.5946, 12.9716],
	address: {
		line1: "12 MG Road",
		city: "Bengaluru",
		state: "Karnataka",
		zipcode: "560001",
	},
};
const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("restaurant image uploads", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	async function createRestaurant(auth: string) {
		const res = await getE2eApp()
			.http.post("/v1/restaurants")
			.set("Authorization", auth)
			.send(RESTAURANT_BODY)
			.expect(201);
		return res.body as { id: string; logoUrl: string | null };
	}

	describe("create", () => {
		it("returns a presigned post for an allowed logo request", async () => {
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			const res = await getE2eApp()
				.http.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			expect(res.body).toMatchObject({
				uploadId: expect.any(String),
				url: expect.any(String),
				fields: expect.any(Object),
				publicUrl: expect.any(String),
				expiresAt: expect.any(String),
			});
		});

		it.each([
			["bad kind", { kind: "hero", contentType: "image/png", size: 1024 }],
			[
				"bad content type",
				{ kind: "logo", contentType: "image/gif", size: 1024 },
			],
			[
				"oversize logo",
				{ kind: "logo", contentType: "image/png", size: 3 * 1024 * 1024 },
			],
			["zero size", { kind: "logo", contentType: "image/png", size: 0 }],
		])("rejects %s with 400", async (_label, body) => {
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			await getE2eApp()
				.http.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("returns 401 without a token and 403 for the user role", async () => {
			const { http, authHeader } = getE2eApp();
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(401);
			await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", authHeader(AuthRole.User))
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(403);
		});

		it("returns 404 for a foreign or unknown restaurant", async () => {
			const a = await owner();
			const b = await owner();
			const r = await createRestaurant(a.auth);
			await getE2eApp()
				.http.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", b.auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(404);
			await getE2eApp()
				.http.post(`/v1/restaurants/${MISSING_ID}/uploads`)
				.set("Authorization", a.auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(404);
		});
	});

	describe("confirm", () => {
		it("sets logoUrl and deletes the previously owned object", async () => {
			const { http, s3 } = getE2eApp();
			const { auth } = await owner();
			const r = await createRestaurant(auth);

			const first = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			const firstKey = s3.keyFromPublicUrl(first.body.publicUrl) as string;
			s3.simulateUpload(firstKey, 1024, "image/png");
			const confirmed = await http
				.post(`/v1/restaurants/${r.id}/uploads/${first.body.uploadId}/confirm`)
				.set("Authorization", auth)
				.expect(200);
			expect(confirmed.body.logoUrl).toBe(first.body.publicUrl);

			const second = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			const secondKey = s3.keyFromPublicUrl(second.body.publicUrl) as string;
			s3.simulateUpload(secondKey, 1024, "image/png");
			await http
				.post(`/v1/restaurants/${r.id}/uploads/${second.body.uploadId}/confirm`)
				.set("Authorization", auth)
				.expect(200);

			await s3.waitForDelete(firstKey);
		});

		it("does not delete an externally-pasted logo URL", async () => {
			const { http, s3 } = getE2eApp();
			const { auth } = await owner();
			const r = await http
				.post("/v1/restaurants")
				.set("Authorization", auth)
				.send({
					...RESTAURANT_BODY,
					logoUrl: "https://cdn.example.com/pasted.png",
				})
				.expect(201);

			const created = await http
				.post(`/v1/restaurants/${r.body.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 1024, "image/png");
			await http
				.post(
					`/v1/restaurants/${r.body.id}/uploads/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", auth)
				.expect(200);

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(s3.deletedKeys).not.toContain("pasted.png");
		});

		it("returns 409 when the object was never uploaded", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			const created = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			await http
				.post(
					`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", auth)
				.expect(409);
		});

		it("returns 404 for a foreign, unknown or already-confirmed upload", async () => {
			const { http, s3 } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const r = await createRestaurant(a.auth);
			const created = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", a.auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 1024, "image/png");

			await http
				.post(
					`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", b.auth)
				.expect(404);
			await http
				.post(`/v1/restaurants/${r.id}/uploads/${MISSING_ID}/confirm`)
				.set("Authorization", a.auth)
				.expect(404);

			await http
				.post(
					`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", a.auth)
				.expect(200);
			await http
				.post(
					`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", a.auth)
				.expect(404);
		});
	});

	describe("cancel", () => {
		it("deletes the object and returns 204; a second cancel is 404", async () => {
			const { http, s3 } = getE2eApp();
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			const created = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "banner", contentType: "image/webp", size: 2048 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 2048, "image/webp");

			await http
				.delete(`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}`)
				.set("Authorization", auth)
				.expect(204);
			expect(s3.deletedKeys).toContain(key);
			expect(await s3.headObject(key)).toBeNull();

			await http
				.delete(`/v1/restaurants/${r.id}/uploads/${created.body.uploadId}`)
				.set("Authorization", auth)
				.expect(404);
		});
	});

	describe("sweep", () => {
		it("deletes expired pending uploads' objects and rows, even after the restaurant is gone", async () => {
			const { http, s3, app } = getE2eApp();
			const { auth } = await owner();
			const r = await createRestaurant(auth);
			const created = await http
				.post(`/v1/restaurants/${r.id}/uploads`)
				.set("Authorization", auth)
				.send({ kind: "logo", contentType: "image/png", size: 1024 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 1024, "image/png");

			await http
				.delete(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.expect(204);

			const databaseService = app.get(DatabaseService);
			await databaseService.db
				.update(uploads)
				.set({ expiresAt: new Date(Date.now() - 1000) })
				.where(eq(uploads.id, created.body.uploadId));

			await app.get(RestaurantService).sweepExpiredUploads();

			expect(s3.deletedKeys).toContain(key);
			expect(await s3.headObject(key)).toBeNull();
		});
	});
});
