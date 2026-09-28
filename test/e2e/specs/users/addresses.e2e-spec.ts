import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../../helpers/app.harness";

describe("users/me/addresses", () => {
	const auth = (token: string) => `Bearer ${token}`;

	const home = {
		label: "Home",
		line1: "12 MG Road",
		city: "Bengaluru",
		state: "Karnataka",
		zipcode: "560001",
		phoneNumber: "+919876543210",
	};

	const work = {
		label: "Work",
		line1: "45 Residency Road",
		city: "Bengaluru",
		state: "Karnataka",
		zipcode: "560025",
		phoneNumber: "+919123456789",
	};

	describe("POST /", () => {
		it("creates an address and makes the first one the default", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const res = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(home)
				.expect(201);
			expect(res.body).toMatchObject({ label: "Home", isDefault: true });
			expect(res.body.userId).toBeUndefined();
		});

		it("normalises the phone to +91 and stores the map pin", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const res = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send({ ...home, phoneNumber: "98765 43210", lat: 12.97, lng: 77.59 })
				.expect(201);
			expect(res.body).toMatchObject({
				phoneNumber: "+919876543210",
				lat: 12.97,
				lng: 77.59,
			});
		});

		it("keeps a 10-digit number that itself starts with 91", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const res = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send({ ...home, phoneNumber: "9123456789" })
				.expect(201);
			expect(res.body.phoneNumber).toBe("+919123456789");
		});

		it("returns a null pin when none was sent", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const res = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(home)
				.expect(201);
			expect(res.body).toMatchObject({ lat: null, lng: null });
		});

		it("does not default a second address unless requested", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			const second = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(work)
				.expect(201);
			expect(second.body.isDefault).toBe(false);
		});

		it("setting isDefault true on a new address clears the previous default", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			const first = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send({ ...work, isDefault: true })
				.expect(201);
			const list = await http
				.get("/v1/users/me/addresses")
				.set("Authorization", header)
				.expect(200);
			const defaults = list.body.filter(
				(a: { isDefault: boolean }) => a.isDefault,
			);
			expect(defaults).toHaveLength(1);
			expect(defaults[0].label).toBe("Work");
			const reloadedFirst = list.body.find(
				(a: { id: string }) => a.id === first.body.id,
			);
			expect(reloadedFirst.isDefault).toBe(false);
		});

		it.each([
			[{}],
			[{ ...home, label: "" }],
			[{ ...home, line1: "" }],
			[{ ...home, zipcode: "" }],
			[{ ...home, phoneNumber: 123 }],
			[{ ...home, phoneNumber: undefined }],
			[{ ...home, phoneNumber: "12345" }],
			[{ ...home, phoneNumber: "5876543210" }],
			[{ ...home, lat: 91, lng: 77.6 }],
			[{ ...home, extra: "nope" }],
		])("rejects invalid body %j with 400", async (body) => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(body)
				.expect(400);
		});

		it("returns 400 once the address book is full", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			const _MAX_ADDRESSES = 20;
			for (let i = 0; i < _MAX_ADDRESSES; i++) {
				await http
					.post("/v1/users/me/addresses")
					.set("Authorization", header)
					.send({ ...home, label: `Address ${i}` })
					.expect(201);
			}
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send({ ...home, label: "One too many" })
				.expect(400);
		});
	});

	describe("GET /", () => {
		it("lists the caller's addresses, default first", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(work)
				.expect(201);
			const res = await http
				.get("/v1/users/me/addresses")
				.set("Authorization", header)
				.expect(200);
			expect(res.body).toHaveLength(2);
			expect(res.body[0].isDefault).toBe(true);
		});

		it("never lists another user's addresses", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const other = await seedUser();
			await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(home)
				.expect(201);
			const res = await http
				.get("/v1/users/me/addresses")
				.set("Authorization", auth(other.accessToken))
				.expect(200);
			expect(res.body).toEqual([]);
		});
	});

	describe("PATCH /:id", () => {
		it("updates fields and can switch the default", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			const first = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			const second = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(work)
				.expect(201);

			const res = await http
				.patch(`/v1/users/me/addresses/${second.body.id}`)
				.set("Authorization", header)
				.send({ isDefault: true })
				.expect(200);
			expect(res.body.isDefault).toBe(true);

			const list = await http
				.get("/v1/users/me/addresses")
				.set("Authorization", header)
				.expect(200);
			const defaults = list.body.filter(
				(a: { isDefault: boolean }) => a.isDefault,
			);
			expect(defaults).toHaveLength(1);
			expect(defaults[0].id).toBe(second.body.id);
			expect(
				list.body.find((a: { id: string }) => a.id === first.body.id).isDefault,
			).toBe(false);
		});

		it("rejects an empty body with 400", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			const created = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			await http
				.patch(`/v1/users/me/addresses/${created.body.id}`)
				.set("Authorization", header)
				.send({})
				.expect(400);
		});

		it("returns 404 for another user's address or an unknown id", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const stranger = await seedUser();
			const created = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(home)
				.expect(201);
			await http
				.patch(`/v1/users/me/addresses/${created.body.id}`)
				.set("Authorization", auth(stranger.accessToken))
				.send({ label: "Nope" })
				.expect(404);
			await http
				.patch("/v1/users/me/addresses/00000000-0000-0000-0000-000000000000")
				.set("Authorization", auth(user.accessToken))
				.send({ label: "Nope" })
				.expect(404);
		});
	});

	describe("DELETE /:id", () => {
		it("promotes the newest remaining address when the default is deleted", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const header = auth(user.accessToken);
			const first = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(home)
				.expect(201);
			const second = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", header)
				.send(work)
				.expect(201);

			await http
				.delete(`/v1/users/me/addresses/${first.body.id}`)
				.set("Authorization", header)
				.expect(204);

			const list = await http
				.get("/v1/users/me/addresses")
				.set("Authorization", header)
				.expect(200);
			expect(list.body).toHaveLength(1);
			expect(list.body[0].id).toBe(second.body.id);
			expect(list.body[0].isDefault).toBe(true);
		});

		it("returns 404 for another user's address or an unknown id", async () => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser();
			const stranger = await seedUser();
			const created = await http
				.post("/v1/users/me/addresses")
				.set("Authorization", auth(user.accessToken))
				.send(home)
				.expect(201);
			await http
				.delete(`/v1/users/me/addresses/${created.body.id}`)
				.set("Authorization", auth(stranger.accessToken))
				.expect(404);
			await http
				.delete("/v1/users/me/addresses/00000000-0000-0000-0000-000000000000")
				.set("Authorization", auth(user.accessToken))
				.expect(404);
		});
	});

	it("requires a user token", async () => {
		const { http, seedUser } = getE2eApp();
		const restaurantOwner = await seedUser({ role: AuthRole.Restaurant });
		await http.get("/v1/users/me/addresses").expect(401);
		await http.post("/v1/users/me/addresses").send(home).expect(401);
		await http
			.get("/v1/users/me/addresses")
			.set("Authorization", auth(restaurantOwner.accessToken))
			.expect(403);
	});
});
