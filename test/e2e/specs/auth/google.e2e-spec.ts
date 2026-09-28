import { AuthRole } from "@/domain/enums/auth-role";
import { UserRepository } from "@/repositories/user.repository";
import type { TFakeGoogleClaims } from "../../helpers/fakes/google-oauth.adapter.fake";
import { getE2eApp } from "../../helpers/app.harness";

const CLAIMS: TFakeGoogleClaims = {
	sub: "google-sub-1",
	email: "gina@example.com",
	email_verified: true,
	name: "Gina Google",
	picture: "https://example.com/gina.png",
};

describe("google login", () => {
	/** Starts the redirect flow and returns the `state` from the Location URL. */
	async function start(role?: string): Promise<string> {
		const res = await getE2eApp()
			.http.get("/v1/auth/google")
			.query(role ? { role } : {})
			.expect(302);
		const location = new URL(res.headers.location);
		return location.searchParams.get("state")!;
	}

	function verify(code: string, state: string) {
		return getE2eApp()
			.http.post("/v1/auth/google/verify")
			.send({ code, state });
	}

	/** Full round trip: start, register the code's claims, then verify. */
	async function login(code: string, role?: string, claims = CLAIMS) {
		const { google } = getE2eApp();
		const state = await start(role);
		google.register(code, claims);
		return verify(code, state);
	}

	it("redirects with a state and an S256 PKCE challenge", async () => {
		const res = await getE2eApp().http.get("/v1/auth/google").expect(302);
		const location = new URL(res.headers.location);
		expect(location.hostname).toBe("accounts.google.com");
		expect(location.searchParams.get("state")).toBeTruthy();
		expect(location.searchParams.get("code_challenge")).toBeTruthy();
	});

	it("rejects a bad role query with 400", async () => {
		await getE2eApp()
			.http.get("/v1/auth/google")
			.query({ role: "admin" })
			.expect(400);
	});

	it.each([[{}], [{ code: "x" }], [{ state: "x" }]])(
		"rejects a verify body missing code or state %j with 400",
		async (body) => {
			await getE2eApp()
				.http.post("/v1/auth/google/verify")
				.send(body)
				.expect(400);
		},
	);

	it("rejects an unknown state with 401", async () => {
		await verify("tok-1", "not-a-real-state").expect(401);
	});

	it("rejects a replayed state with 401", async () => {
		const { google } = getE2eApp();
		const state = await start();
		google.register("tok-1", CLAIMS);
		await verify("tok-1", state).expect(200);
		await verify("tok-1", state).expect(401);
	});

	it("rejects an unknown code with 401", async () => {
		const state = await start();
		await verify("nope", state).expect(401);
	});

	it("creates a verified but unonboarded user from the Google profile", async () => {
		const res = await login("tok-1");
		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			status: "authenticated",
			user: {
				email: "gina@example.com",
				role: "user",
				firstName: "Gina",
				lastName: "Google",
				isOnboarded: false,
				avatarUrl: "https://example.com/gina.png",
			},
			expiresIn: 900,
		});
		expect(typeof res.body.refreshToken).toBe("string");
		expect(res.body.user).not.toHaveProperty("googleSub");
	});

	it("creates a restaurant when the intended role is carried through the state", async () => {
		const res = await login("tok-1", "restaurant");
		expect(res.status).toBe(200);
		expect(res.body.user.role).toBe("restaurant");
	});

	it("links to an existing account by email without creating a second one", async () => {
		const { seedUser, app } = getE2eApp();
		const existing = await seedUser({ email: CLAIMS.email });
		const res = await login("tok-1");
		expect(res.status).toBe(200);
		expect(res.body.user.id).toBe(existing.id);
		const linked = await app.get(UserRepository).findByGoogleSub(CLAIMS.sub);
		expect(linked?.id).toBe(existing.id);
	});

	it("keeps an existing first name instead of overwriting it", async () => {
		const { seedUser } = getE2eApp();
		await seedUser({ email: CLAIMS.email, firstName: "Existing" });
		const res = await login("tok-1");
		expect(res.status).toBe(200);
		expect(res.body.user.firstName).toBe("Existing");
		expect(res.body.user.lastName).toBe("Google");
		expect(res.body.user.avatarUrl).toBe(CLAIMS.picture);
	});

	it("onboards an existing unonboarded user signing in with Google", async () => {
		const { seedUser } = getE2eApp();
		await seedUser({ email: CLAIMS.email });
		const res = await login("tok-1");
		expect(res.status).toBe(200);
		expect(res.body.user.isOnboarded).toBe(true);
	});

	it("prefers given_name/family_name over splitting the full name", async () => {
		const res = await login("tok-1", undefined, {
			...CLAIMS,
			name: "Ignored Name",
			given_name: "Gina",
			family_name: "van der Berg",
		});
		expect(res.status).toBe(200);
		expect(res.body.user).toMatchObject({
			firstName: "Gina",
			lastName: "van der Berg",
		});
	});

	it("leaves lastName null for a single-word name", async () => {
		const res = await login("tok-1", undefined, { ...CLAIMS, name: "Gina" });
		expect(res.status).toBe(200);
		expect(res.body.user).toMatchObject({
			firstName: "Gina",
			lastName: null,
			isOnboarded: false,
		});
	});

	it("does not onboard a Google user with no name", async () => {
		const res = await login("tok-1", undefined, { ...CLAIMS, name: undefined });
		expect(res.status).toBe(200);
		expect(res.body.user).toMatchObject({
			firstName: null,
			isOnboarded: false,
		});
	});

	it("recognises a returning user by Google sub after their email changed", async () => {
		const first = await login("tok-1");
		expect(first.status).toBe(200);
		const second = await login("tok-2", undefined, {
			...CLAIMS,
			email: "gina.new@example.com",
		});
		expect(second.status).toBe(200);
		expect(second.body.user.id).toBe(first.body.user.id);
		expect(second.body.user.email).toBe("gina@example.com");
	});

	it("rejects an unverified Google email with 401", async () => {
		const res = await login("tok-1", undefined, {
			...CLAIMS,
			email_verified: false,
		});
		expect(res.status).toBe(401);
	});

	it("signs an existing account in under its real role, ignoring the picked role", async () => {
		const { seedUser, app } = getE2eApp();
		const existing = await seedUser({
			email: CLAIMS.email,
			role: AuthRole.Restaurant,
		});
		const res = await login("tok-1", "user");
		expect(res.status).toBe(200);
		expect(res.body.status).toBe("authenticated");
		expect(res.body.user.id).toBe(existing.id);
		expect(res.body.user.role).toBe("restaurant");
		const allUsers = await app.get(UserRepository).findByEmail(CLAIMS.email);
		expect(allUsers?.id).toBe(existing.id);
	});
});
