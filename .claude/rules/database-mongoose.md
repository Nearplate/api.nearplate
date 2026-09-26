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

- Inject the model: `@InjectModel(User.name) private readonly _model: Model<UserDocument>`.
- Reads use `.lean()` and map `_id` → `id` into the plain `TX` row; services never see Mongoose documents.
- Scope ownership in the filter (`{ _id, ownerId }`), never read-then-check.
- Validate ids with `isValidObjectId` first; a malformed id returns `null`/`false`, which the service turns into `404`.
- Return `null` for not-found / not-owned — services throw `NotFoundException`.
- Partial updates use `$set` with only the keys present.
- Single-use documents (magic-link tokens, refresh sessions) are consumed with `findOneAndDelete` filtered on hash **and** `expiresAt > now`; never find-then-delete (race), and never trust the TTL index alone (it sweeps about once a minute).
- Expiring collections declare a TTL index: `Schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`.
- A unique-index violation (`error.code === 11000`) on create is a lost race, not an error: return `null` and let the service re-read.
- Optional unique fields (e.g. `googleSub`) use a **sparse** unique index and stay `undefined` (not `null`) when absent.
- References use `@Prop({ type: MongooseSchema.Types.ObjectId, ref: "X" })` (import `Schema as MongooseSchema`). `Types.ObjectId` as the _type_ silently stores a string and breaks `$lookup`.
- Geo: store GeoJSON `{ type: "Point", coordinates: [lng, lat] }` (`GEO_POINT_PROP` in `db/schemas/geo.ts`), keep **one** 2dsphere index per collection, and run `$geoNear` as the first aggregate stage (meters, `spherical: true`).
- Denormalized copies (e.g. `MenuItem.location`, `MenuItem.ownerId`) must be updated wherever their source changes; document the source next to the field.
- No transactions on standalone MongoDB: order writes and compensate (delete what you created) on failure; log, never swallow, a failed compensation.
- Cache unique lookups with `@DBCache` / invalidate writes with `@DBCacheInvalidate` — see `db-cache` rule.

## Connection

`MONGODB_URI` (validated in `config.ts`). There are no migrations: schema changes are code changes plus index declarations; backfill data with a one-off script when needed.
