---
paths:
  - "src/repositories/**/*.ts"
  - "src/decorators/db-cache.decorator.ts"
---

# Repository DB cache

When a repository method caches DB reads (or mutates cached entities), use the shared decorators — never ad-hoc Redis, in-memory maps, or a Nest `CacheModule`.

## Pattern (match `UserRepository`)

```typescript
const _ENTITY = "user";
const _CACHE_FIELDS = ["id", "email", "googleSub"];

@DBCache({ entity: _ENTITY, by: "id", ttl: CacheTTL.FIVE_MIN })
public async findById(id: string) { /* ... */ }

@DBCacheInvalidate({
  entity: _ENTITY,
  fields: _CACHE_FIELDS,
  resolve: (_args, result) => (result as TUser | null) ?? undefined,
})
public async update(id: string, patch: TUpdateUserInput) { /* ... */ }
```

## Reads — `@DBCache`

- Unique lookups: `@DBCache({ entity, by, ttl: CacheTTL.* })`.
- Key: `dbcache:{entity}:{by}:{value}` — 0 args → `_`; 1 arg → that value; 2+ args → `JSON.stringify(args)`. For owner-scoped lookups take `(ownerId, id)` so the owner is part of the key (invalidate with `JSON.stringify([ownerId, id])`).
- Do **not** cache unbounded lists (`list`, `findAll`).
- Only non-null results are cached; values round-trip through JSON (dates become strings — transformers coerce them).

## Writes — `@DBCacheInvalidate`

- Every `update` / `delete` that touches a cached entity must invalidate.
- `resolve` returns an object holding a value for each name in `fields` (the updated row works when its properties match). For 2+ arg reads it must rebuild exactly `JSON.stringify([...args])`.

## Rules of thumb

- Redis only via `RedisCacheAdapter`.
- Behavior changes need e2e under `test/e2e/specs/`.
