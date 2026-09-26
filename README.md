# api.nearplate

Nearplate API server — NestJS 10 + MongoDB (Mongoose), Redis cache, JWT roles (`admin`, `restaurant`, `user`, `guest`), with sign-in by magic link (Resend) and Google.

Conventions and architecture: [AGENTS.md](AGENTS.md).

## Prerequisites

- Node.js >= 22, npm
- Docker (for local MongoDB + Redis)

## Setup

```bash
cp .env.example .env
npm install
npm run test:deps       # MongoDB :27017, Redis :6380 (test stack)
npm run start:dev
```

`.env.example` points at MongoDB on `localhost:27017` and Redis on `localhost:6379`; adjust `MONGODB_URI` / `REDIS_PORT` if your local services differ (the test stack publishes Redis on 6380).

## Docker

```bash
cp .env.example .env
docker compose up -d --build     # API on :3000 with its own MongoDB + Redis
docker compose logs -f api
docker compose down              # add -v to also drop the MongoDB volume
```

Compose overrides `MONGODB_URI` and `REDIS_HOST` to its own services and runs with `NODE_ENV=production`; MongoDB and Redis are not published to the host. `test/docker-compose.yml` is a separate stack used only by the e2e tests.

Because compose runs in production mode, `.env` must set `RESEND_API_KEY` (the API refuses to start without it) — see Authentication below.

## Releases

Publish a GitHub release with a semver tag (`v1.2.3`) from `main`. The `Release` workflow then sets the version in `package.json` from the tag, adds the release's commits to `CHANGELOG.md`, and commits both back to the branch. Write commits as conventional commits (`feat:`, `fix:`, …) so the changelog reads well.

## Scripts

| Script                            | Purpose                       |
| --------------------------------- | ----------------------------- |
| `npm run start:dev`               | Dev server with watch         |
| `npm run build` / `start:prod`    | Compile / run `dist`          |
| `npm run lint` / `lint:check`     | ESLint (fix / check)          |
| `npm run format` / `format:check` | Prettier (write / check)      |
| `npm run test:deps`               | Start MongoDB + Redis for e2e |
| `npm run test:e2e`                | Run the e2e suite             |

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

### Restaurant owner (`restaurant` role only; other roles get 403)

| Method | Path                                    | Notes                                                                                                                       |
| ------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/owner/restaurants`                 | `{ name, cuisines[1..10], isPureVeg, coordinates:[lng,lat], address:{line1,line2?,city,state,zipcode,phoneNumber?} }` → 201 |
| GET    | `/v1/owner/restaurants`                 | `?status=online\|offline&limit&offset` → `{ items, total }`                                                                 |
| GET    | `/v1/owner/restaurants/:id`             | 404 if missing or not yours                                                                                                 |
| PATCH  | `/v1/owner/restaurants/:id`             | any of `name, cuisines, isPureVeg, coordinates, address{…}` (slug never changes)                                            |
| PATCH  | `/v1/owner/restaurants/:id/status`      | `{ status: "online" \| "offline" }`                                                                                         |
| DELETE | `/v1/owner/restaurants/:id`             | 204; also deletes its menu items and address                                                                                |
| POST   | `/v1/owner/menu-items`                  | `{ restaurantId, name, category, priceInPaise, foodType: "veg"\|"egg"\|"non-veg", isAvailable? }` → 201                     |
| GET    | `/v1/owner/menu-items`                  | `?restaurantId&category&isAvailable&limit&offset` → `{ items, total }`                                                      |
| GET    | `/v1/owner/menu-items/:id`              | 404 if missing or not yours                                                                                                 |
| PATCH  | `/v1/owner/menu-items/:id`              | any of `name, category, priceInPaise, foodType, isAvailable`                                                                |
| PATCH  | `/v1/owner/menu-items/:id/availability` | `{ isAvailable }`                                                                                                           |
| DELETE | `/v1/owner/menu-items/:id`              | 204                                                                                                                         |

### Public discovery (no auth)

| Method | Path                         | Notes                                                                                                                |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/restaurants/nearby`     | `?lng&lat&radiusKm(≤25, default 5)&isPureVeg&cuisine&limit(≤50)` → online only, nearest first, with `distanceMeters` |
| GET    | `/v1/restaurants/:slug`      | also returns offline restaurants (`status: "offline"`); 404 if unknown                                               |
| GET    | `/v1/restaurants/:slug/menu` | sorted by category, then name; includes sold-out items (`isAvailable: false`)                                        |

### Try it locally

Without `RESEND_API_KEY` (development) the magic link is printed in the API log instead of emailed:

```bash
curl -s -X POST localhost:3000/v1/auth/magic-link -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
# copy the token from the logged link (…/auth/magic?token=TOKEN), then:
curl -s -X POST localhost:3000/v1/auth/magic-link/verify -H 'Content-Type: application/json' \
  -d '{"token":"TOKEN"}'
curl -s localhost:3000/v1/users/me -H "Authorization: Bearer ACCESS_TOKEN"
```

### Configuration

| Variable                                          | Purpose                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`             | Magic-link email. The key is **required in production** (the Docker stack runs in production mode). Verify your sending domain in Resend. |
| `GOOGLE_CLIENT_IDS`                               | Comma-separated OAuth client ids (web/iOS/Android) accepted as the ID token audience. Unset → `/v1/auth/google` returns 501.              |
| `WEB_APP_BASE_URL`, `WEB_APP_MAGIC_PATH`          | Where the emailed link points (the web app, not this API).                                                                                |
| `JWT_{ADMIN,RESTAURANT,USER,GUEST}_ACCESS_SECRET` | One signing secret per role.                                                                                                              |
