import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { getE2eApp } from "../helpers/app.harness";

describe("health", () => {
	it("GET /health pings the database, redis and storage", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/health").expect(200);
		expect(res.body).toEqual({
			status: "ok",
			database: "ok",
			redis: "ok",
			storage: "ok",
		});
	});

	it("GET /health reports error when redis is unreachable", async () => {
		const { http, app } = getE2eApp();
		const spy = jest
			.spyOn(app.get(RedisCacheAdapter), "ping")
			.mockRejectedValueOnce(new Error("connection refused"));
		const res = await http.get("/health").expect(200);
		spy.mockRestore();
		expect(res.body).toEqual({
			status: "error",
			database: "ok",
			redis: "error",
			storage: "ok",
		});
	});

	it("GET / returns package metadata", async () => {
		const { http } = getE2eApp();
		const res = await http.get("/").expect(200);
		expect(res.body.name).toBe("api.nearplate");
		expect(res.body.env).toBe("development");
		expect(typeof res.body.version).toBe("string");
	});
});
