import { AuthRole } from "@/domain/enums/auth-role";
import { randomUUID } from "node:crypto";
import { getE2eApp } from "../../helpers/app.harness";

describe("POST /v1/carts/merge", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		const restaurant = await getE2eApp().seedRestaurant(user.id);
		const item = await getE2eApp().seedMenuItem(user.id, restaurant.id);
		const other = await getE2eApp().seedMenuItem(user.id, restaurant.id, {
			name: "Second dish",
		});
		return { user, restaurant, item, other };
	}

	async function customer() {
		const user = await getE2eApp().seedUser({ role: AuthRole.User });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	it("creates the cart from guest lines when the server has none", async () => {
		const { http } = getE2eApp();
		const { restaurant, item, other } = await owner();
		const { auth } = await customer();

		const res = await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: restaurant.id,
						items: [
							{ menuItemId: item.id, quantity: 2 },
							{ menuItemId: other.id, quantity: 1 },
						],
					},
				],
			})
			.expect(200);

		expect(res.body.items).toHaveLength(1);
		expect(res.body.items[0].restaurantId).toBe(restaurant.id);
		expect(res.body.items[0].itemCount).toBe(3);
		expect(res.body.items[0].subtotalInPaise).toBe(
			item.priceInPaise * 2 + other.priceInPaise,
		);
	});

	it("lets the guest quantity win and keeps server-only lines", async () => {
		const { http } = getE2eApp();
		const { restaurant, item, other } = await owner();
		const { auth } = await customer();

		await http
			.post(`/v1/carts/${restaurant.id}/items`)
			.set("Authorization", auth)
			.send({ menuItemId: item.id, quantity: 5 })
			.expect(201);
		await http
			.post(`/v1/carts/${restaurant.id}/items`)
			.set("Authorization", auth)
			.send({ menuItemId: other.id, quantity: 4 })
			.expect(201);

		const res = await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: restaurant.id,
						items: [{ menuItemId: item.id, quantity: 2 }],
					},
				],
			})
			.expect(200);

		const lines = res.body.items[0].items as {
			menuItemId: string;
			quantity: number;
		}[];
		expect(lines.find((l) => l.menuItemId === item.id)?.quantity).toBe(2);
		expect(lines.find((l) => l.menuItemId === other.id)?.quantity).toBe(4);
	});

	it("drops unknown menu items and skips unknown restaurants", async () => {
		const { http } = getE2eApp();
		const { restaurant, item } = await owner();
		const { auth } = await customer();

		const res = await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: restaurant.id,
						items: [
							{ menuItemId: item.id, quantity: 1 },
							{ menuItemId: randomUUID(), quantity: 1 },
						],
					},
					{
						restaurantId: randomUUID(),
						items: [{ menuItemId: randomUUID(), quantity: 1 }],
					},
				],
			})
			.expect(200);

		expect(res.body.items).toHaveLength(1);
		expect(res.body.items[0].items).toHaveLength(1);
	});

	it("does not create a cart when every line is dropped", async () => {
		const { http } = getE2eApp();
		const { restaurant } = await owner();
		const { auth } = await customer();

		const res = await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: restaurant.id,
						items: [{ menuItemId: randomUUID(), quantity: 1 }],
					},
				],
			})
			.expect(200);

		expect(res.body.items).toEqual([]);
	});

	it("rejects an invalid body with 400", async () => {
		const { http } = getE2eApp();
		const { auth } = await customer();

		await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: randomUUID(),
						items: [{ menuItemId: randomUUID(), quantity: 21 }],
					},
				],
			})
			.expect(400);
		await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({ carts: [], extra: true })
			.expect(400);
	});

	it("requires a signed-in customer", async () => {
		const { http, authHeader } = getE2eApp();
		const body = { carts: [] };

		await http.post("/v1/carts/merge").send(body).expect(401);
		await http
			.post("/v1/carts/merge")
			.set("Authorization", authHeader(AuthRole.Restaurant))
			.send(body)
			.expect(403);
	});
});
