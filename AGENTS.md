# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, …) working in this repository.

## Project

`api.nearplate` — Nearplate API server. A NestJS 10 boilerplate with real authentication (magic link + Google, refresh sessions, role-based JWTs) as the reference feature.

## Stack

- NestJS 10, TypeScript, Express
- MongoDB via Mongoose (`@nestjs/mongoose`); schemas in `db/schemas/`
- Redis cache for repository lookups (`RedisCacheAdapter` / `@DBCache`)
- `@nestjs/schedule` for cron (`src/subscribers/`)
- Zod for request validation and env config
- JWT access tokens, one secret per role: `admin`, `restaurant`, `user`, `guest`; opaque rotating refresh tokens
- Sign-in: magic link emailed via Resend (`ResendAdapter`, plain `fetch`) and Google ID-token verification (`GoogleAuthAdapter`)
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
- Compose runs with `NODE_ENV=production`, so `.env` must define `RESEND_API_KEY` or the API refuses to start.

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

Reference feature: **auth** (`src/controllers/auth.controller.ts`, `auth.transformer.ts`, `auth.service.ts` + `session.service.ts`, `user` / `auth-token` / `auth-session` repositories, schemas in `db/schemas/`). Auth is not a CRUD feature, so it does not implement the ICRUD ports.

## Ports (`src/domain/interfaces/`)

Layer contracts are interfaces in `src/domain/interfaces/` (types only).

- `crud.interface.ts`: `ICRUDController`, `ICRUDService`, `ICRUDTransformer`, `ICRUDRepository` (+ `TPage<TRow>`) for owner-scoped CRUD.
- A CRUD feature's controller, transformer, service and repository **must `implements`** the matching port, e.g. `OrderService implements ICRUDService<TOrder, TCreateOrderInput, TUpdateOrderInput, TListOrdersInput>`. No feature implements them yet; use them for the next CRUD feature.
- `ownerId` comes first in service/repository methods: `create(ownerId, input)`, `list(ownerId, query)`, `findById(ownerId, id)`, `update(ownerId, id, input)`, `delete(ownerId, id)` (service: `get`, `remove`). Feature-specific extras go on the class beyond the port.
- Interfaces are erased at runtime — inject the concrete class with `@Inject(ClassName)`.
- Shared contracts for other layers go in a new `{name}.interface.ts` beside it.

## Registration

New providers must be added to the barrel arrays in `src/app/`:

- `controllers.ts`, `services.ts`, `repositories.ts`, `transformers.ts`
- `guards.ts`, `adapters.ts`, `helpers.ts`, `subscribers.ts`

New Mongoose models go in `db/models.ts` (`Models`).

## Auth

- **Roles**: `admin`, `restaurant`, `user` (stored in `users`, one account per email, one role) and `guest` (anonymous signed token, no row). One JWT secret per role; `admin` is **never** assignable through the API — set it in the database.
- **Magic link**: `POST /auth/magic-link {email, role?}` → emailed link to the **web app** (`WEB_APP_BASE_URL` + `WEB_APP_MAGIC_PATH`) → web app POSTs the token to `POST /auth/magic-link/verify`. No `RESEND_API_KEY` in development = the link is logged; **required in production** (config fails to boot without it).
- **Google**: `POST /auth/google {idToken, role?}` (the client gets the ID token; API verifies it against `GOOGLE_CLIENT_IDS`; unset = 501).
- **Sessions**: short-lived access JWT + rotating opaque refresh token (`POST /auth/refresh`, `POST /auth/logout`); `GET/PATCH /auth/me`; `POST /auth/guest`.
- Login results carry a `status` in the 200 body (`authenticated` | `role_mismatch` | `sent`) because error bodies are bare `{ statusCode }`. Sign-up `role` (`user` | `restaurant`) applies only to new accounts; an existing account with another role returns `role_mismatch`.
- `@Roles(AuthRole.User, ...)` applies `AccessTokenGuard`: 401 = no/invalid/expired token, 403 = valid token but role not allowed. Read the caller with `@AuthUser()` → `{ id, role }` (`id` = JWT `sub`). Never take user/owner ids from the request.
- Another owner's resource → **404**, enforced by scoping the repository query.
- Magic-link tokens and refresh sessions are single-use (atomic `findOneAndDelete`), stored only as sha256 hashes, and expire via MongoDB TTL indexes.
- Behind a proxy enable `trust proxy` in `main.ts` so session IPs are the client's.

## API contract

- Wire JSON is **camelCase**. Error bodies are bare `{ statusCode }` — no message fields.
- Partial updates are built by **key presence**; empty PATCH bodies are 400.
- CORS is pinned to `CORS_ORIGIN`; add new HTTP verbs in `src/main.ts`.
- New env vars go in `src/app/modules/config/config.ts` (Zod) and `.env.example`.

## Testing

Tests are e2e only (`test/e2e/`); no unit tests under `src/`. A behavior change is incomplete until the matching spec under `test/e2e/specs/` changes with it. The suite uses the `api_nearplate_test` database and a Redis on host port 6380. Email (Resend) and Google are always faked in the harness (`test/e2e/helpers/fakes/`); use `seedUser()` for existing accounts.

## Conventions

- JSDoc on every method; `@LogClass()` on controllers, services, repositories, adapters.
- `T` prefix for types, `I` prefix for interfaces (ports), `_` prefix for private members, kebab-case files with layer suffix.
- **Injected dependencies are named after their class**: `_` + the class name in camelCase, e.g. `@Inject(BackgroundJobHelper) private readonly _backgroundJobHelper: BackgroundJobHelper`, `_resendAdapter`, `_googleAuthAdapter`, `_redisCacheAdapter`, `_authTokenRepository`, `_authTransformer`. No shortened names (`_resend`, `_redis`, `_service`). Exception: Mongoose `@InjectModel` fields are `_model` and `@InjectConnection` is `_connection`.
- Immutability: return new objects, do not mutate inputs.

## Scope

- Minimize diff scope; match existing patterns in surrounding files.
- Do not commit `.env` or secrets. Do not edit `dist/` (build output).

## Rules

Detailed, path-scoped conventions live in `.claude/rules/` (Claude Code). Update them when conventions change; `testing` is always-on.
