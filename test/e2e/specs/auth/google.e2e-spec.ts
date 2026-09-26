import { AuthRole } from "@/domain/enums/auth-role";
import { UserRepository } from "@/repositories/user.repository";
import { getE2eApp } from "../../helpers/app.harness";

const CLAIMS = {
	sub: "google-sub-1",
	email: "gina@example.com",
	email_verified: true,
	name: "Gina Google",
	picture: "https://example.com/gina.png",
};

describe("google login", () => {
	function login(idToken: string, role?: string) {
		return getE2eApp()
			.http.post("/v1/auth/google")
			.send({ idToken, ...(role ? { role } : {}) });
	}

	it("creates a verified user from the Google profile", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", CLAIMS);
		const res = await login("tok-1").expect(200);
		expect(res.body).toMatchObject({
			status: "authenticated",
			user: {
				email: "gina@example.com",
				role: "user",
				firstName: "Gina",
				lastName: "Google",
				isOnboarded: true,
				avatarUrl: "https://example.com/gina.png",
			},
			expiresIn: 900,
		});
		expect(typeof res.body.refreshToken).toBe("string");
		expect(res.body.user).not.toHaveProperty("googleSub");
	});

	it("creates a restaurant when asked", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", CLAIMS);
		const res = await login("tok-1", "restaurant").expect(200);
		expect(res.body.user.role).toBe("restaurant");
	});

	it("links to an existing account by email without creating a second one", async () => {
		const { google, seedUser, app } = getE2eApp();
		const existing = await seedUser({ email: CLAIMS.email });
		google.register("tok-1", CLAIMS);
		const res = await login("tok-1").expect(200);
		expect(res.body.user.id).toBe(existing.id);
		const linked = await app.get(UserRepository).findByGoogleSub(CLAIMS.sub);
		expect(linked?.id).toBe(existing.id);
	});

	it("keeps an existing first name instead of overwriting it", async () => {
		const { google, seedUser } = getE2eApp();
		await seedUser({ email: CLAIMS.email, firstName: "Existing" });
		google.register("tok-1", CLAIMS);
		const res = await login("tok-1").expect(200);
		expect(res.body.user.firstName).toBe("Existing");
		expect(res.body.user.lastName).toBe("Google");
		expect(res.body.user.avatarUrl).toBe(CLAIMS.picture);
	});

	it("prefers given_name/family_name over splitting the full name", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", {
			...CLAIMS,
			name: "Ignored Name",
			given_name: "Gina",
			family_name: "van der Berg",
		});
		const res = await login("tok-1").expect(200);
		expect(res.body.user).toMatchObject({
			firstName: "Gina",
			lastName: "van der Berg",
		});
	});

	it("leaves lastName null and still onboards for a single-word name", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", { ...CLAIMS, name: "Gina" });
		const res = await login("tok-1").expect(200);
		expect(res.body.user).toMatchObject({
			firstName: "Gina",
			lastName: null,
			isOnboarded: true,
		});
	});

	it("does not onboard a Google user with no name", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", { ...CLAIMS, name: undefined });
		const res = await login("tok-1").expect(200);
		expect(res.body.user).toMatchObject({
			firstName: null,
			isOnboarded: false,
		});
	});

	it("recognises a returning user by Google sub after their email changed", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", CLAIMS);
		const first = await login("tok-1").expect(200);
		google.register("tok-2", { ...CLAIMS, email: "gina.new@example.com" });
		const second = await login("tok-2").expect(200);
		expect(second.body.user.id).toBe(first.body.user.id);
		expect(second.body.user.email).toBe("gina@example.com");
	});

	it("rejects an unverified Google email with 401", async () => {
		const { google } = getE2eApp();
		google.register("tok-1", { ...CLAIMS, email_verified: false });
		await login("tok-1").expect(401);
	});

	it("rejects an unknown or invalid ID token with 401", async () => {
		await login("nope").expect(401);
	});

	it("reports a role mismatch without signing in", async () => {
		const { google, seedUser } = getE2eApp();
		await seedUser({ email: CLAIMS.email, role: AuthRole.Restaurant });
		google.register("tok-1", CLAIMS);
		const res = await login("tok-1", "user").expect(200);
		expect(res.body).toEqual({ status: "role_mismatch", role: "restaurant" });
	});

	it("answers 501 when Google is not configured", async () => {
		const { google } = getE2eApp();
		google.configured = false;
		google.register("tok-1", CLAIMS);
		await login("tok-1").expect(501);
	});

	it.each([
		[{}],
		[{ idToken: "x", role: "admin" }],
		[{ idToken: "x", extra: true }],
	])("rejects invalid body %j with 400", async (body) => {
		await getE2eApp().http.post("/v1/auth/google").send(body).expect(400);
	});
});
