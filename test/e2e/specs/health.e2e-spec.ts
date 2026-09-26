import { getE2eApp } from "../helpers/app.harness";

describe("health", () => {
	it("GET /health pings mongodb", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/health").expect(200);
		expect(res.body).toEqual({ status: "ok", database: "ok" });
	});

	it("GET / returns package metadata", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/").expect(200);
		expect(res.body.name).toBe("api.nearplate");
		expect(res.body.env).toBe("development");
		expect(typeof res.body.version).toBe("string");
	});
});
