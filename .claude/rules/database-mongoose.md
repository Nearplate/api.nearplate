---
paths:
  - "db/**/*.ts"
  - "src/repositories/**/*.ts"
---

# Database (Mongoose)

## Schemas (`db/schemas/*.schema.ts`)

- One `@Schema({ collection: "...", timestamps: true })` class per collection, using `@nestjs/mongoose` decorators. `timestamps` gives `createdAt` / `updatedAt`.
- Export the class, `XSchema` (`SchemaFactory.createForClass`), `XDocument`, and a plain row type `TX` with `id: string`.
- Declare indexes on the schema (`XSchema.index({ ownerId: 1, createdAt: -1 })`).
- Register every model in `db/models.ts` (`Models` array); `DatabaseModule` wires it with `MongooseModule.forFeature`.
- Document non-obvious fields with block comments — they explain business rules.

## Repositories

- Inject the model: `@InjectModel(Todo.name) private readonly _model: Model<TodoDocument>`.
- Reads use `.lean()` and map `_id` → `id` into the plain `TX` row; services never see Mongoose documents.
- Scope ownership in the filter (`{ _id, ownerId }`), never read-then-check.
- Validate ids with `isValidObjectId` first; a malformed id returns `null`/`false`, which the service turns into `404`.
- Return `null` for not-found / not-owned — services throw `NotFoundException`.
- Partial updates use `$set` with only the keys present.
- Use transactions (`connection.startSession()`) only when several writes must succeed together (needs a replica set).
- Cache unique lookups with `@DBCache` / invalidate writes with `@DBCacheInvalidate` — see `db-cache` rule.

## Connection

`MONGODB_URI` (validated in `config.ts`). There are no migrations: schema changes are code changes plus index declarations; backfill data with a one-off script when needed.
