import { decode } from "jsonwebtoken";
import { getE2eApp } from "../../helpers/app.harness";

describe("guest token", () => {
	it("issues an anonymous guest access token", async () => {
		const { http } = getE2eApp();
		const res = await http.post("/auth/guest").expect(200);
		expect(res.body.expiresIn).toBe(2592000);
		expect(decode(res.body.accessToken)).toMatchObject({ role: "guest" });
	});

	it("issues a different identity each time", async () => {
		const { http } = getE2eApp();
		const a = await http.post("/auth/guest").expect(200);
		const b = await http.post("/auth/guest").expect(200);
		expect((decode(a.body.accessToken) as { sub: string }).sub).not.toBe(
			(decode(b.body.accessToken) as { sub: string }).sub,
		);
	});

	it("cannot reach user-only routes", async () => {
		const { http } = getE2eApp();
		const { body } = await http.post("/auth/guest").expect(200);
		await http
			.get("/auth/me")
			.set("Authorization", `Bearer ${body.accessToken}`)
			.expect(403);
	});
});
