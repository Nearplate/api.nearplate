import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import { getE2eApp } from "../../helpers/app.harness";

describe("carts and unapproved restaurants", () => {
	async function setup(verificationStatus: RestaurantVerificationStatus) {
		const { seedUser, seedRestaurant, seedMenuItem } = getE2eApp();
		const owner = await seedUser({ role: AuthRole.Restaurant });
		const restaurant = await seedRestaurant(
			owner.id,
			{},
			{ verificationStatus, status: RestaurantStatus.Online },
		);
		const item = await seedMenuItem(owner.id, restaurant.id);
		const customer = await seedUser({ role: AuthRole.User });
		return { restaurant, item, auth: `Bearer ${customer.accessToken}` };
	}

	it.each([
		RestaurantVerificationStatus.Draft,
		RestaurantVerificationStatus.PendingReview,
	])(
		"returns 404 when adding to the cart of a %s restaurant",
		async (verificationStatus) => {
			const { http } = getE2eApp();
			const { restaurant, item, auth } = await setup(verificationStatus);

			await http
				.post(`/v1/carts/${restaurant.id}/items`)
				.set("Authorization", auth)
				.send({ menuItemId: item.id, quantity: 1 })
				.expect(404);
		},
	);

	it("skips an unapproved restaurant when merging a guest cart", async () => {
		const { http } = getE2eApp();
		const { restaurant, item, auth } = await setup(
			RestaurantVerificationStatus.PendingReview,
		);

		const res = await http
			.post("/v1/carts/merge")
			.set("Authorization", auth)
			.send({
				carts: [
					{
						restaurantId: restaurant.id,
						items: [{ menuItemId: item.id, quantity: 1 }],
					},
				],
			})
			.expect(200);

		expect(res.body.items).toHaveLength(0);
	});
});
