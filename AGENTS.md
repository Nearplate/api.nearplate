# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Codex, …) working in this repository.

## Project

`api.nearplate` — Nearplate API server: zero-commission food ordering. A NestJS 10 backend with authentication (magic link + Google, refresh sessions, role-based JWTs), user profiles, restaurants with a geo location and menus. Ported from the Bun/Elysia legacy API; `../context.md` describes that original.

## Stack

- NestJS 10, TypeScript, Express
- Postgres via Drizzle ORM (`drizzle-orm/node-postgres`), with PostGIS for location; schemas in `db/schemas/`
- Redis cache for repository lookups (`RedisCacheAdapter` / `@DBCache`)
- `@nestjs/schedule` for cron (`src/subscribers/`)
- Zod for request validation and env config
- JWT access tokens, one secret per role: `admin`, `restaurant`, `user`, `guest`; opaque rotating refresh tokens
- Sign-in: magic link emailed via Resend (`ResendAdapter`, plain `fetch`) and Google via Authorization Code + PKCE (`GoogleOauthAdapter`)
- Winston logging (`@LogClass()`, trace ids, optional Loki)
- ESLint (flat config) + Prettier (tabs, 80 columns, double quotes, trailing commas)
- npm (Node >= 22)

## Path aliases

- `@/*` → `src/*`
- `@db/*` → `db/*`

## Commands

```bash
npm install
npm run start:dev       # dev server (default :8080)
npm run build           # compile
npm run lint            # eslint --fix      (lint:check in CI)
npm run format          # prettier --write  (format:check in CI)
npm run test:deps       # local Postgres (PostGIS) + Redis for e2e (docker compose)
npm run db:migrate      # apply db/migrations to DATABASE_URL
npm run test:e2e        # HTTP e2e (supertest + full AppModule)
docker compose up -d --build   # API + Postgres + Redis (see Docker)
```

Copy `.env.example` to `.env` before running locally.

## Docker

- `Dockerfile`: multi-stage (build → prod deps → runtime), Node 22 alpine, runs as `node`, healthcheck on `/health`, `CMD node dist/src/main`. `package.json` must be in the image working directory (`AppService` reads it). `db/migrations` and `drizzle.config.ts` ship in the runtime image so `npm run db:migrate` can run against it.
- `docker-compose.yml`: `api` + `postgres` (PostGIS) + `redis`. Config comes from `.env`; set `REDIS_URI=redis://redis:6379` in `.env` so the API reaches the compose Redis service; compose sets `NODE_ENV=production`. Only the API port is published. Migrations are **not** run automatically -- run `docker compose run --rm api npm run db:migrate` before the first `up`.
- `test/docker-compose.yml` is separate: just Postgres (host port 5433, PostGIS) and Redis (6380) for e2e. Keep the two independent.
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

Reference features: **restaurants** and **menu items** (owner CRUD, plus a public controller) and **auth** (magic link/Google/sessions; not CRUD).

- A CRUD feature's controller, transformer, service and repository follow the same method shapes, e.g. `RestaurantService.create/list/get/update/remove`, `RestaurantRepository.create/list/findById/update/delete` (the reference implementation; a mixed public/owner controller like `RestaurantController` has no owner `get(id)` route). The repository's create/update inputs may differ from the service's when persistence needs more than the request carries (`RestaurantRepository` takes a GeoJSON `location` and an `addressId`, the service takes `coordinates` and an `address`).
- `ownerId` comes first in service/repository methods: `create(ownerId, input)`, `list(ownerId, query)`, `findById(ownerId, id)`, `update(ownerId, id, input)`, `delete(ownerId, id)` (service: `get`, `remove`). Feature-specific extras go on the class beyond that.
- `TPage<TRow>` (`src/domain/types/page.types.ts`) is the shared paginated-list return shape (`{ items, total }`).

## Registration

New providers must be added to the barrel arrays in `src/app/`:

- `controllers.ts`, `services.ts`, `repositories.ts`, `transformers.ts`
- `guards.ts`, `adapters.ts`, `helpers.ts`, `subscribers.ts`

New Drizzle tables go in a new `db/schemas/{name}.schema.ts` and are re-exported from `db/schema.ts` (the drizzle-kit and client barrel). Follow with `npm run db:generate` to create the migration.

## Routes and domain

- **Everything is under `/v1`** except `/` and `/health` (kept unprefixed for the Docker healthcheck). The prefix, logger, tracing, access log and CORS are set up in `src/app/configure-app.ts`, used by both `main.ts` and the e2e harness — add HTTP-layer setup there, never in only one of them.
- Tables (`db/schemas/`): `users` (one role each: `admin`|`restaurant`|`user`; `firstName`, `lastName`, `isOnboarded`, `googleSub`), `addresses`, `restaurants` (`ownerId`, unique `slug`, `status`, `verificationStatus`, `addressId`→addresses, `cuisines`, `isPureVeg`, PostGIS `location` `geometry(Point,4326)`, mapped to/from GeoJSON `[lng, lat]` by `db/schemas/geo.ts`), `menu_items` (`restaurantId`, `ownerId`, `priceInPaise`, `foodType`, `isAvailable`, `location`), `restaurant_documents` and `restaurant_kyc` (onboarding, see below), plus `auth_tokens` / `auth_sessions`. Relations (FKs): users 1—N restaurants 1—N menu_items (`ON DELETE CASCADE`); restaurants N—1 addresses (`ON DELETE RESTRICT`).
- Controllers: `users/me` (any signed-in role) and **one** `restaurants` controller for everything restaurant- and menu-related. There is no `/owner` prefix: it mixes public routes (`nearby`, `:slug`, `:slug/menu`) with owner routes (create, `mine`, update, `:id/status`, delete, and menu items at `:id/menu/items[/:itemId[/availability]]`). **`@Roles(AuthRole.Restaurant)` is on each owner handler**, not the class. Declare `mine` and `nearby` before `:slug`. `RestaurantService` also owns the menu logic (no separate menu service); `MenuItemRepository` scopes every owner query by both `ownerId` and `restaurant`, so an item under the wrong restaurant is a 404.
- Only `restaurant` accounts create restaurants/menus; there is no runtime role promotion. Sign-up `role` decides the account type.
- **Money is integer paise** (`priceInPaise`), never a float. Cuisines are stored lowercase.
- Denormalized fields must be kept in sync: `MenuItem.ownerId` (never changes) and `MenuItem.location` (`RestaurantService.update` rewrites it when coordinates change).
- `RestaurantService.create`/`update`/`remove` run inside a Postgres transaction (`DatabaseService.transaction`), so a failure partway through leaves nothing behind -- no manual compensation.
- `GET restaurants/nearby` uses PostGIS `ST_DWithin`/`ST_Distance` on `location::geography` (`radiusKm` ≤ 25, approved and online only, nearest first).
- Slugs come from the name (`SlugHelper`), retry with a random suffix on collision, and never change on rename.

## Restaurant verification

- Lifecycle (`restaurants.verificationStatus`, `RestaurantVerificationStatus`): `draft` → (owner) `POST restaurants/:id/submit` → `pending_review` → (admin) `approve` → `approved` or `reject {reason}` → `rejected`; a `rejected` restaurant can be resubmitted (clears `rejectionReason`). Other transitions are 409 (`Errors.restaurantVerificationTransitionNotAllowed`); transitions are conditional updates (`RestaurantRepository.updateVerification`), so concurrent ones cannot both win. `submittedAt`/`reviewedAt` record when.
- Customers only see `approved` restaurants: `RestaurantRepository.nearby`, `findBySlug` (`:slug`, `:slug/menu`) and `findByIdPublic` (carts, checkout, `POST /orders`) filter on it, so anything else is a 404. `CartService` `canCheckout` also requires approval.
- Owners keep full access to their own restaurant and menu in every state (owner queries are owner-scoped, not verification-scoped), so a menu can be prepared while pending. Going `online` before approval is 409 (`Errors.restaurantNotApproved`); new restaurants start `offline`. The migration backfilled existing restaurants to `approved`.
- Owner responses (`TOwnerRestaurantResponse`) include `verificationStatus` and `rejectionReason`; public responses never do. Admin responses (`TAdminRestaurantResponse`) add `ownerId`, `submittedAt`, `reviewedAt`.
- `AdminController` (prefix `admin`, holds every admin route; `@Roles(AuthRole.Admin)` on each handler) with `AdminTransformer` and `AdminService`. Restaurant review lives at `admin/restaurants`: `GET` (queue, `?status=` default `pending_review`, oldest submission first, paginated), `GET :id`, `POST :id/approve`, `POST :id/reject {reason}`.
- Submitting requires complete onboarding data: `RestaurantService._assertReadyForReview` asks `RestaurantOnboardingService.listMissingForReview` and returns 409 `restaurantIncomplete` listing every document type not yet confirmed (pending uploads do not count) and every missing KYC field by wire name.
- Onboarding data (KYC and documents) is **locked outside `draft`/`rejected`**: writes during `pending_review` or after `approved` are 409 `restaurantOnboardingLocked`, so admins review exactly what was submitted and verified KYC cannot be swapped silently. Reads stay open in every state. Menu and profile edits are never locked.
- Tests: `seedRestaurant(ownerId, overrides?, state?)` defaults to `approved` + `online`; pass `state` (`verificationStatus`, `status`, `rejectionReason`) to seed another state. `seedOnboarding(ownerId, restaurantId)` saves complete KYC and six uploaded documents so submit passes.

## Restaurant onboarding (KYC and documents)

- Onboarding routes live on `RestaurantController` and are validated by `RestaurantTransformer` (DTOs in `restaurant.dto.ts`); the logic is in `RestaurantOnboardingService`, kept apart from `RestaurantService` only because merging would push that file well past the 800-line ceiling. It is also used by `AdminService`, `RestaurantService` (submit check) and `UploadCleanupSubscriber`. Every route is `@Roles(AuthRole.Restaurant)` and owner-scoped (foreign ids are 404).
- **Documents** (`restaurant_documents`, one row per restaurant + type: `aadhaar_front`, `aadhaar_back`, `pan_front`, `pan_back`, `fssai_certificate`, `bank_proof`) live in the **private** documents bucket (`S3_DOCUMENTS_BUCKET`) via `S3StorageAdapter` with `bucket = "documents"` (one adapter, one client for both buckets; documents never get a `publicUrl`, only `presignedGetUrl`). Flow mirrors image uploads: `POST :id/documents {type, contentType, size}` (201; pdf/jpeg/png, ≤ 5 MB) → browser POSTs to S3 → `POST :id/documents/:type/confirm` (200; `headObject`, 409 `restaurantDocumentUploadMismatch` if missing, wrong type or over the cap). `GET :id/documents` lists them with presigned GET URLs (`DOCUMENT_URL_TTL_SECONDS`, uploaded only); `DELETE :id/documents/:type` (204). An unknown `:type` is 404.
- Object keys are server-generated: `{restaurantId}_{restaurantName}_{type}.{ext}`, the name with whitespace → `_` and everything outside `[A-Za-z0-9_-]` stripped. Re-uploading a type resets its row to `pending`; if the key changed (rename, other file type) the old object is deleted in the background. `UploadCleanupSubscriber.sweepExpiredDocumentUploads` sweeps pending rows past `expiresAt`.
- **KYC** (`restaurant_kyc`, one row per restaurant, every field nullable): `GET :id/kyc` and `PATCH :id/kyc` (partial drafts merged by key presence; PAN `AAAAA9999A`, FSSAI 14 digits, IFSC `AAAA0NNNNNN`, account number 9-18 digits, holder/bank name). PAN and account number are AES-256-GCM encrypted at rest by `EncryptionHelper` (`KYC_ENCRYPTION_KEY`, 32 bytes base64, required at boot; changing it makes stored values unreadable). Owners get them masked (`XXXXX1234F`, `XXXXXXXX9012`); `GET admin/restaurants/:id` returns them in full plus every document's download URL.
- Log scrubbing (`logger.scrub.ts`, applied once at the winston logger level) redacts PAN- and IFSC-shaped strings and 9-18 digit runs from messages and stacks. Never log KYC values yourself.

## Uploads

- Logos, banners and menu-item photos upload straight from the browser to a public S3 bucket via a presigned POST; the API never sees the file bytes. Restaurant flow: `POST :id/uploads {kind, contentType, size}` (`kind` is `logo`|`banner`) → 201 with a presigned POST (`url`, `fields`, `publicUrl`, `expiresAt`) and a pending `uploads` row → browser POSTs the file to S3 → `POST :id/uploads/:uploadId/confirm` (200) verifies the object via `headObject` (409 if missing/mismatched), then in one transaction deletes the pending row and sets `logoUrl`/`bannerUrl`. Menu-item photos mirror this at `POST/DELETE :id/menu/items/:itemId/uploads[/:uploadId[/confirm]]` -- no `kind` in the body, since an item has one photo slot -- and confirm sets the item's `imageUrl`. All routes are `@Roles(AuthRole.Restaurant)`.
- `uploads` table (`db/schemas/upload.schema.ts`): pending uploads only, `ownerId`→users, `restaurantId`→restaurants and `menuItemId`→menu_items (both `ON DELETE set null`, so a row outlives a deleted restaurant/item and still gets swept), `kind` enum `logo|banner|menu_item`, unique `objectKey`, `contentType`, `expiresAt` (indexed), `createdAt`.
- `S3StorageAdapter` (`src/adapters/s3-storage.adapter.ts`) wraps `createPresignedPost`/`headObject`/`deleteObjects`/`publicUrl`/`keyFromPublicUrl`; `keyFromPublicUrl` returns `null` for URLs that are not ours, so an owner-pasted external URL is never deleted. Keys are server-generated (`restaurants/{restaurantId}/{kind}/{uuid}.{ext}`, or `restaurants/{restaurantId}/menu-items/{itemId}/{uuid}.{ext}` for a menu item) — the client never supplies a key or filename.
- Cleanup runs in three places, all via `RestaurantService`: `cancelImageUpload`/`cancelMenuItemImageUpload` (explicit cancel, 204), `confirmImageUpload`/`confirmMenuItemImageUpload`/`update`/`updateMenuItem`/`remove`/`removeMenuItem` (replaced or removed image deleted from S3 through `BackgroundJobHelper` after the transaction commits), and `UploadCleanupSubscriber` (`sweepExpiredUploads`, every 10 min) for abandoned pending rows past `expiresAt`.

## Auth

- **Roles**: `admin`, `restaurant`, `user` (stored in `users`, one account per email, one role) and `guest` (anonymous signed token, no row). One JWT secret per role; `admin` is **never** assignable through the API — set it in the database.
- **Magic link**: `POST /v1/auth/magic-link {email, role?}` → emailed link to the **web app** (`WEB_APP_BASE_URL` + `WEB_APP_MAGIC_PATH`) → web app POSTs the token to `POST /v1/auth/magic-link/verify`. No `RESEND_API_KEY` in development = the link is logged; **required in production** (config fails to boot without it).
- **Google**: `GET /v1/auth/google?role=` 302s to Google with a PKCE `code_challenge`; the web app posts the result to `POST /v1/auth/google/verify {code, state}`, which burns the one-time `state` (an `oauth_state` row in `auth_tokens`), exchanges the code via `GoogleOauthAdapter`, and verifies the returned ID token against `GOOGLE_CLIENT_ID` (required at boot, along with `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI`).
- **Sessions**: short-lived access JWT + rotating opaque refresh token (`POST /v1/auth/refresh`, `POST /v1/auth/logout`); `GET/PATCH /v1/users/me`, `POST /v1/users/me/onboard`; `POST /v1/auth/guest`.
- Login results carry a `status` in the 200 body (`authenticated` | `role_mismatch` | `sent`) because most error bodies are bare `{ statusCode }`. Sign-up `role` (`user` | `restaurant`) applies only to new accounts; an existing account with another role returns `role_mismatch`.
- `@Roles(AuthRole.User, ...)` applies `AccessTokenGuard` (put it on the **class** when every route needs the same roles, e.g. the owner controllers): 401 = no/invalid/expired token, 403 = valid token but role not allowed. Read the caller with `@AuthUser()` → `{ id, role }` (`id` = JWT `sub`). Never take user/owner ids from the request.
- Another owner's resource → **404**, enforced by scoping the repository query.
- Magic-link tokens and refresh sessions are single-use (atomic `delete … returning`), stored only as sha256 hashes, and filtered by `expiresAt` on every read; there is no TTL index in Postgres, so `AuthCleanupSubscriber` sweeps expired rows hourly.
- Sessions record a client-generated `deviceId` (from `X-Device-Id`) instead of an IP; `AuthSessionRepository.consumeByHash` scopes refresh-token rotation to that device.

## API contract

- Wire JSON is **camelCase**. Error bodies are bare `{ statusCode }` unless the exception is built from the `Errors` catalogue (`src/app/constants/errors.ts`), e.g. `throw new BadRequestException(Errors.orderNotFound(id))`, which adds `code` and `message`: `{ statusCode, code, message }`. Add new client-facing messages there; free-form exception strings and 500s are never sent (`ExceptionFilter`).
- Partial updates are built by **key presence**; empty PATCH bodies are 400.
- CORS is pinned to `CORS_ORIGIN`; add new HTTP verbs in `src/main.ts`.
- New env vars go in `src/app/modules/config/config.ts` (Zod) and `.env.example`.

## Testing

Tests are e2e only (`test/e2e/`); no unit tests under `src/`. A behavior change is incomplete until the matching spec under `test/e2e/specs/` changes with it. The suite uses the `api_nearplate_test` database (Postgres on host port 5433) and a Redis on host port 6380. `global-setup.cjs` runs `db/migrations` before the first test. Email (Resend), Google (`FakeGoogleOauthAdapter`) and S3 (`s3`, one fake holding both the public and the private documents bucket) are always faked in the harness (`test/e2e/helpers/fakes/`); use `seedUser()` for existing accounts and `seedRestaurant()` / `seedMenuItem()` / `seedOnboarding()` for domain data.

## Conventions

- JSDoc on every method; `@LogClass()` on controllers, services, repositories, adapters.
- Money in integer paise; coordinates are `[lng, lat]`; query-string numbers are parsed with the string→Number pipe (never `z.coerce.number()`, where `Number("")` is 0).
- `T` prefix for types, `I` prefix for interfaces (ports), `_` prefix for private members, kebab-case files with layer suffix.
- **Injected dependencies are named after their class**: `_` + the class name in camelCase, e.g. `@Inject(BackgroundJobHelper) private readonly _backgroundJobHelper: BackgroundJobHelper`, `_resendAdapter`, `_googleOauthAdapter`, `_redisCacheAdapter`, `_authTokenRepository`, `_authTransformer`, `_databaseService`. No shortened names (`_resend`, `_redis`, `_service`, `_db`).
- Immutability: return new objects, do not mutate inputs.

## Scope

- Minimize diff scope; match existing patterns in surrounding files.
- Do not commit `.env` or secrets. Do not edit `dist/` (build output).

## Rules

Detailed, path-scoped conventions live in `.claude/rules/` (Claude Code). Update them when conventions change; `testing` is always-on.
