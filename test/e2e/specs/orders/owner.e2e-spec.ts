import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../../helpers/app.harness";

describe("owner order routes", () => {
	async function setup() {
		const owner = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		const restaurant = await getE2eApp().seedRestaurant(owner.id);
		const item = await getE2eApp().seedMenuItem(owner.id, restaurant.id);
		const customer = await getE2eApp().seedUser({ role: AuthRole.User });
		const order = await getE2eApp().seedOrder(customer.id, restaurant.id, [
			{ menuItemId: item.id, quantity: 1 },
		]);
		return { owner, restaurant, order, auth: `Bearer ${owner.accessToken}` };
	}

	describe("GET /v1/restaurants/:id/orders", () => {
		it("lists orders for the caller's restaurant", async () => {
			const { http } = getE2eApp();
			const { restaurant, order, auth } = await setup();

			const res = await http
				.get(`/v1/restaurants/${restaurant.id}/orders`)
				.set("Authorization", auth)
				.expect(200);

			expect(res.body.items).toHaveLength(1);
			expect(res.body.items[0].id).toBe(order.id);
		});

		it("returns 404 for another owner's restaurant", async () => {
			const { http, seedUser } = getE2eApp();
			const { restaurant } = await setup();
			const stranger = await seedUser({ role: AuthRole.Restaurant });

			await http
				.get(`/v1/restaurants/${restaurant.id}/orders`)
				.set("Authorization", `Bearer ${stranger.accessToken}`)
				.expect(404);
		});
	});

	describe("PATCH /v1/restaurants/:id/orders/:orderId/status", () => {
		it("advances the order through a valid transition", async () => {
			const { http } = getE2eApp();
			const { restaurant, order, auth } = await setup();

			const res = await http
				.patch(`/v1/restaurants/${restaurant.id}/orders/${order.id}/status`)
				.set("Authorization", auth)
				.send({ status: "accepted" })
				.expect(200);

			expect(res.body.status).toBe("accepted");
		});

		it("cancels a placed order", async () => {
			const { http } = getE2eApp();
			const { restaurant, order, auth } = await setup();

			const res = await http
				.patch(`/v1/restaurants/${restaurant.id}/orders/${order.id}/status`)
				.set("Authorization", auth)
				.send({ status: "cancelled" })
				.expect(200);

			expect(res.body.status).toBe("cancelled");
		});

		it("returns 409 for an invalid transition", async () => {
			const { http } = getE2eApp();
			const { restaurant, order, auth } = await setup();

			await http
				.patch(`/v1/restaurants/${restaurant.id}/orders/${order.id}/status`)
				.set("Authorization", auth)
				.send({ status: "delivered" })
				.expect(409);
		});

		it("returns 404 when the order does not belong to the restaurant", async () => {
			const { http, seedUser, seedRestaurant, seedMenuItem } = getE2eApp();
			const { restaurant, order } = await setup();
			const otherOwner = await seedUser({ role: AuthRole.Restaurant });
			const otherRestaurant = await seedRestaurant(otherOwner.id);
			await seedMenuItem(otherOwner.id, otherRestaurant.id);

			await http
				.patch(
					`/v1/restaurants/${otherRestaurant.id}/orders/${order.id}/status`,
				)
				.set("Authorization", `Bearer ${otherOwner.accessToken}`)
				.send({ status: "accepted" })
				.expect(404);

			await http
				.patch(
					`/v1/restaurants/${restaurant.id}/orders/00000000-0000-0000-0000-000000000000/status`,
				)
				.set("Authorization", `Bearer ${otherOwner.accessToken}`)
				.send({ status: "accepted" })
				.expect(404);
		});
	});
});
