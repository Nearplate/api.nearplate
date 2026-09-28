import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../../helpers/app.harness";

describe("GET /v1/restaurants/:id/qr-code", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	it("returns a QR code that encodes the public menu URL", async () => {
		const { http, seedRestaurant } = getE2eApp();
		const { user, auth } = await owner();
		const restaurant = await seedRestaurant(user.id);

		const res = await http
			.get(`/v1/restaurants/${restaurant.id}/qr-code`)
			.set("Authorization", auth)
			.expect(200);

		expect(res.body.url).toBe(`http://localhost:3400/r/${restaurant.slug}`);
		expect(res.body.pngDataUrl).toMatch(/^data:image\/png;base64,/);
		expect(res.body.svgDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
	});

	it("returns 404 for another owner's restaurant or an unknown id", async () => {
		const { http, seedRestaurant } = getE2eApp();
		const a = await owner();
		const b = await owner();
		const restaurant = await seedRestaurant(a.user.id);

		await http
			.get(`/v1/restaurants/${restaurant.id}/qr-code`)
			.set("Authorization", b.auth)
			.expect(404);
		await http
			.get("/v1/restaurants/not-an-id/qr-code")
			.set("Authorization", a.auth)
			.expect(404);
	});

	it("returns 403 for a non-restaurant role and 401 without a token", async () => {
		const { http, seedRestaurant, authHeader } = getE2eApp();
		const { user } = await owner();
		const restaurant = await seedRestaurant(user.id);

		await http
			.get(`/v1/restaurants/${restaurant.id}/qr-code`)
			.set("Authorization", authHeader(AuthRole.User))
			.expect(403);
		await http.get(`/v1/restaurants/${restaurant.id}/qr-code`).expect(401);
	});
});
