---
paths:
  - "db/**/*.ts"
  - "src/repositories/**/*.ts"
---

# Database (Postgres + Drizzle)

## Schemas (`db/schemas/*.schema.ts`)

- One `pgTable("collection_name", { ... })` per table, built with `drizzle-orm/pg-core` column builders. `createdAt`/`updatedAt` are `timestamp({ withTimezone: true }).notNull().defaultNow()`, with `updatedAt` adding `.$onUpdate(() => new Date())`.
- Export the table constant, any `pgEnum` it uses, and a plain row type `TX` with `id: string` matching what a plain `select()` returns.
- Declare indexes in the third `pgTable` argument (`(table) => [index("x_owner_id_idx").on(table.ownerId), ...]`).
- Re-export every table from `db/schema.ts` (the barrel `drizzle-kit` and `DatabaseService` both read).
- Document non-obvious fields with block comments — they explain business rules.

## Repositories

- Inject `DatabaseService`: `@Inject(DatabaseService) private readonly _databaseService: DatabaseService`, and read every query through `this._databaseService.db` (never cache the client in a field — it can be a transaction bound to the current call).
- A plain `select()` on a table already returns the `TX` row shape; no `_id` → `id` mapping is needed. Joined reads (e.g. `restaurants` + `addresses`) map through a small `_toRow` helper.
- Scope ownership in the `where` filter (`and(eq(table.id, id), eq(table.ownerId, ownerId))`), never read-then-check.
- Validate ids with `isUuid` (`src/repositories/repository.utils.ts`) first; a malformed id returns `null`/`false`, which the service turns into `404`.
- Return `null` for not-found / not-owned — services throw `NotFoundException`.
- Partial updates use `.update(table).set(patch)` with only the keys present in `patch`.
- Single-use rows (magic-link tokens, refresh sessions) are consumed with `.delete(...).where(...).returning()` filtered on hash **and** `expiresAt > now()`; never find-then-delete (race). There is no TTL index in Postgres, so each also has a `deleteExpired()` method run hourly by `AuthCleanupSubscriber`.
- A unique-constraint violation on create is a lost race, not an error: catch it with `isUniqueViolation` (checks both `error.code` and `error.cause?.code` — Drizzle wraps the driver error) and return `null` so the service can re-read.
- Optional unique fields (e.g. `googleSub`) are plain nullable `unique()` columns: Postgres does not enforce uniqueness across multiple `NULL`s, which gives the same behavior as Mongo's sparse unique index.
- References use `.references(() => otherTable.id, { onDelete: "..." })`. Prefer a real FK (`cascade`/`restrict`) over app-level cleanup where the relationship allows it (e.g. `menu_items.restaurant_id` cascades, so `RestaurantRepository`/`Service` never deletes menu items directly).
- Geo: store `geometry(Point,4326)` via the `geoPoint` custom type (`db/schemas/geo.ts`), which maps to/from `TGeoPoint` (`{ type: "Point", coordinates: [lng, lat] }`) by decoding the EWKB Postgres returns — never assume `ST_AsText`/WKT unless the query explicitly casts to it. Add a `gist` index per geometry column, and use `ST_DWithin`/`ST_Distance` on `location::geography` for radius search (meters).
- Denormalized copies (e.g. `MenuItem.location`, `MenuItem.ownerId`) must be updated wherever their source changes; document the source next to the field.
- Multi-table writes run inside `this._databaseService.transaction(fn)` at the **service** layer (see `RestaurantService.create`/`update`/`remove`); a repository method that needs its own nested transaction (e.g. a slug-retry savepoint) calls `this._databaseService.db.transaction(...)` directly, which opens a `SAVEPOINT` when already inside one.
- Cache unique lookups with `@DBCache` / invalidate writes with `@DBCacheInvalidate` — see `db-cache` rule.

## Connection and migrations

`DATABASE_URL` (validated in `config.ts`). Schema changes are: edit `db/schemas/*.schema.ts`, run `npm run db:generate` to write a migration to `db/migrations`, review the SQL, then `npm run db:migrate` to apply it. Never hand-edit a generated migration except to add extension/one-off statements (e.g. `CREATE EXTENSION IF NOT EXISTS postgis;` in the first migration).
