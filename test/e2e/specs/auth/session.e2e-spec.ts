import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { User, type UserDocument } from "@db/schemas/user.schema";
import { getModelToken } from "@nestjs/mongoose";
import { decode } from "jsonwebtoken";
import type { Model } from "mongoose";
import { getE2eApp } from "../../helpers/app.harness";

describe("sessions and profile", () => {
	async function signIn(email = "bob@example.com") {
		const { http, resend } = getE2eApp();
		await http.post("/v1/auth/magic-link").send({ email }).expect(200);
		const token = resend.tokenOf(await resend.waitForLink(email));
		const res = await http
			.post("/v1/auth/magic-link/verify")
			.send({ token })
			.expect(200);
		return res.body as {
			user: { id: string };
			accessToken: string;
			refreshToken: string;
		};
	}

	function refresh(refreshToken: string) {
		return getE2eApp().http.post("/v1/auth/refresh").send({ refreshToken });
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
			ip: null,
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
			.app.get<Model<UserDocument>>(getModelToken(User.name))
			.updateOne({ _id: session.user.id }, { role: "admin" });
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
});
