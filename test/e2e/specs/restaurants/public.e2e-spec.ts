import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantService } from "@/services/restaurant.service";
import { getE2eApp } from "../../helpers/app.harness";

/** Central Bengaluru. */
const CENTER = [77.5946, 12.9716];
/** ~2.2 km north of CENTER. */
const NEAR = [77.5946, 12.9916];
/** ~55 km north of CENTER. */
const FAR = [77.5946, 13.4716];

describe("public restaurants", () => {
	async function owner() {
		return getE2eApp().seedUser({ role: AuthRole.Restaurant });
	}

	describe("GET /v1/restaurants/:slug", () => {
		it("returns a restaurant without authentication and without internals", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const user = await owner();
			await seedRestaurant(user.id);
			const res = await http.get("/v1/restaurants/spice-hub").expect(200);
			expect(res.body).toMatchObject({
				slug: "spice-hub",
				name: "Spice Hub",
				status: "online",
				coordinates: CENTER,
				address: { city: "Bengaluru" },
			});
			expect(res.body).not.toHaveProperty("ownerId");
		});

		it("still returns an offline restaurant so clients can show it as closed", async () => {
			const { http, seedRestaurant, app } = getE2eApp();
			const user = await owner();
			const r = await seedRestaurant(user.id);
			await app
				.get(RestaurantService)
				.setStatus(user.id, r.id, RestaurantStatus.Offline);
			const res = await http.get("/v1/restaurants/spice-hub").expect(200);
			expect(res.body.status).toBe("offline");
		});

		it("returns 404 for an unknown slug", async () => {
			await getE2eApp().http.get("/v1/restaurants/nope").expect(404);
		});

		it("includes description, logo and banner (or null if unset)", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const user = await owner();
			await seedRestaurant(user.id, {
				description: "Home-style thalis.",
				logoUrl: "https://cdn.example.com/logo.png",
				bannerUrl: null,
			});
			const res = await http.get("/v1/restaurants/spice-hub").expect(200);
			expect(res.body).toMatchObject({
				description: "Home-style thalis.",
				logoUrl: "https://cdn.example.com/logo.png",
				bannerUrl: null,
			});
		});
	});

	describe("GET /v1/restaurants/:slug/menu", () => {
		it("returns the menu sorted by category then name, including sold-out items", async () => {
			const { http, seedRestaurant, seedMenuItem } = getE2eApp();
			const user = await owner();
			const r = await seedRestaurant(user.id);
			await seedMenuItem(user.id, r.id, { name: "Zeta", category: "Mains" });
			await seedMenuItem(user.id, r.id, { name: "Alpha", category: "Mains" });
			await seedMenuItem(user.id, r.id, {
				name: "Soup",
				category: "Desserts",
				isAvailable: false,
			});
			const res = await http.get("/v1/restaurants/spice-hub/menu").expect(200);
			expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
				"Soup",
				"Alpha",
				"Zeta",
			]);
			expect(res.body.items[0]).toMatchObject({
				isAvailable: false,
				priceInPaise: 24900,
			});
			expect(res.body.items[0]).not.toHaveProperty("ownerId");
		});

		it("includes an item's description and image (or null if unset)", async () => {
			const { http, seedRestaurant, seedMenuItem } = getE2eApp();
			const user = await owner();
			const r = await seedRestaurant(user.id);
			await seedMenuItem(user.id, r.id, {
				name: "Paneer Tikka",
				description: "Grilled cottage cheese.",
				imageUrl: "https://cdn.example.com/paneer.jpg",
			});
			const res = await http.get("/v1/restaurants/spice-hub/menu").expect(200);
			expect(res.body.items[0]).toMatchObject({
				description: "Grilled cottage cheese.",
				imageUrl: "https://cdn.example.com/paneer.jpg",
			});
		});

		it("does not leak another restaurant's items", async () => {
			const { http, seedRestaurant, seedMenuItem } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const ra = await seedRestaurant(a.id, { name: "Alpha Diner" });
			const rb = await seedRestaurant(b.id, { name: "Beta Diner" });
			await seedMenuItem(a.id, ra.id, { name: "A dish" });
			await seedMenuItem(b.id, rb.id, { name: "B dish" });
			const res = await http.get("/v1/restaurants/beta-diner/menu").expect(200);
			expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
				"B dish",
			]);
		});

		it("returns an empty menu for a restaurant with none, and 404 for an unknown slug", async () => {
			const { http, seedRestaurant } = getE2eApp();
			const user = await owner();
			await seedRestaurant(user.id);
			const res = await http.get("/v1/restaurants/spice-hub/menu").expect(200);
			expect(res.body).toEqual({ items: [] });
			await http.get("/v1/restaurants/nope/menu").expect(404);
		});
	});

	describe("GET /v1/restaurants/nearby", () => {
		async function seedThree() {
			const { seedRestaurant } = getE2eApp();
			const user = await owner();
			await seedRestaurant(user.id, {
				name: "Here",
				coordinates: CENTER as [number, number],
			});
			await seedRestaurant(user.id, {
				name: "Close By",
				coordinates: NEAR as [number, number],
				isPureVeg: true,
				cuisines: ["south indian"],
			});
			await seedRestaurant(user.id, {
				name: "Far Away",
				coordinates: FAR as [number, number],
			});
			return user;
		}

		const nearby = (qs: string) =>
			getE2eApp().http.get(`/v1/restaurants/nearby?${qs}`);
		const at = `lng=${CENTER[0]}&lat=${CENTER[1]}`;
		const names = (body: { items: { name: string }[] }) =>
			body.items.map((i) => i.name);

		it("orders by distance and defaults to a 5 km radius", async () => {
			await seedThree();
			const res = await nearby(at).expect(200);
			expect(names(res.body)).toEqual(["Here", "Close By"]);
			expect(res.body.items[0].distanceMeters).toBe(0);
			expect(Number.isInteger(res.body.items[1].distanceMeters)).toBe(true);
			expect(res.body.items[1].distanceMeters).toBeGreaterThan(2000);
			expect(res.body.items[1].distanceMeters).toBeLessThan(2400);
		});

		it("respects radiusKm", async () => {
			await seedThree();
			expect(
				names((await nearby(`${at}&radiusKm=1`).expect(200)).body),
			).toEqual(["Here"]);
			expect(
				names((await nearby(`${at}&radiusKm=25`).expect(200)).body),
			).toEqual(["Here", "Close By"]);
		});

		it("excludes offline restaurants", async () => {
			const user = await seedThree();
			const { app } = getE2eApp();
			const svc = app.get(RestaurantService);
			const list = await svc.list(user.id, { limit: 10, offset: 0 });
			const here = list.items.find((r) => r.name === "Here");
			await svc.setStatus(user.id, here!.id, RestaurantStatus.Offline);
			expect(names((await nearby(at).expect(200)).body)).toEqual(["Close By"]);
		});

		it("filters by isPureVeg and by cuisine (case-insensitive)", async () => {
			await seedThree();
			expect(
				names((await nearby(`${at}&isPureVeg=true`).expect(200)).body),
			).toEqual(["Close By"]);
			expect(
				names((await nearby(`${at}&isPureVeg=false`).expect(200)).body),
			).toEqual(["Here"]);
			expect(
				names((await nearby(`${at}&cuisine=South%20Indian`).expect(200)).body),
			).toEqual(["Close By"]);
			expect(
				names((await nearby(`${at}&cuisine=thai`).expect(200)).body),
			).toEqual([]);
		});

		it("limits the number of results", async () => {
			await seedThree();
			expect(names((await nearby(`${at}&limit=1`).expect(200)).body)).toEqual([
				"Here",
			]);
		});

		it("returns an empty list when nothing is in range", async () => {
			await seedThree();
			const res = await nearby("lng=0&lat=0").expect(200);
			expect(res.body).toEqual({ items: [] });
		});

		it.each([
			["missing lng", "lat=12"],
			["missing lat", "lng=77"],
			["empty lng (must not become 0)", "lng=&lat=12"],
			["longitude out of range", "lng=181&lat=12"],
			["latitude out of range", "lng=77&lat=91"],
			["non-numeric", "lng=abc&lat=12"],
			["zero radius", `${at}&radiusKm=0`],
			["radius over the cap", `${at}&radiusKm=26`],
			["zero limit", `${at}&limit=0`],
			["limit over the cap", `${at}&limit=51`],
			["bad isPureVeg", `${at}&isPureVeg=maybe`],
		])("rejects %s with 400", async (_label, qs) => {
			await nearby(qs).expect(400);
		});

		it("is not mistaken for a slug", async () => {
			const res = await nearby(at);
			expect(res.status).toBe(200);
		});
	});

	describe("routing", () => {
		it("keeps /health and / unprefixed and prefixes everything else", async () => {
			const { http } = getE2eApp();
			await http.get("/health").expect(200);
			await http.get("/").expect(200);
			await http.get("/v1/health").expect(404);
			await http.get("/restaurants/nearby").expect(404);
			await http.get("/auth/guest").expect(404);
			await http.get("/v1/owner/restaurants").expect(404);
			await http.get("/v1/owner/menu-items").expect(404);
		});
	});
});
