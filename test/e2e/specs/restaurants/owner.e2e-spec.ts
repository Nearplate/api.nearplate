import { AuthRole } from "@/domain/enums/auth-role";
import { AddressRepository } from "@/repositories/address.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import { getE2eApp } from "../../helpers/app.harness";

const BODY = {
	name: "Spice Hub",
	cuisines: ["Indian", "  Chinese "],
	isPureVeg: false,
	coordinates: [77.5946, 12.9716],
	address: {
		line1: "12 MG Road",
		city: "Bengaluru",
		state: "Karnataka",
		zipcode: "560001",
	},
};
const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("owner restaurants", () => {
	async function owner() {
		const user = await getE2eApp().seedUser({ role: AuthRole.Restaurant });
		return { user, auth: `Bearer ${user.accessToken}` };
	}

	async function create(auth: string, body: object = BODY) {
		const res = await getE2eApp()
			.http.post("/v1/restaurants")
			.set("Authorization", auth)
			.send(body)
			.expect(201);
		return res.body as {
			id: string;
			slug: string;
			name: string;
			status: string;
			cuisines: string[];
			coordinates: number[];
			address: Record<string, unknown>;
		};
	}

	describe("access", () => {
		it("returns 401 without a token", async () => {
			await getE2eApp().http.get("/v1/restaurants/mine").expect(401);
		});

		it.each([AuthRole.User, AuthRole.Guest])(
			"returns 403 for the %s role on every route",
			async (role) => {
				const { http, authHeader } = getE2eApp();
				const h = authHeader(role);
				await http
					.get("/v1/restaurants/mine")
					.set("Authorization", h)
					.expect(403);
				await http
					.post("/v1/restaurants")
					.set("Authorization", h)
					.send(BODY)
					.expect(403);
				await http
					.delete(`/v1/restaurants/${MISSING_ID}`)
					.set("Authorization", h)
					.expect(403);
			},
		);

		it("does not promote a user who tries", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			await http
				.post("/v1/restaurants")
				.set("Authorization", `Bearer ${user.accessToken}`)
				.send(BODY)
				.expect(403);
			const me = await http
				.get("/v1/users/me")
				.set("Authorization", `Bearer ${user.accessToken}`);
			expect(me.body.role).toBe("user");
		});
	});

	describe("create", () => {
		it("creates a restaurant with its address, a slug and normalized cuisines", async () => {
			const { auth } = await owner();
			const r = await create(auth);
			expect(r).toMatchObject({
				name: "Spice Hub",
				slug: "spice-hub",
				status: "online",
				cuisines: ["indian", "chinese"],
				isPureVeg: false,
				coordinates: [77.5946, 12.9716],
				address: {
					line1: "12 MG Road",
					line2: null,
					city: "Bengaluru",
					phoneNumber: null,
				},
			});
			expect(r).not.toHaveProperty("ownerId");
			expect(r).not.toHaveProperty("location");
		});

		it("gives a duplicate name a suffixed slug", async () => {
			const { auth } = await owner();
			await create(auth);
			const second = await create(auth);
			expect(second.slug).toMatch(/^spice-hub-[0-9a-f]{6}$/);
		});

		it.each([
			["missing name", { ...BODY, name: undefined }],
			["empty cuisines", { ...BODY, cuisines: [] }],
			[
				"11 cuisines",
				{ ...BODY, cuisines: Array.from({ length: 11 }, (_, i) => `c${i}`) },
			],
			["longitude out of range", { ...BODY, coordinates: [200, 10] }],
			["latitude out of range", { ...BODY, coordinates: [10, 91] }],
			["one coordinate", { ...BODY, coordinates: [10] }],
			["missing address", { ...BODY, address: undefined }],
			["unknown field", { ...BODY, extra: true }],
			[
				"unknown address field",
				{ ...BODY, address: { ...BODY.address, x: 1 } },
			],
			["missing isPureVeg", { ...BODY, isPureVeg: undefined }],
		])("rejects %s with 400", async (_label, body) => {
			const { auth } = await owner();
			await getE2eApp()
				.http.post("/v1/restaurants")
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});
	});

	describe("list and get", () => {
		it("lists only the caller's restaurants, newest first, with paging", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			await create(a.auth, { ...BODY, name: "First" });
			await create(a.auth, { ...BODY, name: "Second" });
			await create(b.auth, { ...BODY, name: "Other" });

			const res = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", a.auth)
				.expect(200);
			expect(res.body.total).toBe(2);
			expect(res.body.items.map((r: { name: string }) => r.name)).toEqual([
				"Second",
				"First",
			]);
			const page = await http
				.get("/v1/restaurants/mine?limit=1&offset=1")
				.set("Authorization", a.auth)
				.expect(200);
			expect(page.body.items).toHaveLength(1);
			expect(page.body.total).toBe(2);
		});

		it("filters by status", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			const r = await create(auth);
			await http
				.patch(`/v1/restaurants/${r.id}/status`)
				.set("Authorization", auth)
				.send({ status: "offline" })
				.expect(200);
			const online = await http
				.get("/v1/restaurants/mine?status=online")
				.set("Authorization", auth);
			const offline = await http
				.get("/v1/restaurants/mine?status=offline")
				.set("Authorization", auth);
			expect(online.body.total).toBe(0);
			expect(offline.body.total).toBe(1);
		});

		it.each(["limit=0", "limit=101", "offset=-1", "status=maybe"])(
			"rejects invalid list query %s with 400",
			async (qs) => {
				const { auth } = await owner();
				await getE2eApp()
					.http.get(`/v1/restaurants/mine?${qs}`)
					.set("Authorization", auth)
					.expect(400);
			},
		);

		it("scopes mine to the caller while the public slug lookup works for anyone", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const r = await create(a.auth);
			const mineA = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", a.auth)
				.expect(200);
			expect(mineA.body.items.map((x: { id: string }) => x.id)).toEqual([r.id]);
			const mineB = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", b.auth)
				.expect(200);
			expect(mineB.body).toEqual({ items: [], total: 0 });
			await http.get(`/v1/restaurants/${r.slug}`).expect(200);
		});

		it("is not mistaken for a slug: mine needs the restaurant role", async () => {
			const { http, authHeader } = getE2eApp();
			await http.get("/v1/restaurants/mine").expect(401);
			await http
				.get("/v1/restaurants/mine")
				.set("Authorization", authHeader(AuthRole.User))
				.expect(403);
		});

		it("returns 404 for a malformed or unknown id on update, status and delete", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			for (const id of ["not-an-id", MISSING_ID]) {
				await http
					.patch(`/v1/restaurants/${id}`)
					.set("Authorization", auth)
					.send({ name: "x" })
					.expect(404);
				await http
					.patch(`/v1/restaurants/${id}/status`)
					.set("Authorization", auth)
					.send({ status: "offline" })
					.expect(404);
				await http
					.delete(`/v1/restaurants/${id}`)
					.set("Authorization", auth)
					.expect(404);
			}
		});
	});

	describe("update", () => {
		it("updates fields but keeps the slug", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			const r = await create(auth);
			const res = await http
				.patch(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.send({ name: "Spice Palace", cuisines: ["Thai"], isPureVeg: true })
				.expect(200);
			expect(res.body).toMatchObject({
				name: "Spice Palace",
				slug: "spice-hub",
				cuisines: ["thai"],
				isPureVeg: true,
			});
		});

		it("patches only the given address fields", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			const r = await create(auth);
			const res = await http
				.patch(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.send({ address: { city: "Mysuru", phoneNumber: "9876543210" } })
				.expect(200);
			expect(res.body.address).toMatchObject({
				line1: "12 MG Road",
				city: "Mysuru",
				phoneNumber: "9876543210",
			});
		});

		it("moves the denormalized location of its menu items with it", async () => {
			const { http, seedMenuItem, app } = getE2eApp();
			const { user, auth } = await owner();
			const r = await create(auth);
			const item = await seedMenuItem(user.id, r.id);
			expect(item.location.coordinates).toEqual([77.5946, 12.9716]);

			await http
				.patch(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.send({ coordinates: [72.8777, 19.076] })
				.expect(200);

			const moved = await app
				.get(MenuItemRepository)
				.findInRestaurant(user.id, r.id, item.id);
			expect(moved?.location.coordinates).toEqual([72.8777, 19.076]);
		});

		it.each([
			["empty body", {}],
			["empty address", { address: {} }],
			["bad coordinates", { coordinates: [0, 100] }],
			["unknown field", { slug: "hijack" }],
			["unknown address field", { address: { country: "IN" } }],
		])("rejects %s with 400", async (_label, body) => {
			const { auth } = await owner();
			const r = await create(auth);
			await getE2eApp()
				.http.patch(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.send(body)
				.expect(400);
		});

		it("toggles status and rejects a bad status", async () => {
			const { http } = getE2eApp();
			const { auth } = await owner();
			const r = await create(auth);
			const off = await http
				.patch(`/v1/restaurants/${r.id}/status`)
				.set("Authorization", auth)
				.send({ status: "offline" })
				.expect(200);
			expect(off.body.status).toBe("offline");
			await http
				.patch(`/v1/restaurants/${r.id}/status`)
				.set("Authorization", auth)
				.send({ status: "closed" })
				.expect(400);
		});

		it("returns 404 for another owner on update and status", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const r = await create(a.auth);
			await http
				.patch(`/v1/restaurants/${r.id}`)
				.set("Authorization", b.auth)
				.send({ name: "Hijacked" })
				.expect(404);
			await http
				.patch(`/v1/restaurants/${r.id}/status`)
				.set("Authorization", b.auth)
				.send({ status: "offline" })
				.expect(404);
			const still = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", a.auth);
			expect(still.body.items[0].name).toBe("Spice Hub");
		});
	});

	describe("delete", () => {
		it("deletes the restaurant with its menu items and address", async () => {
			const { http, seedMenuItem, app } = getE2eApp();
			const { user, auth } = await owner();
			const r = await create(auth);
			const item = await seedMenuItem(user.id, r.id);
			const addressId = r.address.id as string;

			await http
				.delete(`/v1/restaurants/${r.id}`)
				.set("Authorization", auth)
				.expect(204);

			const mine = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", auth);
			expect(mine.body.total).toBe(0);
			await http.get(`/v1/restaurants/${r.slug}`).expect(404);
			expect(
				await app
					.get(MenuItemRepository)
					.findInRestaurant(user.id, r.id, item.id),
			).toBeNull();
			expect(await app.get(AddressRepository).findById(addressId)).toBeNull();
		});

		it("returns 404 for another owner and leaves the restaurant intact", async () => {
			const { http } = getE2eApp();
			const a = await owner();
			const b = await owner();
			const r = await create(a.auth);
			await http
				.delete(`/v1/restaurants/${r.id}`)
				.set("Authorization", b.auth)
				.expect(404);
			const mine = await http
				.get("/v1/restaurants/mine")
				.set("Authorization", a.auth);
			expect(mine.body.total).toBe(1);
			await http
				.delete(`/v1/restaurants/not-an-id`)
				.set("Authorization", a.auth)
				.expect(404);
		});
	});
});
