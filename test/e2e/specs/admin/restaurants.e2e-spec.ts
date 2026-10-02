import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { getE2eApp } from "../../helpers/app.harness";

const PENDING = RestaurantVerificationStatus.PendingReview;

describe("admin restaurant review", () => {
	async function admin() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Admin });
		return `Bearer ${user.accessToken}`;
	}

	async function ownerWithRestaurant(
		verificationStatus: RestaurantVerificationStatus = PENDING,
		name = "Spice Hub",
	) {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(
			user.id,
			{ name },
			{ verificationStatus, status: RestaurantStatus.Offline },
		);
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	describe("access", () => {
		it("returns 401 without a token and 403 for non-admin roles", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await ownerWithRestaurant();
			const customer = await getE2eApp().seedUser({ role: AuthRole.User });
			const customerAuth = `Bearer ${customer.accessToken}`;

			for (const [method, path] of [
				["get", "/v1/admin/restaurants"],
				["get", `/v1/admin/restaurants/${restaurant.id}`],
				["post", `/v1/admin/restaurants/${restaurant.id}/approve`],
				["post", `/v1/admin/restaurants/${restaurant.id}/reject`],
			] as const) {
				await http[method](path).expect(401);
				await http[method](path).set("Authorization", auth).expect(403);
				await http[method](path).set("Authorization", customerAuth).expect(403);
			}
		});
	});

	describe("GET /v1/admin/restaurants", () => {
		it("lists pending restaurants by default, oldest submission first", async () => {
			const { http } = getE2eApp();
			const first = await ownerWithRestaurant(PENDING, "First");
			const second = await ownerWithRestaurant(PENDING, "Second");
			await ownerWithRestaurant(RestaurantVerificationStatus.Draft, "Draft");
			await getE2eApp()
				.app.get(RestaurantRepository)
				.update(second.user.id, second.restaurant.id, {
					submittedAt: new Date("2026-01-02"),
				});
			await getE2eApp()
				.app.get(RestaurantRepository)
				.update(first.user.id, first.restaurant.id, {
					submittedAt: new Date("2026-01-03"),
				});

			const res = await http
				.get("/v1/admin/restaurants")
				.set("Authorization", await admin())
				.expect(200);

			expect(res.body.total).toBe(2);
			expect(res.body.items.map((r: { name: string }) => r.name)).toEqual([
				"Second",
				"First",
			]);
			expect(res.body.items[0]).toMatchObject({
				verificationStatus: "pending_review",
				ownerId: second.user.id,
			});
		});

		it("filters by status, paginates, and rejects a bad status", async () => {
			const { http } = getE2eApp();
			const auth = await admin();
			await ownerWithRestaurant(RestaurantVerificationStatus.Draft, "A");
			await ownerWithRestaurant(RestaurantVerificationStatus.Draft, "B");

			const drafts = await http
				.get("/v1/admin/restaurants?status=draft&limit=1&offset=1")
				.set("Authorization", auth)
				.expect(200);
			expect(drafts.body.total).toBe(2);
			expect(drafts.body.items).toHaveLength(1);

			await http
				.get("/v1/admin/restaurants?status=maybe")
				.set("Authorization", auth)
				.expect(400);
		});
	});

	describe("GET /v1/admin/restaurants/:id", () => {
		it("returns any restaurant, and 404 for an unknown or malformed id", async () => {
			const { http } = getE2eApp();
			const auth = await admin();
			const { restaurant } = await ownerWithRestaurant(
				RestaurantVerificationStatus.Draft,
			);

			const res = await http
				.get(`/v1/admin/restaurants/${restaurant.id}`)
				.set("Authorization", auth)
				.expect(200);
			expect(res.body).toMatchObject({
				id: restaurant.id,
				verificationStatus: "draft",
			});

			await http
				.get("/v1/admin/restaurants/11111111-1111-4111-8111-111111111111")
				.set("Authorization", auth)
				.expect(404);
			await http
				.get("/v1/admin/restaurants/not-a-uuid")
				.set("Authorization", auth)
				.expect(404);
		});
	});

	describe("approve and reject", () => {
		it("approves a pending restaurant, making it public", async () => {
			const { http } = getE2eApp();
			const { restaurant } = await ownerWithRestaurant();
			await http.get("/v1/restaurants/spice-hub").expect(404);

			const res = await http
				.post(`/v1/admin/restaurants/${restaurant.id}/approve`)
				.set("Authorization", await admin())
				.expect(200);

			expect(res.body.verificationStatus).toBe("approved");
			expect(res.body.reviewedAt).toEqual(expect.any(String));
			await http.get("/v1/restaurants/spice-hub").expect(200);
		});

		it("rejects with a reason the owner sees, then allows a resubmit", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth: ownerAuth } = await ownerWithRestaurant();

			const rejected = await http
				.post(`/v1/admin/restaurants/${restaurant.id}/reject`)
				.set("Authorization", await admin())
				.send({ reason: "  FSSAI number unreadable  " })
				.expect(200);
			expect(rejected.body).toMatchObject({
				verificationStatus: "rejected",
				rejectionReason: "FSSAI number unreadable",
			});
			await http.get("/v1/restaurants/spice-hub").expect(404);

			const mine = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", ownerAuth)
				.expect(200);
			expect(mine.body.items[0]).toMatchObject({
				verificationStatus: "rejected",
				rejectionReason: "FSSAI number unreadable",
			});

			const resubmitted = await http
				.post(`/v1/restaurants/${restaurant.id}/submit`)
				.set("Authorization", ownerAuth)
				.expect(200);
			expect(resubmitted.body.verificationStatus).toBe("pending_review");
		});

		it.each(["", "   ", undefined])(
			"returns 400 when the rejection reason is %p",
			async (reason) => {
				const { http } = getE2eApp();
				const { restaurant } = await ownerWithRestaurant();

				await http
					.post(`/v1/admin/restaurants/${restaurant.id}/reject`)
					.set("Authorization", await admin())
					.send(reason === undefined ? {} : { reason })
					.expect(400);
			},
		);

		it.each([
			RestaurantVerificationStatus.Draft,
			RestaurantVerificationStatus.Approved,
			RestaurantVerificationStatus.Rejected,
		])(
			"returns 409 when approving or rejecting a %s restaurant",
			async (from) => {
				const { http } = getE2eApp();
				const auth = await admin();
				const { restaurant } = await ownerWithRestaurant(from);

				const approve = await http
					.post(`/v1/admin/restaurants/${restaurant.id}/approve`)
					.set("Authorization", auth)
					.expect(409);
				expect(approve.body.code).toBe(
					"RESTAURANT_VERIFICATION_TRANSITION_NOT_ALLOWED",
				);
				await http
					.post(`/v1/admin/restaurants/${restaurant.id}/reject`)
					.set("Authorization", auth)
					.send({ reason: "No" })
					.expect(409);
			},
		);

		it("returns 404 when reviewing an unknown restaurant", async () => {
			await getE2eApp()
				.http.post(
					"/v1/admin/restaurants/11111111-1111-4111-8111-111111111111/approve",
				)
				.set("Authorization", await admin())
				.expect(404);
		});
	});
});
