import { DatabaseService } from "@/app/modules/database";
import { AuthRole } from "@/domain/enums/auth-role";
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { authSessions } from "@db/schemas/auth-session.schema";
import { users } from "@db/schemas/user.schema";
import { eq } from "drizzle-orm";
import { decode } from "jsonwebtoken";
import { getE2eApp } from "../../helpers/app.harness";

const DEVICE_A = "11111111-1111-4111-8111-111111111111";
const DEVICE_B = "22222222-2222-4222-8222-222222222222";

describe("sessions and profile", () => {
	async function signIn(email = "bob@example.com", deviceId?: string) {
		const { http, resend } = getE2eApp();
		await http.post("/v1/auth/magic-link").send({ email }).expect(200);
		const token = resend.tokenOf(await resend.waitForLink(email));
		const req = http.post("/v1/auth/magic-link/verify");
		if (deviceId) req.set("X-Device-Id", deviceId);
		const res = await req.send({ token }).expect(200);
		return res.body as {
			user: { id: string };
			accessToken: string;
			refreshToken: string;
		};
	}

	function refresh(refreshToken: string, deviceId?: string) {
		const req = getE2eApp().http.post("/v1/auth/refresh");
		if (deviceId) req.set("X-Device-Id", deviceId);
		return req.send({ refreshToken });
	}

	it("rotates the refresh token: the old one stops working", async () => {
		const session = await signIn();
		const next = await refresh(session.refreshToken).expect(200);
		expect(next.body.refreshToken).not.toBe(session.refreshToken);
		expect(next.body.expiresIn).toBe(900);
		await refresh(session.refreshToken).expect(401);

		await getE2eApp()
			.http.get("/v1/users/me")
			.set("Authorization", `Bearer ${next.body.accessToken}`)
			.expect(200);
		await refresh(next.body.refreshToken).expect(200);
	});

	it("rejects an unknown refresh token with 401", async () => {
		await refresh("0".repeat(64)).expect(401);
	});

	it("rejects an expired session with 401", async () => {
		const { app } = getE2eApp();
		const user = await getE2eApp().seedUser();
		const { token, tokenHash } = app.get(SessionTokenHelper).generate();
		await app.get(AuthSessionRepository).create({
			userId: user.id,
			tokenHash,
			deviceId: null,
			userAgent: null,
			expiresAt: new Date(Date.now() - 1000),
		});
		await refresh(token).expect(401);
	});

	it("rejects an invalid refresh body with 400", async () => {
		await getE2eApp().http.post("/v1/auth/refresh").send({}).expect(400);
	});

	it("picks up a changed role on refresh", async () => {
		const session = await signIn();
		await getE2eApp()
			.app.get(DatabaseService)
			.db.update(users)
			.set({ role: AuthRole.Admin })
			.where(eq(users.id, session.user.id));
		const next = await refresh(session.refreshToken).expect(200);
		const payload = decode(next.body.accessToken) as { role: string };
		expect(payload.role).toBe("admin");
	});

	it("logout revokes the refresh token and is idempotent", async () => {
		const { http } = getE2eApp();
		const session = await signIn();
		await http
			.post("/v1/auth/logout")
			.send({ refreshToken: session.refreshToken })
			.expect(204);
		await refresh(session.refreshToken).expect(401);
		await http
			.post("/v1/auth/logout")
			.send({ refreshToken: session.refreshToken })
			.expect(204);
	});

	it("stores the device id from X-Device-Id on sign-in", async () => {
		const session = await signIn("carol@example.com", DEVICE_A);
		const [stored] = await getE2eApp()
			.app.get(DatabaseService)
			.db.select()
			.from(authSessions)
			.where(eq(authSessions.userId, session.user.id));
		expect(stored?.deviceId).toBe(DEVICE_A);
	});

	it("rejects a refresh from a different device with 401, leaving the original session usable", async () => {
		const session = await signIn("dave@example.com", DEVICE_A);
		await refresh(session.refreshToken, DEVICE_B).expect(401);
		await refresh(session.refreshToken).expect(401); // no header also mismatches
		await refresh(session.refreshToken, DEVICE_A).expect(200);
	});

	it("stores a malformed X-Device-Id header as null", async () => {
		const session = await signIn("erin@example.com", "not-a-uuid");
		const [stored] = await getE2eApp()
			.app.get(DatabaseService)
			.db.select()
			.from(authSessions)
			.where(eq(authSessions.userId, session.user.id));
		expect(stored?.deviceId).toBeNull();
	});
});
