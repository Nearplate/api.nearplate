import { sign } from "jsonwebtoken";
import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../helpers/app.harness";

describe("auth guard (via /todos)", () => {
	it("returns 401 without a token", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/todos").expect(401);
		expect(res.body).toEqual({ statusCode: 401 });
	});

	it("returns 401 for a malformed token", async () => {
		const { http } = getE2eApp();
		await http.get("/todos").set("Authorization", "Bearer nope").expect(401);
	});

	it("returns 401 when the scheme is not Bearer", async () => {
		const { http, jwt } = getE2eApp();
		const token = jwt.signAccessToken("u1", AuthRole.User);
		await http.get("/todos").set("Authorization", `Basic ${token}`).expect(401);
	});

	it("returns 401 for a user-role claim signed with the admin secret", async () => {
		const { http } = getE2eApp();
		const forged = sign(
			{ sub: "attacker", role: AuthRole.User },
			process.env.JWT_ADMIN_ACCESS_SECRET as string,
		);
		await http
			.get("/todos")
			.set("Authorization", `Bearer ${forged}`)
			.expect(401);
	});

	it("returns 401 for an expired token", async () => {
		const { http } = getE2eApp();
		const expired = sign(
			{ sub: "u1", role: AuthRole.User },
			process.env.JWT_USER_ACCESS_SECRET as string,
			{ expiresIn: -10 },
		);
		await http
			.get("/todos")
			.set("Authorization", `Bearer ${expired}`)
			.expect(401);
	});

	it("returns 403 for a valid guest token on a non-guest route", async () => {
		const { http, authHeader } = getE2eApp();
		const res = await http
			.get("/todos")
			.set("Authorization", authHeader(AuthRole.Guest))
			.expect(403);
		expect(res.body).toEqual({ statusCode: 403 });
	});

	it.each([AuthRole.Admin, AuthRole.Restaurant, AuthRole.User])(
		"accepts a %s token",
		async (role) => {
			const { http, authHeader } = getE2eApp();
			await http
				.get("/todos")
				.set("Authorization", authHeader(role))
				.expect(200);
		},
	);
});
