import { AuthRole } from "@/domain/enums/auth-role";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("restaurant menu items (/restaurants/:id/menu/items)", () => {
	async function owner() {
		const { seedUser, seedRestaurant } = getE2eApp();
		const user = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(user.id);
		return { user, restaurant, auth: `Bearer ${user.accessToken}` };
	}

	const itemsUrl = (restaurantId: string, itemId?: string) =>
		`/v1/restaurants/${restaurantId}/menu/items${itemId ? `/${itemId}` : ""}`;

	function itemBody(overrides: object = {}) {
		return {
			name: "Paneer Tikka",
			category: "Starters",
			priceInPaise: 24900,
			foodType: "veg",
			...overrides,
		};
	}

	async function create(auth: string, restaurantId: string, overrides = {}) {
		const res = await getE2eApp()
			.http.post(itemsUrl(restaurantId))
			.set("Authorization", auth)
			.send(itemBody(overrides))
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
			const { http } = getE2eApp();
			await http.get(itemsUrl(MISSING_ID)).expect(401);
			await http.post(itemsUrl(MISSING_ID)).send(itemBody()).expect(401);
		});

		it.each([AuthRole.User, AuthRole.Guest])(
			"returns 403 for the %s role on every route",
			async (role) => {
				const { http, authHeader } = getE2eApp();
				const h = authHeader(role);
				const one = itemsUrl(MISSING_ID, MISSING_ID);
				await http
					.get(itemsUrl(MISSING_ID))
					.set("Authorization", h)
					.expect(403);
				await http
					.post(itemsUrl(MISSING_ID))
					.set("Authorization", h)
					.send(itemBody())
					.expect(403);
				await http.get(one).set("Authorization", h).expect(403);
				await http
					.patch(one)
					.set("Authorization", h)
					.send({ name: "x" })
					.expect(403);
				await http
					.patch(`${one}/availability`)
					.set("Authorization", h)
					.send({ isAvailable: false })
					.expect(403);
				await http.delete(one).set("Authorization", h).expect(403);
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

		it("accepts a description and image URL, defaulting both to null", async () => {
			const { restaurant, auth } = await owner();
			const withBrand = await create(auth, restaurant.id, {
				name: "Photographed Dish",
				description: "Rich and creamy.",
				imageUrl: "https://cdn.example.com/dish.jpg",
			});
			expect(withBrand).toMatchObject({
				description: "Rich and creamy.",
				imageUrl: "https://cdn.example.com/dish.jpg",
			});
			const bare = await create(auth, restaurant.id, { name: "Bare Dish" });
			expect(bare).toMatchObject({ description: null, imageUrl: null });
		});

		it("copies the restaurant's location onto the item", async () => {
			const { user, restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			const stored = await getE2eApp()
				.app.get(MenuItemRepository)
				.findInRestaurant(user.id, restaurant.id, item.id);
			expect(stored?.location).toEqual(restaurant.location);
		});

		it("returns 404 for another owner's restaurant, an unknown one and a malformed id", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			for (const restaurantId of [a.restaurant.id, MISSING_ID, "abc"]) {
				await http
					.post(itemsUrl(restaurantId))
					.set("Authorization", b.auth)
					.send(itemBody())
					.expect(404);
			}
			const list = await http
				.get(itemsUrl(a.restaurant.id))
				.set("Authorization", a.auth);
			expect(list.body.total).toBe(0);
		});

		it.each([
			["fractional price", { priceInPaise: 12.5 }],
			["negative price", { priceInPaise: -1 }],
			["string price", { priceInPaise: "100" }],
			["legacy price field", { priceInPaise: undefined, price: 100 }],
			["bad food type", { foodType: "vegan" }],
			[
				"restaurantId in the body (it comes from the path)",
				{ restaurantId: MISSING_ID },
			],
			["empty name", { name: "" }],
			["unknown field", { extra: 1 }],
			["malformed imageUrl", { imageUrl: "not-a-url" }],
		])("rejects %s with 400", async (_label, overrides) => {
			const { restaurant, auth } = await owner();
			await getE2eApp()
				.http.post(itemsUrl(restaurant.id))
				.set("Authorization", auth)
				.send(itemBody(overrides))
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
		it("lists sorted by category then name, with filters and paging", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			await create(auth, restaurant.id, { name: "Zeta", category: "Mains" });
			await create(auth, restaurant.id, { name: "Alpha", category: "Mains" });
			await create(auth, restaurant.id, {
				name: "Soup",
				category: "Starters",
				isAvailable: false,
			});
			const url = itemsUrl(restaurant.id);
			const names = (body: { items: { name: string }[] }) =>
				body.items.map((i) => i.name);

			const all = await http.get(url).set("Authorization", auth).expect(200);
			expect(all.body.total).toBe(3);
			expect(names(all.body)).toEqual(["Alpha", "Zeta", "Soup"]);
			expect(
				(await http.get(`${url}?category=Starters`).set("Authorization", auth))
					.body.total,
			).toBe(1);
			expect(
				names(
					(
						await http
							.get(`${url}?isAvailable=false`)
							.set("Authorization", auth)
					).body,
				),
			).toEqual(["Soup"]);
			expect(
				names(
					(await http.get(`${url}?limit=1&offset=2`).set("Authorization", auth))
						.body,
				),
			).toEqual(["Soup"]);
		});

		it("lists only the given restaurant's items, not the owner's other restaurant", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const { user, restaurant, auth } = await owner();
			const second = await seedRestaurant(user.id, { name: "Second Place" });
			await create(auth, restaurant.id, { name: "First dish" });
			await create(auth, second.id, { name: "Second dish" });
			const res = await http
				.get(itemsUrl(second.id))
				.set("Authorization", auth)
				.expect(200);
			expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
				"Second dish",
			]);
		});

		it("returns 404 when listing another owner's or an unknown restaurant", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			await create(a.auth, a.restaurant.id);
			for (const restaurantId of [a.restaurant.id, MISSING_ID, "abc"]) {
				await http
					.get(itemsUrl(restaurantId))
					.set("Authorization", b.auth)
					.expect(404);
			}
		});

		it.each(["limit=0", "limit=101", "offset=-1", "isAvailable=maybe"])(
			"rejects invalid list query %s with 400",
			async (qs) => {
				const { restaurant, auth } = await owner();
				await getE2eApp()
					.http.get(`${itemsUrl(restaurant.id)}?${qs}`)
					.set("Authorization", auth)
					.expect(400);
			},
		);

		it("gets one item; another owner, a malformed id, an unknown id and the wrong restaurant are 404", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const otherRestaurant = await seedRestaurant(a.user.id, {
				name: "Other Place",
			});
			const item = await create(a.auth, a.restaurant.id);
			await http
				.get(itemsUrl(a.restaurant.id, item.id))
				.set("Authorization", a.auth)
				.expect(200);
			const notFound: [string, string, string][] = [
				[a.restaurant.id, item.id, b.auth],
				[a.restaurant.id, "not-an-id", a.auth],
				[a.restaurant.id, MISSING_ID, a.auth],
				[otherRestaurant.id, item.id, a.auth],
				["abc", item.id, a.auth],
			];
			for (const [restaurantId, itemId, auth] of notFound) {
				await http
					.get(itemsUrl(restaurantId, itemId))
					.set("Authorization", auth)
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
				.patch(itemsUrl(restaurant.id, item.id))
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
			["malformed imageUrl", { imageUrl: "not-a-url" }],
		])("rejects %s with 400", async (_label, body) => {
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			await getE2eApp()
				.http.patch(itemsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("sets and clears the description and image", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id, {
				description: "Original",
				imageUrl: "https://cdn.example.com/dish.jpg",
			});
			const res = await http
				.patch(itemsUrl(restaurant.id, item.id))
				.set("Authorization", auth)
				.send({ description: null })
				.expect(200);
			expect(res.body).toMatchObject({
				description: null,
				imageUrl: "https://cdn.example.com/dish.jpg",
			});
		});

		it("toggles availability and rejects a non-boolean", async () => {
			const { http } = getE2eApp();
			const { restaurant, auth } = await owner();
			const item = await create(auth, restaurant.id);
			const off = await http
				.patch(`${itemsUrl(restaurant.id, item.id)}/availability`)
				.set("Authorization", auth)
				.send({ isAvailable: false })
				.expect(200);
			expect(off.body.isAvailable).toBe(false);
			await http
				.patch(`${itemsUrl(restaurant.id, item.id)}/availability`)
				.set("Authorization", auth)
				.send({ isAvailable: "no" })
				.expect(400);
		});

		it("returns 404 for another owner or the wrong restaurant on update, availability and delete", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const sibling = await seedRestaurant(a.user.id, { name: "Sibling" });
			const item = await create(a.auth, a.restaurant.id);
			const attempts: [string, string][] = [
				[a.restaurant.id, b.auth],
				[sibling.id, a.auth],
			];
			for (const [restaurantId, auth] of attempts) {
				const url = itemsUrl(restaurantId, item.id);
				await http
					.patch(url)
					.set("Authorization", auth)
					.send({ name: "Hijacked" })
					.expect(404);
				await http
					.patch(`${url}/availability`)
					.set("Authorization", auth)
					.send({ isAvailable: false })
					.expect(404);
				await http.delete(url).set("Authorization", auth).expect(404);
			}
			const still = await http
				.get(itemsUrl(a.restaurant.id, item.id))
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
			const url = itemsUrl(restaurant.id, item.id);
			await http.delete(url).set("Authorization", auth).expect(204);
			await http.get(url).set("Authorization", auth).expect(404);
			await http.delete(url).set("Authorization", auth).expect(404);
		});
	});
});
