import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../../helpers/app.harness";

describe("customer order routes", () => {
	async function ownerAndItem() {
		const owner = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		const restaurant = await getE2eApp().seedRestaurant(owner.id);
		const item = await getE2eApp().seedMenuItem(owner.id, restaurant.id);
		return { restaurant, item };
	}

	describe("GET /v1/orders/mine", () => {
		it("lists only the caller's own orders, newest first", async () => {
			const { http } = getE2eApp();
			const { restaurant, item } = await ownerAndItem();
			const user = await getE2eApp().seedUser({ role: AuthRole.User });
			const otherUser = await getE2eApp().seedUser({ role: AuthRole.User });

			await getE2eApp().seedOrder(otherUser.id, restaurant.id, [
				{ menuItemId: item.id, quantity: 1 },
			]);
			const first = await getE2eApp().seedOrder(user.id, restaurant.id, [
				{ menuItemId: item.id, quantity: 1 },
			]);
			const second = await getE2eApp().seedOrder(user.id, restaurant.id, [
				{ menuItemId: item.id, quantity: 2 },
			]);

			const res = await http
				.get("/v1/orders/mine")
				.set("Authorization", `Bearer ${user.accessToken}`)
				.expect(200);

			expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([
				second.id,
				first.id,
			]);
			expect(res.body.items[0].items).toBeUndefined();
			expect(res.body.items[0].restaurantName).toBe(restaurant.name);
		});

		it("returns 401 without a token", async () => {
			await getE2eApp().http.get("/v1/orders/mine").expect(401);
		});
	});

	describe("GET /v1/orders/:id", () => {
		it("returns the order with its items", async () => {
			const { http } = getE2eApp();
			const { restaurant, item } = await ownerAndItem();
			const user = await getE2eApp().seedUser({ role: AuthRole.User });
			const order = await getE2eApp().seedOrder(user.id, restaurant.id, [
				{ menuItemId: item.id, quantity: 1 },
			]);

			const res = await http
				.get(`/v1/orders/${order.id}`)
				.set("Authorization", `Bearer ${user.accessToken}`)
				.expect(200);

			expect(res.body.id).toBe(order.id);
			expect(res.body.items).toHaveLength(1);
		});

		it("returns 404 for another user's order or an unknown id", async () => {
			const { http } = getE2eApp();
			const { restaurant, item } = await ownerAndItem();
			const owner = await getE2eApp().seedUser({ role: AuthRole.User });
			const order = await getE2eApp().seedOrder(owner.id, restaurant.id, [
				{ menuItemId: item.id, quantity: 1 },
			]);
			const stranger = await getE2eApp().seedUser({ role: AuthRole.User });
			const auth = `Bearer ${stranger.accessToken}`;

			await http
				.get(`/v1/orders/${order.id}`)
				.set("Authorization", auth)
				.expect(404);
			await http
				.get("/v1/orders/00000000-0000-0000-0000-000000000000")
				.set("Authorization", auth)
				.expect(404);
		});
	});
});
