---
paths:
  - "src/**/*.ts"
---

# Architecture layers

```
HTTP:  Controller → Transformer → Service → Repository / Adapter / Helper
Cron:  Subscriber → Service
```

## Controller

Handles all HTTP calls.

- Routing, guards (`@Roles(...)`), decorators, status codes.
- Put the URL prefix on the class (`@Controller("auth")`) and keep handler paths nested.
- Use `HttpStatus` from `@nestjs/common` for `@HttpCode(...)` — never raw numeric literals.
- Injects **one transformer** and **one service**.
- Never contains business logic or DB access — delegate immediately.

```typescript
@Controller("auth")
export class AuthController {
	@Post("magic-link")
	@HttpCode(HttpStatus.OK)
	public async requestMagicLink(@Body() body: unknown) {
		const input = this._transformer.toMagicLinkRequestDTO(body);
		const result = await this._service.requestMagicLink(
			input.email,
			input.role,
		);
		return this._transformer.toMagicLinkResponseDTO(result);
	}
}
```

## Transformer

One transformer per controller. Declares request/response DTOs per controller
method as `to{Action}RequestDTO` / `to{Action}ResponseDTO`.

- **Request path**: validate user input (Zod) → transform to domain types.
- **Response path**: transform domain result → response DTO; validate the outgoing shape so unnecessary fields (e.g. `ownerId`) are not sent.
- Controllers never map field names or validate bodies directly.

## Service

Performs business logic. Can call multiple repositories, adapters, and helpers.

- One service per controller; cron infrastructure grouped by domain.
- Keep public methods focused; extract related steps into **private methods** (`_` prefix).
- Throws domain HTTP exceptions (`NotFoundException`, etc.) — does not format wire responses.

## Repository

Handles all DB work for **one collection/domain only**.

- No HTTP concerns, no business rules beyond data access.
- **Scope ownership in the query filter**, not read-then-check.
- Cached unique lookups use `@DBCache`; matching writes use `@DBCacheInvalidate` (see `db-cache` rule). Never invent a parallel cache layer.
- See `database-mongoose` for Mongoose conventions.

## Helper

Global, reusable utility methods. Stateless where possible; no domain-specific business logic.

## Scheduler (subscriber)

Same role as a controller, but triggered by cron — not HTTP.

- Lives in `src/subscribers/` (registered via `src/app/subscribers.ts`).
- One subscriber class per domain file (`cleanup.subscriber.ts` → `CleanupSubscriber`).
- Each scheduled method is thin: config gate, try/catch, delegate to a service.
- Must catch errors so an unhandled rejection does not crash the process.

## Domain

Enums, types, constants and interfaces (ports) shared across layers live in `src/domain/`. No runtime logic, no DB access, no HTTP.

## Adapter

Wraps external systems (JWT, Redis, Resend email, Google token verification). Called by services and guards — not by controllers or repositories.

## Ports (`src/domain/interfaces/`)

Contracts between layers live in `src/domain/interfaces/` (types only, no runtime code).

- `crud.interface.ts` defines the owner-scoped CRUD ports: `ICRUDController`, `ICRUDService`, `ICRUDTransformer`, `ICRUDRepository` (plus `TPage<TRow>`).
- A CRUD feature's four classes **must `implements`** the matching port with the feature's own types, e.g. `OrderRepository implements ICRUDRepository<TOrder, TCreateOrderInput, TUpdateOrderInput, TListOrdersInput>`. No feature implements them yet (auth is not CRUD); use them for the next one.
- `ownerId` is always the first argument of service and repository methods: `create(ownerId, input)`, `list(ownerId, query)`, `findById(ownerId, id)`, `update(ownerId, id, input)`, `delete(ownerId, id)` (service: `get`, `remove`).
- Extra feature-specific methods (e.g. `purgeCompleted`) are added on the class beyond the port.
- Interfaces are erased at runtime: inject the concrete class with `@Inject(ClassName)`, never the interface.
- New layer contracts that more than one feature will share go in a new `src/domain/interfaces/{name}.interface.ts`; interface names use an `I` prefix.

## Conventions

- Decorate controllers, services, and repositories with `@LogClass()`.
- Use `@Inject(ClassName)` for constructor DI.
- Controllers accept `@Body() body: unknown` — never trust raw body types.
- Build partial update objects by **key presence**, never by writing `undefined`.
- Error responses are bare `{ statusCode }` — do not add message fields to HTTP errors.
- Register new providers in the barrel arrays under `src/app/`.
