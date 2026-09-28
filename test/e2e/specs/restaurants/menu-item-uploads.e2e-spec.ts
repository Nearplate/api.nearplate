import { DatabaseService } from "@/app/modules/database";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantService } from "@/services/restaurant.service";
import { uploads } from "@db/schemas/upload.schema";
import { eq } from "drizzle-orm";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("menu item image uploads", () => {
	async function owner() {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(user.id);
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	async function createItem(auth: string, restaurantId: string) {
		const res = await getE2eApp()
			.http.post(`/v1/restaurants/${restaurantId}/menu/items`)
			.set("Authorization", auth)
			.send({
				name: "Paneer Tikka",
				category: "Starters",
				priceInPaise: 24900,
				foodType: "veg",
			})
			.expect(201);
		return res.body as { id: string; imageUrl: string | null };
	}

	const uploadsUrl = (restaurantId: string, itemId: string) =>
		`/v1/restaurants/${restaurantId}/menu/items/${itemId}/uploads`;

	describe("create", () => {
		it("returns a presigned post for an allowed request", async () => {
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			const res = await getE2eApp()
				.http.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/png", size: 1024 })
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
			["bad content type", { contentType: "image/gif", size: 1024 }],
			["oversize photo", { contentType: "image/png", size: 4 * 1024 * 1024 }],
			["zero size", { contentType: "image/png", size: 0 }],
		])("rejects %s with 400", async (_label, body) => {
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			await getE2eApp()
				.http.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("returns 401 without a token and 403 for the user role", async () => {
			const { http, authHeader } = getE2eApp();
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			await http
				.post(uploadsUrl(restaurant.id, item.id))
				.send({ contentType: "image/png", size: 1024 })
				.expect(401);
			await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", authHeader(AuthRole.User))
				.send({ contentType: "image/png", size: 1024 })
				.expect(403);
		});

		it("returns 404 for a foreign or unknown item or restaurant", async () => {
			const a = await owner();
			const b = await owner();
			const item = await createItem(a.auth, a.restaurant.id);
			await getE2eApp()
				.http.post(uploadsUrl(a.restaurant.id, item.id))
				.set("Authorization", b.auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(404);
			await getE2eApp()
				.http.post(uploadsUrl(a.restaurant.id, MISSING_ID))
				.set("Authorization", a.auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(404);
		});
	});

	describe("confirm", () => {
		it("sets imageUrl and deletes the previously owned object", async () => {
			const { http, s3 } = getE2eApp();
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);

			const first = await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(201);
			const firstKey = s3.keyFromPublicUrl(first.body.publicUrl) as string;
			s3.simulateUpload(firstKey, 1024, "image/png");
			const confirmed = await http
				.post(
					`${uploadsUrl(restaurant.id, item.id)}/${first.body.uploadId}/confirm`,
				)
				.set("Authorization", auth)
				.expect(200);
			expect(confirmed.body.imageUrl).toBe(first.body.publicUrl);

			const second = await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(201);
			const secondKey = s3.keyFromPublicUrl(second.body.publicUrl) as string;
			s3.simulateUpload(secondKey, 1024, "image/png");
			await http
				.post(
					`${uploadsUrl(restaurant.id, item.id)}/${second.body.uploadId}/confirm`,
				)
				.set("Authorization", auth)
				.expect(200);

			await s3.waitForDelete(firstKey);
		});

		it("returns 409 when the object was never uploaded", async () => {
			const { http } = getE2eApp();
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			const created = await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(201);
			await http
				.post(
					`${uploadsUrl(restaurant.id, item.id)}/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", auth)
				.expect(409);
		});

		it("returns 404 for a foreign, unknown or already-confirmed upload", async () => {
			const { http, s3 } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const item = await createItem(a.auth, a.restaurant.id);
			const created = await http
				.post(uploadsUrl(a.restaurant.id, item.id))
				.set("Authorization", a.auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 1024, "image/png");

			await http
				.post(
					`${uploadsUrl(a.restaurant.id, item.id)}/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", b.auth)
				.expect(404);
			await http
				.post(`${uploadsUrl(a.restaurant.id, item.id)}/${MISSING_ID}/confirm`)
				.set("Authorization", a.auth)
				.expect(404);

			await http
				.post(
					`${uploadsUrl(a.restaurant.id, item.id)}/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", a.auth)
				.expect(200);
			await http
				.post(
					`${uploadsUrl(a.restaurant.id, item.id)}/${created.body.uploadId}/confirm`,
				)
				.set("Authorization", a.auth)
				.expect(404);
		});
	});

	describe("cancel", () => {
		it("deletes the object and returns 204; a second cancel is 404", async () => {
			const { http, s3 } = getE2eApp();
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			const created = await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/webp", size: 2048 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 2048, "image/webp");

			await http
				.delete(
					`${uploadsUrl(restaurant.id, item.id)}/${created.body.uploadId}`,
				)
				.set("Authorization", auth)
				.expect(204);
			expect(s3.deletedKeys).toContain(key);
			expect(await s3.headObject(key)).toBeNull();

			await http
				.delete(
					`${uploadsUrl(restaurant.id, item.id)}/${created.body.uploadId}`,
				)
				.set("Authorization", auth)
				.expect(404);
		});
	});

	describe("sweep", () => {
		it("deletes expired pending uploads' objects and rows, even after the item is gone", async () => {
			const { http, s3, app } = getE2eApp();
			const { auth, restaurant } = await owner();
			const item = await createItem(auth, restaurant.id);
			const created = await http
				.post(uploadsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ contentType: "image/png", size: 1024 })
				.expect(201);
			const key = s3.keyFromPublicUrl(created.body.publicUrl) as string;
			s3.simulateUpload(key, 1024, "image/png");

			await http
				.delete(`/v1/restaurants/${restaurant.id}/menu/items/${item.id}`)
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
