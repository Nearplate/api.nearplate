# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, …) working in this repository.

## Project

`api.nearplate` — Nearplate API server. A NestJS 10 boilerplate with a working, owner-scoped todo CRUD as the reference feature.

## Stack

- NestJS 10, TypeScript, Express
- MongoDB via Mongoose (`@nestjs/mongoose`); schemas in `db/schemas/`
- Redis cache for repository lookups (`RedisCacheAdapter` / `@DBCache`)
- `@nestjs/schedule` for cron (`src/subscribers/`)
- Zod for request validation and env config
- JWT access tokens, one secret per role: `admin`, `restaurant`, `user`, `guest`
- Winston logging (`@LogClass()`, trace ids, optional Loki)
- ESLint (flat config) + Prettier (tabs, 80 columns, double quotes, trailing commas)
- npm (Node >= 22)

## Path aliases

- `@/*` → `src/*`
- `@db/*` → `db/*`

## Commands

```bash
npm install
npm run start:dev       # dev server (default :3000)
npm run build           # compile
npm run lint            # eslint --fix      (lint:check in CI)
npm run format          # prettier --write  (format:check in CI)
npm run test:deps       # local MongoDB + Redis for e2e (docker compose)
npm run test:e2e        # HTTP e2e (supertest + full AppModule)
docker compose up -d --build   # API + MongoDB + Redis (see Docker)
```

Copy `.env.example` to `.env` before running locally.

## Docker

- `Dockerfile`: multi-stage (build → prod deps → runtime), Node 22 alpine, runs as `node`, healthcheck on `/health`, `CMD node dist/src/main`. `package.json` must be in the image working directory (`AppService` reads it).
- `docker-compose.yml`: `api` + `mongo` + `redis`. Config comes from `.env`; compose overrides `MONGODB_URI` / `REDIS_HOST` to the service hostnames and sets `NODE_ENV=production`. Only the API port is published.
- `test/docker-compose.yml` is separate: just MongoDB (27017) and Redis (6380) for e2e. Keep the two independent.
- A new required env var goes in `.env.example`; compose picks it up via `env_file`.

## Releases and changelog

- Publishing a GitHub release (tag `v1.2.3` or `1.2.3`) runs `.github/workflows/release.yml`: it sets the version in `package.json` / `package-lock.json` from the tag, prepends a section to `CHANGELOG.md` (commits since the previous tag, via `.github/scripts/update-changelog.sh`), and pushes a `chore: release <tag>` commit to the release's target branch.
- Create releases from a branch (e.g. `main`), not a commit SHA. Do **not** edit the version or `CHANGELOG.md` by hand.
- The changelog is built from commit subjects, so use conventional commits (`feat:`, `fix:`, `refactor:`, …). `CHANGELOG.md` is in `.prettierignore` because it is generated.

## Architecture

```
HTTP:  Controller → Transformer (Zod) → Service → Repository / Adapter / Helper
Cron:  Subscriber → Service
```

- **Controller** — routing, `@Roles(...)`, status codes. No logic.
- **Transformer** — validates input (Zod), maps domain ↔ camelCase wire DTOs. One per controller.
- **Service** — business logic; throws `NotFoundException` etc.
- **Repository** — all DB access for one collection; owner scoping in the filter; `@DBCache`.
- **Adapter** — external systems (JWT, Redis). **Helper** — stateless utilities.
- **Subscriber** — cron schedule only; thin, catches errors, delegates to a service.
- **Ports** — `src/domain/interfaces/`: contracts each layer implements (see below).

Reference feature: `todos` (`src/controllers/todo.controller.ts` and its transformer/service/repository/subscriber, `db/schemas/todo.schema.ts`), implementing the CRUD ports.

## Ports (`src/domain/interfaces/`)

Layer contracts are interfaces in `src/domain/interfaces/` (types only).

- `crud.interface.ts`: `ICRUDController`, `ICRUDService`, `ICRUDTransformer`, `ICRUDRepository` (+ `TPage<TRow>`) for owner-scoped CRUD.
- A CRUD feature's controller, transformer, service and repository **must `implements`** the matching port, e.g. `TodoService implements ICRUDService<TTodo, TCreateTodoInput, TUpdateTodoInput, TListTodosInput>`. Copy the `todo` files for a new feature.
- `ownerId` comes first in service/repository methods: `create(ownerId, input)`, `list(ownerId, query)`, `findById(ownerId, id)`, `update(ownerId, id, input)`, `delete(ownerId, id)` (service: `get`, `remove`). Feature-specific extras go on the class beyond the port.
- Interfaces are erased at runtime — inject the concrete class with `@Inject(ClassName)`.
- Shared contracts for other layers go in a new `{name}.interface.ts` beside it.

## Registration

New providers must be added to the barrel arrays in `src/app/`:

- `controllers.ts`, `services.ts`, `repositories.ts`, `transformers.ts`
- `guards.ts`, `adapters.ts`, `helpers.ts`, `subscribers.ts`

New Mongoose models go in `db/models.ts` (`Models`).

## Auth

- `@Roles(AuthRole.User, ...)` on a controller/handler applies `AccessTokenGuard`. 401 = no/invalid/expired token, 403 = valid token but role not allowed.
- Read the caller with `@AuthUser()` → `{ id, role }` (`id` = JWT `sub`). Never take owner ids from the request.
- Another owner's resource → **404**, enforced by scoping the repository query.
- No login routes yet; mint tokens with `JwtAdapter.signAccessToken(sub, role)` (tests: `authHeader(role, sub)`).

## API contract

- Wire JSON is **camelCase**. Error bodies are bare `{ statusCode }` — no message fields.
- Partial updates are built by **key presence**; empty PATCH bodies are 400.
- CORS is pinned to `CORS_ORIGIN`; add new HTTP verbs in `src/main.ts`.
- New env vars go in `src/app/modules/config/config.ts` (Zod) and `.env.example`.

## Testing

Tests are e2e only (`test/e2e/`); no unit tests under `src/`. A behavior change is incomplete until the matching spec under `test/e2e/specs/` changes with it. The suite uses the `api_nearplate_test` database and a Redis on host port 6380.

## Conventions

- JSDoc on every method; `@LogClass()` on controllers, services, repositories, adapters.
- `T` prefix for types, `I` prefix for interfaces (ports), `_` prefix for private members, kebab-case files with layer suffix.
- Immutability: return new objects, do not mutate inputs.

## Scope

- Minimize diff scope; match existing patterns in surrounding files.
- Do not commit `.env` or secrets. Do not edit `dist/` (build output).

## Rules

Detailed, path-scoped conventions live in `.claude/rules/` (Claude Code) and `.cursor/rules/` (Cursor). They carry the same content — **update both when conventions change**. `testing` is always-on.
