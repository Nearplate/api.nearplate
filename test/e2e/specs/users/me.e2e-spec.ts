import { DatabaseService } from "@/app/modules/database";
import { users } from "@db/schemas/user.schema";
import { eq } from "drizzle-orm";
import { getE2eApp } from "../../helpers/app.harness";

describe("users/me", () => {
	const auth = (token: string) => `Bearer ${token}`;

	it("returns the profile without internals", async () => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser({ firstName: "Bob", lastName: "Baker" });
		const res = await http
			.get("/v1/users/me")
			.set("Authorization", auth(user.accessToken))
			.expect(200);
		expect(Object.keys(res.body).sort()).toEqual([
			"anniversaryDate",
			"avatarUrl",
			"createdAt",
			"dateOfBirth",
			"email",
			"firstName",
			"gender",
			"id",
			"isOnboarded",
			"lastName",
			"phoneNumber",
			"role",
		]);
		expect(res.body).toMatchObject({
			id: user.id,
			firstName: "Bob",
			lastName: "Baker",
			isOnboarded: false,
		});
	});

	it("PATCH updates the profile and later reads see it (cache invalidated)", async () => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		const header = auth(user.accessToken);
		await http.get("/v1/users/me").set("Authorization", header).expect(200);
		const res = await http
			.patch("/v1/users/me")
			.set("Authorization", header)
			.send({
				firstName: "Bobby",
				lastName: "Baker",
				avatarUrl: "https://example.com/b.png",
				phoneNumber: "+919876543210",
				dateOfBirth: "1990-05-15",
				anniversaryDate: "2015-11-20",
				gender: "male",
			})
			.expect(200);
		expect(res.body).toMatchObject({
			firstName: "Bobby",
			lastName: "Baker",
			avatarUrl: "https://example.com/b.png",
			phoneNumber: "+919876543210",
			dateOfBirth: "1990-05-15",
			anniversaryDate: "2015-11-20",
			gender: "male",
		});
		const again = await http.get("/v1/users/me").set("Authorization", header);
		expect(again.body.firstName).toBe("Bobby");
		expect(again.body.phoneNumber).toBe("+919876543210");
	});

	it("PATCH clears fields by setting them to null", async () => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		const header = auth(user.accessToken);
		await http
			.patch("/v1/users/me")
			.set("Authorization", header)
			.send({ phoneNumber: "+919876543210", gender: "male" })
			.expect(200);
		const res = await http
			.patch("/v1/users/me")
			.set("Authorization", header)
			.send({ phoneNumber: null, gender: null })
			.expect(200);
		expect(res.body.phoneNumber).toBeNull();
		expect(res.body.gender).toBeNull();
	});

	it.each([
		[{}],
		[{ firstName: "" }],
		[{ avatarUrl: "not a url" }],
		[{ role: "admin" }],
		[{ name: "legacy field" }],
		[{ phoneNumber: "abc" }],
		[{ phoneNumber: "123" }],
		[{ dateOfBirth: "2999-01-01" }],
		[{ dateOfBirth: "1800-01-01" }],
		[{ dateOfBirth: "not-a-date" }],
		[{ anniversaryDate: "2999-01-01" }],
		[{ gender: "unknown" }],
	])("rejects invalid PATCH body %j with 400", async (body) => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		await http
			.patch("/v1/users/me")
			.set("Authorization", auth(user.accessToken))
			.send(body)
			.expect(400);
	});

	it("onboards: sets both names and marks the account onboarded", async () => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		const res = await http
			.post("/v1/users/me/onboard")
			.set("Authorization", auth(user.accessToken))
			.send({ firstName: "Asha", lastName: "Rao" })
			.expect(200);
		expect(res.body).toMatchObject({
			firstName: "Asha",
			lastName: "Rao",
			isOnboarded: true,
		});
		const me = await http
			.get("/v1/users/me")
			.set("Authorization", auth(user.accessToken));
		expect(me.body.isOnboarded).toBe(true);
	});

	it.each([
		[{ firstName: "Asha" }],
		[{ firstName: "Asha", lastName: "" }],
		[{ firstName: "Asha", lastName: "Rao", extra: 1 }],
	])("rejects invalid onboard body %j with 400", async (body) => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		await http
			.post("/v1/users/me/onboard")
			.set("Authorization", auth(user.accessToken))
			.send(body)
			.expect(400);
	});

	it("requires a token", async () => {
		const { http } = getE2eApp();
		await http.get("/v1/users/me").expect(401);
		await http.patch("/v1/users/me").send({ firstName: "A" }).expect(401);
		await http.post("/v1/users/me/onboard").send({}).expect(401);
	});

	it("returns 401 for a valid token whose user was deleted", async () => {
		const { http, seedUser, app } = getE2eApp();
		const user = await seedUser();
		await app
			.get(DatabaseService)
			.db.delete(users)
			.where(eq(users.id, user.id));
		await http
			.get("/v1/users/me")
			.set("Authorization", auth(user.accessToken))
			.expect(401);
	});
});
