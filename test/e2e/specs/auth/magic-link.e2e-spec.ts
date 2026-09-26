import { AuthRole } from "@/domain/enums/auth-role";
import { AuthTokenRepository } from "@/repositories/auth-token.repository";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { AUTH_TOKEN_PURPOSES } from "@db/schemas/auth-token.schema";
import { getE2eApp } from "../../helpers/app.harness";

describe("magic link", () => {
	async function requestLink(email: string, role?: string) {
		const { http, resend } = getE2eApp();
		const res = await http
			.post("/auth/magic-link")
			.send({ email, ...(role ? { role } : {}) })
			.expect(200);
		return { body: res.body, resend };
	}

	async function requestToken(email: string, role?: string): Promise<string> {
		const { resend } = await requestLink(email, role);
		return resend.tokenOf(await resend.waitForLink(email));
	}

	function verify(token: string) {
		return getE2eApp().http.post("/auth/magic-link/verify").send({ token });
	}

	it("emails a link that points at the web app and answers sent", async () => {
		const { body, resend } = await requestLink("bob@example.com");
		expect(body).toEqual({ status: "sent" });
		const link = await resend.waitForLink("bob@example.com");
		expect(link.url.startsWith("http://localhost:3400/auth/magic?token=")).toBe(
			true,
		);
		expect(link.minutes).toBe(15);
	});

	it("answers sent for known and unknown emails alike", async () => {
		const { seedUser } = getE2eApp();
		const known = await seedUser({ email: "known@example.com" });
		const a = await requestLink(known.email);
		const b = await requestLink("unknown@example.com");
		expect(a.body).toEqual(b.body);
	});

	it("signs a new email up as a user and returns tokens", async () => {
		const token = await requestToken("bob@example.com");
		const res = await verify(token).expect(200);
		expect(res.body).toMatchObject({
			status: "authenticated",
			user: { email: "bob@example.com", role: "user", name: null },
			expiresIn: 900,
		});
		expect(typeof res.body.accessToken).toBe("string");
		expect(typeof res.body.refreshToken).toBe("string");
		expect(res.body.user).not.toHaveProperty("googleSub");

		const me = await getE2eApp()
			.http.get("/auth/me")
			.set("Authorization", `Bearer ${res.body.accessToken}`)
			.expect(200);
		expect(me.body.email).toBe("bob@example.com");
	});

	it("creates a restaurant when asked", async () => {
		const token = await requestToken("cafe@example.com", "restaurant");
		const res = await verify(token).expect(200);
		expect(res.body.user.role).toBe("restaurant");
	});

	it("signs the same user in again", async () => {
		const first = await verify(await requestToken("bob@example.com")).expect(
			200,
		);
		const second = await verify(await requestToken("bob@example.com")).expect(
			200,
		);
		expect(second.body.user.id).toBe(first.body.user.id);
	});

	it("normalizes email case and whitespace", async () => {
		await getE2eApp()
			.http.post("/auth/magic-link")
			.send({ email: "  Bob@Example.COM " })
			.expect(200);
		const { resend } = getE2eApp();
		const link = await resend.waitForLink("bob@example.com");
		const res = await verify(resend.tokenOf(link)).expect(200);
		expect(res.body.user.email).toBe("bob@example.com");
	});

	it("reports a role mismatch without sending an email", async () => {
		const { seedUser, resend } = getE2eApp();
		await seedUser({ email: "owner@example.com", role: AuthRole.User });
		const { body } = await requestLink("owner@example.com", "restaurant");
		expect(body).toEqual({ status: "role_mismatch", role: "user" });
		expect(resend.sent).toHaveLength(0);
	});

	it("accepts a token only once", async () => {
		const token = await requestToken("bob@example.com");
		await verify(token).expect(200);
		await verify(token).expect(401);
	});

	it("revokes an older link when a newer one is requested", async () => {
		const { resend } = getE2eApp();
		const first = await requestToken("bob@example.com");
		await requestLink("bob@example.com");
		const second = resend.tokenOf(resend.sent[resend.sent.length - 1]);
		expect(second).not.toBe(first);
		await verify(first).expect(401);
		await verify(second).expect(200);
	});

	it("rejects an expired token", async () => {
		const { app } = getE2eApp();
		const { token, tokenHash } = app.get(SessionTokenHelper).generate();
		await app.get(AuthTokenRepository).create({
			tokenHash,
			email: "late@example.com",
			purpose: AUTH_TOKEN_PURPOSES.MagicLink,
			intendedRole: null,
			expiresAt: new Date(Date.now() - 1000),
		});
		await verify(token).expect(401);
	});

	it("rejects an unknown token", async () => {
		await verify("0".repeat(64)).expect(401);
	});

	it("never lets a request choose admin", async () => {
		const { http } = getE2eApp();
		await http
			.post("/auth/magic-link")
			.send({ email: "evil@example.com", role: "admin" })
			.expect(400);
	});

	it.each([
		[{}],
		[{ email: "not-an-email" }],
		[{ email: "a@example.com", extra: 1 }],
		[{ email: "a@example.com", role: "guest" }],
	])("rejects invalid request body %j with 400", async (body) => {
		await getE2eApp().http.post("/auth/magic-link").send(body).expect(400);
	});

	it("rejects an invalid verify body with 400", async () => {
		await getE2eApp().http.post("/auth/magic-link/verify").send({}).expect(400);
	});

	it("rate-limits requests per email with 429", async () => {
		const { http } = getE2eApp();
		for (let i = 0; i < 3; i++) {
			await http
				.post("/auth/magic-link")
				.send({ email: "spam@example.com" })
				.expect(200);
		}
		await http
			.post("/auth/magic-link")
			.send({ email: "spam@example.com" })
			.expect(429);
		await http
			.post("/auth/magic-link")
			.send({ email: "other@example.com" })
			.expect(200);
	});
});
