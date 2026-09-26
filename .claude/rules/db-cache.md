---
paths:
  - "src/repositories/**/*.ts"
  - "src/decorators/db-cache.decorator.ts"
---

# Repository DB cache

When a repository method caches DB reads (or mutates cached entities), use the shared decorators — never ad-hoc Redis, in-memory maps, or a Nest `CacheModule`.

## Pattern (match `TodoRepository`)

```typescript
const _ENTITY = "todo";
const _CACHE_FIELD = "idOwner";

@DBCache({ entity: _ENTITY, by: _CACHE_FIELD, ttl: CacheTTL.FIVE_MIN })
public async findById(ownerId: string, id: string) { /* ... */ }

@DBCacheInvalidate({
  entity: _ENTITY,
  fields: [_CACHE_FIELD],
  resolve: (args) => ({ [_CACHE_FIELD]: JSON.stringify([args[0], args[1]]) }),
})
public async update(ownerId: string, id: string, input: TUpdateTodoInput) { /* ... */ }
```

## Reads — `@DBCache`

- Unique lookups: `@DBCache({ entity, by, ttl: CacheTTL.* })`.
- Key: `dbcache:{entity}:{by}:{value}` — 0 args → `_`; 1 arg → that value; 2+ args → `JSON.stringify(args)`. Owner-scoped lookups take `(ownerId, id)` so the owner is part of the key.
- Do **not** cache unbounded lists (`list`, `findAll`).
- Only non-null results are cached; values round-trip through JSON (dates become strings — transformers coerce them).

## Writes — `@DBCacheInvalidate`

- Every `update` / `delete` that touches a cached entity must invalidate.
- `resolve` must rebuild exactly the key value used by the read (for 2+ args: `JSON.stringify([...args])`).

## Rules of thumb

- Redis only via `RedisCacheAdapter`.
- Behavior changes need e2e under `test/e2e/specs/`.
