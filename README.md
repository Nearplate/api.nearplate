# api.nearplate

Nearplate API server — NestJS 10 + Postgres (Drizzle ORM, PostGIS), Redis cache, JWT roles (`admin`, `restaurant`, `user`, `guest`), with sign-in by magic link (Resend) and Google.

Conventions and architecture: [AGENTS.md](AGENTS.md).

## Prerequisites

- Node.js >= 22, npm
- Docker (for local Postgres + Redis)

## Setup

```bash
cp .env.example .env
npm install
npm run test:deps       # Postgres (PostGIS) :5433, Redis :6380 (test stack)
npm run db:migrate       # applies db/migrations against DATABASE_URL
npm run start:dev
```

`.env.example` points at Postgres on `localhost:5432` and Redis on `localhost:6379`; adjust `DATABASE_URL` / `REDIS_URI` if your local services differ (the test stack publishes Postgres on 5433 and Redis on 6380, so neither clashes with a developer's own instance).

## Docker

```bash
cp .env.example .env
docker compose up -d --build     # API on :8080 with its own Postgres + Redis
docker compose run --rm api npm run db:migrate
docker compose logs -f api
docker compose down              # add -v to also drop the Postgres volume
```

Compose reads `.env`, so set `REDIS_URI=redis://redis:6379` there to reach its own Redis service, and it runs with `NODE_ENV=production`; Postgres and Redis are not published to the host. `test/docker-compose.yml` is a separate stack used only by the e2e tests.

Because compose runs in production mode, `.env` must set `RESEND_API_KEY` (the API refuses to start without it) — see Authentication below.

## Releases

Publish a GitHub release with a semver tag (`v1.2.3`) from `main`. The `Release` workflow then sets the version in `package.json` from the tag, adds the release's commits to `CHANGELOG.md`, and commits both back to the branch. Write commits as conventional commits (`feat:`, `fix:`, …) so the changelog reads well.

## Scripts

| Script                            | Purpose                                  |
| --------------------------------- | ---------------------------------------- |
| `npm run start:dev`               | Dev server with watch                    |
| `npm run build` / `start:prod`    | Compile / run `dist`                     |
| `npm run lint` / `lint:check`     | ESLint (fix / check)                     |
| `npm run format` / `format:check` | Prettier (write / check)                 |
| `npm run test:deps`               | Start Postgres + Redis for e2e           |
| `npm run test:e2e`                | Run the e2e suite                        |
| `npm run db:generate`             | Generate a migration from `db/schema.ts` |
| `npm run db:migrate`              | Apply migrations to `DATABASE_URL`       |

## API

All routes are under `/v1`, except `GET /` and `GET /health`. Errors are a bare `{ "statusCode": N }`. Money is integer paise; coordinates are `[longitude, latitude]`.

### Auth (public)

| Method | Path                         | Notes                                                                                                       |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/auth/magic-link`        | `{ email, role? }` (`role`: `user` or `restaurant`) → `{status:"sent"}` or `{status:"role_mismatch", role}` |
| POST   | `/v1/auth/magic-link/verify` | `{ token }` (posted by the web app from the emailed link) → tokens + user                                   |
| POST   | `/v1/auth/google`            | `{ idToken, role? }` — a Google ID token from the client → tokens + user                                    |
| POST   | `/v1/auth/refresh`           | `{ refreshToken }` → new token pair (the old refresh token is spent)                                        |
| POST   | `/v1/auth/logout`            | `{ refreshToken }` → 204                                                                                    |
| POST   | `/v1/auth/guest`             | → anonymous guest access token                                                                              |

`admin` cannot be requested: promote a user in the database (`role: "admin"`).

### Profile (any signed-in role)

| Method | Path                   | Notes                                       |
| ------ | ---------------------- | ------------------------------------------- |
| GET    | `/v1/users/me`         | current user                                |
| PATCH  | `/v1/users/me`         | `{ firstName?, lastName?, avatarUrl? }`     |
| POST   | `/v1/users/me/onboard` | `{ firstName, lastName }` → marks onboarded |

### Restaurants and menus

`POST`, `mine`, `PATCH`, `DELETE` and every `menu/items` route need the `restaurant` role (other roles get 403); the rest is public. Owners only ever see and change their own data (anything else is 404).

| Method | Path                                                  | Auth       | Notes                                                                                                                       |
| ------ | ----------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/restaurants`                                     | restaurant | `{ name, cuisines[1..10], isPureVeg, coordinates:[lng,lat], address:{line1,line2?,city,state,zipcode,phoneNumber?} }` → 201 |
| GET    | `/v1/restaurants/mine`                                | restaurant | the caller's restaurants, `?status=online\|offline&limit&offset` → `{ items, total }`                                       |
| GET    | `/v1/restaurants/nearby`                              | public     | `?lng&lat&radiusKm(≤25, default 5)&isPureVeg&cuisine&limit(≤50)` → online only, nearest first, with `distanceMeters`        |
| GET    | `/v1/restaurants/:slug`                               | public     | also returns offline restaurants (`status: "offline"`); 404 if unknown                                                      |
| PATCH  | `/v1/restaurants/:id`                                 | restaurant | any of `name, cuisines, isPureVeg, coordinates, address{…}` (slug never changes)                                            |
| PATCH  | `/v1/restaurants/:id/status`                          | restaurant | `{ status: "online" \| "offline" }`                                                                                         |
| DELETE | `/v1/restaurants/:id`                                 | restaurant | 204; also deletes its menu items and address                                                                                |
| GET    | `/v1/restaurants/:slug/menu`                          | public     | sorted by category, then name; includes sold-out items (`isAvailable: false`)                                               |
| POST   | `/v1/restaurants/:id/menu/items`                      | restaurant | `{ name, category, priceInPaise, foodType: "veg"\|"egg"\|"non-veg", isAvailable? }` → 201                                   |
| GET    | `/v1/restaurants/:id/menu/items`                      | restaurant | `?category&isAvailable&limit&offset` → `{ items, total }`                                                                   |
| GET    | `/v1/restaurants/:id/menu/items/:itemId`              | restaurant | 404 if missing, not yours, or under a different restaurant                                                                  |
| PATCH  | `/v1/restaurants/:id/menu/items/:itemId`              | restaurant | any of `name, category, priceInPaise, foodType, isAvailable`                                                                |
| PATCH  | `/v1/restaurants/:id/menu/items/:itemId/availability` | restaurant | `{ isAvailable }`                                                                                                           |
| DELETE | `/v1/restaurants/:id/menu/items/:itemId`              | restaurant | 204                                                                                                                         |

### Try it locally

Without `RESEND_API_KEY` (development) the magic link is printed in the API log instead of emailed:

```bash
curl -s -X POST localhost:8080/v1/auth/magic-link -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# copy the token from the logged link (…/auth/magic?token=TOKEN), then:
curl -s -X POST localhost:8080/v1/auth/magic-link/verify -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN"}'
curl -s localhost:8080/v1/users/me -H "Authorization: Bearer ACCESS_TOKEN"
```

### Configuration

| Variable                                                          | Purpose                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                             | Magic-link email. The key is **required in production** (the Docker stack runs in production mode). Verify your sending domain in Resend.          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Required. The OAuth web client used for the Authorization Code + PKCE flow (`GET /v1/auth/google` → Google → the web app's `GOOGLE_REDIRECT_URI`). |
| `WEB_APP_BASE_URL`, `WEB_APP_MAGIC_PATH`                          | Where the emailed link points (the web app, not this API).                                                                                         |
| `JWT_{ADMIN,RESTAURANT,USER,GUEST}_ACCESS_SECRET`                 | One signing secret per role.                                                                                                                       |
