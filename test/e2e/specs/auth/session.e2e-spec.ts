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
		await http.post("/auth/magic-link").send({ email }).expect(200);
		const token = resend.tokenOf(await resend.waitForLink(email));
		const res = await http
			.post("/auth/magic-link/verify")
			.send({ token })
			.expect(200);
		return res.body as {
			user: { id: string };
			accessToken: string;
			refreshToken: string;
		};
	}

	function refresh(refreshToken: string) {
		return getE2eApp().http.post("/auth/refresh").send({ refreshToken });
	}

	it("rotates the refresh token: the old one stops working", async () => {
		const session = await signIn();
		const next = await refresh(session.refreshToken).expect(200);
		expect(next.body.refreshToken).not.toBe(session.refreshToken);
		expect(next.body.expiresIn).toBe(900);
		await refresh(session.refreshToken).expect(401);

		await getE2eApp()
			.http.get("/auth/me")
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
		await getE2eApp().http.post("/auth/refresh").send({}).expect(400);
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
			.post("/auth/logout")
			.send({ refreshToken: session.refreshToken })
			.expect(204);
		await refresh(session.refreshToken).expect(401);
		await http
			.post("/auth/logout")
			.send({ refreshToken: session.refreshToken })
			.expect(204);
	});

	it("GET /auth/me returns the profile without internals", async () => {
		const { http } = getE2eApp();
		const session = await signIn();
		const res = await http
			.get("/auth/me")
			.set("Authorization", `Bearer ${session.accessToken}`)
			.expect(200);
		expect(Object.keys(res.body).sort()).toEqual([
			"avatarUrl",
			"createdAt",
			"email",
			"id",
			"name",
			"role",
		]);
	});

	it("PATCH /auth/me updates the profile and later reads see it", async () => {
		const { http } = getE2eApp();
		const session = await signIn();
		const auth = `Bearer ${session.accessToken}`;
		await http.get("/auth/me").set("Authorization", auth).expect(200);
		const res = await http
			.patch("/auth/me")
			.set("Authorization", auth)
			.send({ name: "Bobby", avatarUrl: "https://example.com/b.png" })
			.expect(200);
		expect(res.body).toMatchObject({
			name: "Bobby",
			avatarUrl: "https://example.com/b.png",
		});
		const again = await http.get("/auth/me").set("Authorization", auth);
		expect(again.body.name).toBe("Bobby");
	});

	it.each([
		[{}],
		[{ name: "" }],
		[{ avatarUrl: "not a url" }],
		[{ role: "admin" }],
	])("rejects invalid PATCH body %j with 400", async (body) => {
		const { http } = getE2eApp();
		const session = await signIn();
		await http
			.patch("/auth/me")
			.set("Authorization", `Bearer ${session.accessToken}`)
			.send(body)
			.expect(400);
	});

	it("returns 401 for a valid token whose user was deleted", async () => {
		const { http, seedUser, app } = getE2eApp();
		const user = await seedUser();
		await app
			.get<Model<UserDocument>>(getModelToken(User.name))
			.deleteOne({ _id: user.id });
		await http
			.get("/auth/me")
			.set("Authorization", `Bearer ${user.accessToken}`)
			.expect(401);
	});
});
