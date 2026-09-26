import { AuthRole } from "@/domain/enums/auth-role";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("owner menu items", () => {
	async function owner() {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(user.id);
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	function itemBody(restaurantId: string, overrides: object = {}) {
		return {
			restaurantId,
			name: "Paneer Tikka",
			category: "Starters",
			priceInPaise: 24900,
			foodType: "veg",
			...overrides,
		};
	}

	async function create(auth: string, restaurantId: string, overrides = {}) {
		const res = await getE2eApp()
			.http.post("/v1/owner/menu-items")
			.set("Authorization", auth)
			.send(itemBody(restaurantId, overrides))
			.expect(201);
		return res.body as {
			id: string;
			restaurantId: string;
			name: string;
			priceInPaise: number;
			isAvailable: boolean;
		};
	}

	describe("access", () => {
		it("returns 401 without a token", async () => {
			await getE2eApp().http.get("/v1/owner/menu-items").expect(401);
		});

		it.each([AuthRole.User, AuthRole.Guest])(
			"returns 403 for the %s role",
			async (role) => {
				const { http, authHeader } = getE2eApp();
				const h = authHeader(role);
				await http
					.get("/v1/owner/menu-items")
					.set("Authorization", h)
					.expect(403);
				await http
					.post("/v1/owner/menu-items")
					.set("Authorization", h)
					.send(itemBody(MISSING_ID))
					.expect(403);
			},
		);
	});

	describe("create", () => {
		it("creates an item, defaulting to available, without internals", async () => {
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			expect(item).toMatchObject({
				restaurantId: restaurant.id,
				name: "Paneer Tikka",
				category: "Starters",
				priceInPaise: 24900,
				foodType: "veg",
				isAvailable: true,
			});
			expect(item).not.toHaveProperty("ownerId");
			expect(item).not.toHaveProperty("location");
		});

		it("copies the restaurant's location onto the item", async () => {
			const { user, restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			const stored = await getE2eApp()
				.app.get(MenuItemRepository)
				.findById(user.id, item.id);
			expect(stored?.location).toEqual(restaurant.location);
		});

		it("returns 404 for another owner's restaurant and for an unknown one", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			for (const restaurantId of [a.restaurant.id, MISSING_ID]) {
				await http
					.post("/v1/owner/menu-items")
					.set("Authorization", b.auth)
					.send(itemBody(restaurantId))
					.expect(404);
			}
			const list = await http
				.get("/v1/owner/menu-items")
				.set("Authorization", a.auth);
			expect(list.body.total).toBe(0);
		});

		it.each([
			["fractional price", { priceInPaise: 12.5 }],
			["negative price", { priceInPaise: -1 }],
			["string price", { priceInPaise: "100" }],
			["legacy price field", { priceInPaise: undefined, price: 100 }],
			["bad food type", { foodType: "vegan" }],
			["malformed restaurant id", { restaurantId: "abc" }],
			["empty name", { name: "" }],
			["unknown field", { extra: 1 }],
		])("rejects %s with 400", async (_label, overrides) => {
			const { restaurant, auth } = await owner();
			await getE2eApp()
				.http.post("/v1/owner/menu-items")
				.set("Authorization", auth)
				.send(itemBody(restaurant.id, overrides))
				.expect(400);
		});

		it("accepts a free item (price 0) and all three food types", async () => {
			const { restaurant, auth } = await owner();
			for (const foodType of ["veg", "egg", "non-veg"]) {
				const item = await create(auth, restaurant.id, {
					name: `Item ${foodType}`,
					foodType,
					priceInPaise: 0,
				});
				expect(item.priceInPaise).toBe(0);
			}
		});
	});

	describe("list and get", () => {
		it("lists owner-scoped, sorted by category then name, with filters and paging", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			await create(auth, restaurant.id, { name: "Zeta", category: "Mains" });
			await create(auth, restaurant.id, { name: "Alpha", category: "Mains" });
			await create(auth, restaurant.id, {
				name: "Soup",
				category: "Starters",
				isAvailable: false,
			});

			const all = await http
				.get("/v1/owner/menu-items")
				.set("Authorization", auth)
				.expect(200);
			expect(all.body.total).toBe(3);
			expect(all.body.items.map((i: { name: string }) => i.name)).toEqual([
				"Alpha",
				"Zeta",
				"Soup",
			]);

			const cat = await http
				.get("/v1/owner/menu-items?category=Starters")
				.set("Authorization", auth);
			expect(cat.body.total).toBe(1);
			const off = await http
				.get("/v1/owner/menu-items?isAvailable=false")
				.set("Authorization", auth);
			expect(off.body.items.map((i: { name: string }) => i.name)).toEqual([
				"Soup",
			]);
			const byRestaurant = await http
				.get(`/v1/owner/menu-items?restaurantId=${restaurant.id}`)
				.set("Authorization", auth);
			expect(byRestaurant.body.total).toBe(3);
			const page = await http
				.get("/v1/owner/menu-items?limit=1&offset=2")
				.set("Authorization", auth);
			expect(page.body.items.map((i: { name: string }) => i.name)).toEqual([
				"Soup",
			]);
		});

		it("does not list another owner's items", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			await create(a.auth, a.restaurant.id);
			const res = await http
				.get("/v1/owner/menu-items")
				.set("Authorization", b.auth);
			expect(res.body).toEqual({ items: [], total: 0 });
			const filtered = await http
				.get(`/v1/owner/menu-items?restaurantId=${a.restaurant.id}`)
				.set("Authorization", b.auth);
			expect(filtered.body).toEqual({ items: [], total: 0 });
		});

		it.each([
			"limit=0",
			"limit=101",
			"offset=-1",
			"isAvailable=maybe",
			"restaurantId=abc",
		])("rejects invalid list query %s with 400", async (qs) => {
			const { auth } = await owner();
			await getE2eApp()
				.http.get(`/v1/owner/menu-items?${qs}`)
				.set("Authorization", auth)
				.expect(400);
		});

		it("gets one item; another owner, a malformed id and an unknown id are 404", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const item = await create(a.auth, a.restaurant.id);
			await http
				.get(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", a.auth)
				.expect(200);
			for (const id of [item.id, "not-an-id", MISSING_ID]) {
				await http
					.get(`/v1/owner/menu-items/${id}`)
					.set("Authorization", b.auth)
					.expect(404);
			}
		});
	});

	describe("update, availability, delete", () => {
		it("updates fields", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			const res = await http
				.patch(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", auth)
				.send({
					name: "Paneer Tikka Masala",
					priceInPaise: 27900,
					foodType: "veg",
				})
				.expect(200);
			expect(res.body).toMatchObject({
				name: "Paneer Tikka Masala",
				priceInPaise: 27900,
			});
		});

		it.each([
			["empty body", {}],
			["restaurantId (cannot move)", { restaurantId: MISSING_ID }],
			["fractional price", { priceInPaise: 1.5 }],
			["bad food type", { foodType: "x" }],
		])("rejects %s with 400", async (_label, body) => {
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			await getE2eApp()
				.http.patch(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("toggles availability", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			const off = await http
				.patch(`/v1/owner/menu-items/${item.id}/availability`)
				.set("Authorization", auth)
				.send({ isAvailable: false })
				.expect(200);
			expect(off.body.isAvailable).toBe(false);
			await http
				.patch(`/v1/owner/menu-items/${item.id}/availability`)
				.set("Authorization", auth)
				.send({ isAvailable: "no" })
				.expect(400);
		});

		it("returns 404 for another owner on update, availability and delete", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const item = await create(a.auth, a.restaurant.id);
			await http
				.patch(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", b.auth)
				.send({ name: "Hijacked" })
				.expect(404);
			await http
				.patch(`/v1/owner/menu-items/${item.id}/availability`)
				.set("Authorization", b.auth)
				.send({ isAvailable: false })
				.expect(404);
			await http
				.delete(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", b.auth)
				.expect(404);
			const still = await http
				.get(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", a.auth);
			expect(still.body).toMatchObject({
				name: "Paneer Tikka",
				isAvailable: true,
			});
		});

		it("deletes an item", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			await http
				.delete(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", auth)
				.expect(204);
			await http
				.get(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", auth)
				.expect(404);
			await http
				.delete(`/v1/owner/menu-items/${item.id}`)
				.set("Authorization", auth)
				.expect(404);
		});
	});
});
