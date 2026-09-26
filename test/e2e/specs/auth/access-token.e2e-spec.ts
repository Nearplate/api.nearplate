import { AuthRole } from "@/domain/enums/auth-role";
import { sign } from "jsonwebtoken";
import { getE2eApp } from "../../helpers/app.harness";

describe("access-token guard (via /auth/me)", () => {
	it("returns 401 without a token", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/auth/me").expect(401);
		expect(res.body).toEqual({ statusCode: 401 });
	});

	it("returns 401 for a malformed token", async () => {
		const { http } = getE2eApp();
		await http.get("/auth/me").set("Authorization", "Bearer nope").expect(401);
	});

	it("returns 401 when the scheme is not Bearer", async () => {
		const { http, seedUser } = getE2eApp();
		const user = await seedUser();
		await http
			.get("/auth/me")
			.set("Authorization", `Basic ${user.accessToken}`)
			.expect(401);
	});

	it("returns 401 for a user-role claim signed with the admin secret", async () => {
		const { http } = getE2eApp();
		const forged = sign(
			{ sub: "attacker", role: AuthRole.User },
			process.env.JWT_ADMIN_ACCESS_SECRET as string,
		);
		await http
			.get("/auth/me")
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
			.get("/auth/me")
			.set("Authorization", `Bearer ${expired}`)
			.expect(401);
	});

	it("returns 403 for a valid guest token", async () => {
		const { http, authHeader } = getE2eApp();
		const res = await http
			.get("/auth/me")
			.set("Authorization", authHeader(AuthRole.Guest))
			.expect(403);
		expect(res.body).toEqual({ statusCode: 403 });
	});

	it.each([AuthRole.Admin, AuthRole.Restaurant, AuthRole.User] as const)(
		"accepts a %s token",
		async (role) => {
			const { http, seedUser } = getE2eApp();
			const user = await seedUser({ role });
			const res = await http
				.get("/auth/me")
				.set("Authorization", `Bearer ${user.accessToken}`)
				.expect(200);
			expect(res.body.role).toBe(role);
		},
	);
});
