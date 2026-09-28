import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantService } from "@/services/restaurant.service";
import { getE2eApp } from "../../helpers/app.harness";

const DELIVERY_ADDRESS = {
	line1: "221B Baker Street",
	city: "Bengaluru",
	state: "Karnataka",
	zipcode: "560002",
};

describe("POST /v1/orders", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		const restaurant = await getE2eApp().seedRestaurant(user.id);
		const item = await getE2eApp().seedMenuItem(user.id, restaurant.id);
		return { user, restaurant, item };
	}

	async function customer() {
		const user = await getE2eApp().seedUser({ role: AuthRole.User });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	it("places an order, computing the total server-side", async () => {
		const { http } = getE2eApp();
		const { restaurant, item } = await owner();
		const { auth } = await customer();

		const res = await http
			.post("/v1/orders")
			.set("Authorization", auth)
			.send({
				restaurantId: restaurant.id,
				items: [{ menuItemId: item.id, quantity: 2 }],
				deliveryAddress: DELIVERY_ADDRESS,
			})
			.expect(201);

		expect(res.body.status).toBe("placed");
		expect(res.body.totalInPaise).toBe(item.priceInPaise * 2);
		expect(res.body.items).toHaveLength(1);
		expect(res.body.items[0]).toMatchObject({
			menuItemId: item.id,
			nameSnapshot: item.name,
			priceInPaiseSnapshot: item.priceInPaise,
			quantity: 2,
		});
		expect(res.body.deliveryAddress).toMatchObject(DELIVERY_ADDRESS);
		expect(res.body.ownerId).toBeUndefined();
		expect(res.body.userId).toBeUndefined();
	});

	it("merges duplicate item lines by summing quantity", async () => {
		const { http } = getE2eApp();
		const { restaurant, item } = await owner();
		const { auth } = await customer();

		const res = await http
			.post("/v1/orders")
			.set("Authorization", auth)
			.send({
				restaurantId: restaurant.id,
				items: [
					{ menuItemId: item.id, quantity: 1 },
					{ menuItemId: item.id, quantity: 3 },
				],
				deliveryAddress: DELIVERY_ADDRESS,
			})
			.expect(201);

		expect(res.body.items).toHaveLength(1);
		expect(res.body.items[0].quantity).toBe(4);
	});

	it("returns 409 when the restaurant is offline", async () => {
		const { http, app } = getE2eApp();
		const { user: ownerUser, restaurant, item } = await owner();
		await app
			.get(RestaurantService)
			.setStatus(ownerUser.id, restaurant.id, RestaurantStatus.Offline);
		const { auth } = await customer();

		await http
			.post("/v1/orders")
			.set("Authorization", auth)
			.send({
				restaurantId: restaurant.id,
				items: [{ menuItemId: item.id, quantity: 1 }],
				deliveryAddress: DELIVERY_ADDRESS,
			})
			.expect(409);
	});

	it("returns 409 when an item is sold out", async () => {
		const { user, restaurant } = await owner();
		const soldOutItem = await getE2eApp().seedMenuItem(user.id, restaurant.id, {
			isAvailable: false,
		});
		const { auth } = await customer();

		await getE2eApp()
			.http.post("/v1/orders")
			.set("Authorization", auth)
			.send({
				restaurantId: restaurant.id,
				items: [{ menuItemId: soldOutItem.id, quantity: 1 }],
				deliveryAddress: DELIVERY_ADDRESS,
			})
			.expect(409);
	});

	it("returns 400 when an item does not belong to the restaurant", async () => {
		const { http, seedUser, seedRestaurant, seedMenuItem } = getE2eApp();
		const { restaurant } = await owner();
		const otherOwner = await seedUser({ role: AuthRole.Restaurant });
		const otherRestaurant = await seedRestaurant(otherOwner.id);
		const foreignItem = await seedMenuItem(otherOwner.id, otherRestaurant.id);
		const { auth } = await customer();

		await http
			.post("/v1/orders")
			.set("Authorization", auth)
			.send({
				restaurantId: restaurant.id,
				items: [{ menuItemId: foreignItem.id, quantity: 1 }],
				deliveryAddress: DELIVERY_ADDRESS,
			})
			.expect(400);
	});

	it("returns 403 for non-user roles and 401 without a token", async () => {
		const { http, authHeader } = getE2eApp();
		const { restaurant, item } = await owner();
		const body = {
			restaurantId: restaurant.id,
			items: [{ menuItemId: item.id, quantity: 1 }],
			deliveryAddress: DELIVERY_ADDRESS,
		};

		await http
			.post("/v1/orders")
			.set("Authorization", authHeader(AuthRole.Restaurant))
			.send(body)
			.expect(403);
		await http.post("/v1/orders").send(body).expect(401);
	});
});
