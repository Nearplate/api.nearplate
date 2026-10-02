# Testing

Every behavior change ships with an e2e change in the same diff. Do not finish a
controller, transformer, service, repository, adapter, guard, or schema without
updating or adding the matching spec.

## Required with the code

| Code change                                   | Test change                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| New/changed HTTP route, status, or wire shape | Spec for that path under `test/e2e/specs/`                                            |
| New/changed auth or 401/403/404 behavior      | Auth/negative case on the same route                                                  |
| New table                                     | Nothing to register: `reset()` truncates every table                                  |
| New adapter that must not hit a real vendor   | Fake under `test/e2e/helpers/fakes/` and override in the harness (`overrideProvider`) |
| New required env var                          | Fixture in `test/e2e/setup/apply-test-env.cjs`                                        |

Untested behavior is incomplete. Delete or rewrite assertions that no longer
match the wire contract — do not leave stale specs green by accident.

## Layout

```
test/e2e/
  setup/     apply-test-env, global-setup, jest.setup
  helpers/   app.harness.ts
  specs/     one *.e2e-spec.ts per HTTP surface (auth/, health)
```

- Specs only under `test/e2e/specs/`. No `*.spec.ts` under `src/`. HTTP via supertest + full `AppModule`.
- Reuse `getE2eApp()` and its `http`, `authHeader(role, sub?)`, `jwt`. Do not boot a second Nest app in a spec.
- `reset()` (run before each test) truncates every table, clears the `dbcache:*` and `ratelimit:*` Redis keys, and resets the fakes.

## Constraints

- Database is always `api_nearplate_test` (`global-setup.cjs` refuses names that do not end in `_test`).
- Test Redis is published on host port **6380** so it never touches a developer's own Redis on 6379.
- Force `NODE_ENV=development` (schema has no `test` value).
- Email and Google are always faked: `FakeResendAdapter` captures links (`waitForLink`, `tokenOf`), `FakeGoogleOauthAdapter` maps test `code` strings to claims (`register`) and drives the redirect flow's `authorizeUrl`/`exchangeCode`. Never call the real vendors.
- Use `seedUser({ role, email, firstName, lastName })` for an existing account with a valid access token, and `seedRestaurant(ownerId, overrides?)` / `seedMenuItem(ownerId, restaurantId, overrides?)` / `seedOnboarding(ownerId, restaurantId)` (complete KYC + documents, so submit passes) for domain data. S3 is one fake (`s3`) with per-bucket storage; pass `"documents"` to `simulateUpload` for KYC documents. `reset()` also clears the `ratelimit:*` keys and the fakes.
- The harness applies `configureApp` (so routes are under `/v1`); `global-setup.cjs` runs `db/migrations` before the first test, so every table, index, and constraint already exists.
- `MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR=3` in tests so the 429 path is cheap to hit.
- Wire JSON is camelCase. Error bodies are `{ statusCode }`, plus `code` and `message` when thrown from the `Errors` catalogue.

## Commands

```bash
npm run test:deps       # local Postgres (PostGIS) + Redis (docker compose)
npm run test:e2e        # Jest, run in band
```
