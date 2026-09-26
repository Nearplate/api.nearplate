import { AuthRole } from "@/domain/enums/auth-role";
import { getE2eApp } from "../../helpers/app.harness";

const MISSING_ID = "64b7f0c2a1b2c3d4e5f60718";

describe("todos", () => {
	async function createTodo(
		auth: string,
		body: object = { title: "Buy milk" },
	) {
		const { http } = getE2eApp();
		const res = await http
			.post("/todos")
			.set("Authorization", auth)
			.send(body)
			.expect(201);
		return res.body as {
			id: string;
			title: string;
			description: string | null;
			completed: boolean;
			createdAt: string;
			updatedAt: string;
		};
	}

	it("creates a todo with defaults and hides ownerId", async () => {
		const { authHeader } = getE2eApp();
		const todo = await createTodo(authHeader(AuthRole.User, "alice"));
		expect(todo).toMatchObject({
			title: "Buy milk",
			description: null,
			completed: false,
		});
		expect(todo).not.toHaveProperty("ownerId");
		expect(new Date(todo.createdAt).toISOString()).toBe(todo.createdAt);
	});

	it.each([
		[{ title: "" }],
		[{ title: "   " }],
		[{}],
		[{ title: "x", extra: 1 }],
		[{ title: "x".repeat(201) }],
	])("rejects invalid create body %j with 400", async (body) => {
		const { http, authHeader } = getE2eApp();
		await http
			.post("/todos")
			.set("Authorization", authHeader(AuthRole.User))
			.send(body)
			.expect(400);
	});

	it("lists newest first, filters by completed, and paginates", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.User, "alice");
		const first = await createTodo(auth, { title: "first" });
		await createTodo(auth, { title: "second" });
		await http
			.patch(`/todos/${first.id}`)
			.set("Authorization", auth)
			.send({ completed: true })
			.expect(200);

		const all = await http.get("/todos").set("Authorization", auth).expect(200);
		expect(all.body.total).toBe(2);
		expect(all.body.items.map((t: { title: string }) => t.title)).toEqual([
			"second",
			"first",
		]);

		const done = await http
			.get("/todos?completed=true")
			.set("Authorization", auth)
			.expect(200);
		expect(done.body.total).toBe(1);
		expect(done.body.items[0].id).toBe(first.id);

		const page = await http
			.get("/todos?limit=1&offset=1")
			.set("Authorization", auth)
			.expect(200);
		expect(page.body.items).toHaveLength(1);
		expect(page.body.total).toBe(2);
	});

	it.each(["limit=0", "limit=101", "offset=-1", "completed=maybe"])(
		"rejects invalid list query %s with 400",
		async (qs) => {
			const { http, authHeader } = getE2eApp();
			await http
				.get(`/todos?${qs}`)
				.set("Authorization", authHeader(AuthRole.User))
				.expect(400);
		},
	);

	it("gets, updates and deletes a todo", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.Restaurant, "r1");
		const todo = await createTodo(auth);

		const got = await http
			.get(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.expect(200);
		expect(got.body.id).toBe(todo.id);

		const updated = await http
			.patch(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.send({ title: "Buy oat milk", description: "2L", completed: true })
			.expect(200);
		expect(updated.body).toMatchObject({
			title: "Buy oat milk",
			description: "2L",
			completed: true,
		});

		await http
			.delete(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.expect(204);
		await http.get(`/todos/${todo.id}`).set("Authorization", auth).expect(404);
	});

	it("serves fresh data after an update (cache invalidation)", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.User, "alice");
		const todo = await createTodo(auth, { title: "before" });

		await http.get(`/todos/${todo.id}`).set("Authorization", auth).expect(200);
		await http
			.patch(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.send({ title: "after" })
			.expect(200);
		const res = await http
			.get(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.expect(200);
		expect(res.body.title).toBe("after");
	});

	it("does not keep serving a deleted todo from cache", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.User, "alice");
		const todo = await createTodo(auth);
		await http.get(`/todos/${todo.id}`).set("Authorization", auth).expect(200);
		await http
			.delete(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.expect(204);
		await http.get(`/todos/${todo.id}`).set("Authorization", auth).expect(404);
	});

	it("rejects an empty PATCH body with 400", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.User, "alice");
		const todo = await createTodo(auth);
		await http
			.patch(`/todos/${todo.id}`)
			.set("Authorization", auth)
			.send({})
			.expect(400);
	});

	it("returns 404 for a malformed or unknown id", async () => {
		const { http, authHeader } = getE2eApp();
		const auth = authHeader(AuthRole.User, "alice");
		for (const id of ["not-an-id", MISSING_ID]) {
			await http.get(`/todos/${id}`).set("Authorization", auth).expect(404);
			await http
				.patch(`/todos/${id}`)
				.set("Authorization", auth)
				.send({ completed: true })
				.expect(404);
			await http.delete(`/todos/${id}`).set("Authorization", auth).expect(404);
		}
	});

	it("isolates owners: another owner gets 404 and cannot see or change it", async () => {
		const { http, authHeader } = getE2eApp();
		const alice = authHeader(AuthRole.User, "alice");
		const bob = authHeader(AuthRole.User, "bob");
		const todo = await createTodo(alice, { title: "alice only" });
		// Warm the cache as the owner, then probe as the other owner.
		await http.get(`/todos/${todo.id}`).set("Authorization", alice).expect(200);

		await http.get(`/todos/${todo.id}`).set("Authorization", bob).expect(404);
		await http
			.patch(`/todos/${todo.id}`)
			.set("Authorization", bob)
			.send({ title: "hijacked" })
			.expect(404);
		await http
			.delete(`/todos/${todo.id}`)
			.set("Authorization", bob)
			.expect(404);

		const bobList = await http
			.get("/todos")
			.set("Authorization", bob)
			.expect(200);
		expect(bobList.body).toEqual({ items: [], total: 0 });

		const still = await http
			.get(`/todos/${todo.id}`)
			.set("Authorization", alice)
			.expect(200);
		expect(still.body.title).toBe("alice only");
	});
});
