# api.nearplate

Nearplate API server — NestJS 10 + MongoDB (Mongoose), Redis cache, JWT roles (`admin`, `restaurant`, `user`, `guest`), with an owner-scoped todo CRUD as the reference feature.

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

## Try the todo API

There are no login routes yet. Mint a token with the secret from your `.env`:

```bash
TOKEN=$(node -e "console.log(require('jsonwebtoken').sign({sub:'alice',role:'user'}, process.env.JWT_USER_ACCESS_SECRET, {expiresIn:900}))")
# (export JWT_USER_ACCESS_SECRET first, e.g. `set -a; . ./.env; set +a`)

curl -s localhost:3000/health
curl -s -X POST localhost:3000/todos -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"title":"Buy milk"}'
curl -s "localhost:3000/todos?completed=false" -H "Authorization: Bearer $TOKEN"
```

| Method | Path         | Notes                                                   |
| ------ | ------------ | ------------------------------------------------------- |
| POST   | `/todos`     | `{ title, description? }` → 201                         |
| GET    | `/todos`     | `?completed=&limit=1..100&offset=` → `{ items, total }` |
| GET    | `/todos/:id` | 404 if missing or not yours                             |
| PATCH  | `/todos/:id` | at least one of `title`, `description`, `completed`     |
| DELETE | `/todos/:id` | 204                                                     |
