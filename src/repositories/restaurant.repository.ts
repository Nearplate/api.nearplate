import { DatabaseService, type TDatabase } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type {
	ICRUDRepository,
	TPage,
} from "@/domain/interfaces/crud.interface";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type {
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
} from "@/domain/types/restaurant.types";
import { SlugHelper } from "@/helpers/slug.helper";
import { isUniqueViolation, isUuid } from "@/repositories/repository.utils";
import { addresses, type TAddress } from "@db/schemas/address.schema";
import type { TGeoPoint } from "@db/schemas/geo";
import { restaurants, type TRestaurant } from "@db/schemas/restaurant.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, sql } from "drizzle-orm";

const _SLUG_ATTEMPTS = 5;

/** Persistence-level create: the address already exists, coordinates are GeoJSON. */
export type TCreateRestaurantRecord = {
	name: string;
	cuisines: string[];
	isPureVeg: boolean;
	location: TGeoPoint;
	addressId: string;
};

export type TUpdateRestaurantRecord = Partial<{
	name: string;
	cuisines: string[];
	isPureVeg: boolean;
	location: TGeoPoint;
	status: RestaurantStatus;
}>;

export type TNearbyRestaurant = TRestaurant & { distanceMeters: number };

type TJoinedRow = {
	restaurant: typeof restaurants.$inferSelect;
	address: TAddress;
};

/** Data access for `restaurants`. Owner-facing methods are owner-scoped. */
@LogClass()
@Injectable()
export class RestaurantRepository implements ICRUDRepository<
	TRestaurant,
	TCreateRestaurantRecord,
	TUpdateRestaurantRecord,
	TListRestaurantsInput
> {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(SlugHelper)
		private readonly _slugHelper: SlugHelper,
	) {}

	/**
	 * Inserts a restaurant with a slug derived from its name. A slug collision
	 * (unique violation) retries with a random suffix, up to a few attempts.
	 * Each attempt runs in its own savepoint so a failed insert does not abort
	 * the caller's outer transaction (`RestaurantService.create`).
	 */
	public async create(
		ownerId: string,
		input: TCreateRestaurantRecord,
	): Promise<TRestaurant> {
		const base = this._slugHelper.toSlug(input.name);
		for (let attempt = 0; attempt < _SLUG_ATTEMPTS; attempt += 1) {
			const slug = attempt === 0 ? base : this._slugHelper.withSuffix(base);
			try {
				return await this._databaseService.db.transaction(async (tx) => {
					const [inserted] = await tx
						.insert(restaurants)
						.values({ ...input, ownerId, slug })
						.returning({ id: restaurants.id });
					return this._selectJoinedOrThrow(tx, eq(restaurants.id, inserted.id));
				});
			} catch (error) {
				if (!isUniqueViolation(error)) {
					throw error;
				}
			}
		}
		throw new Error("Unable to generate a unique restaurant slug");
	}

	/** The owner's restaurants, newest first. */
	public async list(
		ownerId: string,
		query: TListRestaurantsInput,
	): Promise<TPage<TRestaurant>> {
		const filter = and(
			eq(restaurants.ownerId, ownerId),
			query.status ? eq(restaurants.status, query.status) : undefined,
		);
		const [rows, [totalRow]] = await Promise.all([
			this._databaseService.db
				.select({ restaurant: restaurants, address: addresses })
				.from(restaurants)
				.innerJoin(addresses, eq(restaurants.addressId, addresses.id))
				.where(filter)
				.orderBy(desc(restaurants.createdAt), desc(restaurants.id))
				.limit(query.limit)
				.offset(query.offset),
			this._databaseService.db
				.select({ total: count() })
				.from(restaurants)
				.where(filter),
		]);
		return {
			items: rows.map((row) => this._toRow(row)),
			total: totalRow?.total ?? 0,
		};
	}

	/** Null when missing, malformed id, or owned by someone else. */
	public async findById(
		ownerId: string,
		id: string,
	): Promise<TRestaurant | null> {
		if (!isUuid(id)) {
			return null;
		}
		return this._selectJoined(
			this._databaseService.db,
			and(eq(restaurants.id, id), eq(restaurants.ownerId, ownerId)),
		);
	}

	/** Applies only the keys present; null when missing or not owned. */
	public async update(
		ownerId: string,
		id: string,
		patch: TUpdateRestaurantRecord,
	): Promise<TRestaurant | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [updated] = await this._databaseService.db
			.update(restaurants)
			.set(patch)
			.where(and(eq(restaurants.id, id), eq(restaurants.ownerId, ownerId)))
			.returning({ id: restaurants.id });
		if (!updated) {
			return null;
		}
		return this._selectJoined(this._databaseService.db, eq(restaurants.id, id));
	}

	/** True when a restaurant was deleted. */
	public async delete(ownerId: string, id: string): Promise<boolean> {
		if (!isUuid(id)) {
			return false;
		}
		const rows = await this._databaseService.db
			.delete(restaurants)
			.where(and(eq(restaurants.id, id), eq(restaurants.ownerId, ownerId)))
			.returning({ id: restaurants.id });
		return rows.length === 1;
	}

	/**
	 * Lookup by id with no owner scope, for callers (order placement) that
	 * need the restaurant's status and `ownerId` without owning it themselves.
	 */
	public async findByIdPublic(id: string): Promise<TRestaurant | null> {
		if (!isUuid(id)) {
			return null;
		}
		return this._selectJoined(this._databaseService.db, eq(restaurants.id, id));
	}

	/** Public lookup by slug (any status, so clients can show "closed"). */
	public async findBySlug(slug: string): Promise<TRestaurant | null> {
		return this._selectJoined(
			this._databaseService.db,
			eq(restaurants.slug, slug),
		);
	}

	/**
	 * Online restaurants within `radiusMeters` of a point, nearest first, with
	 * `distanceMeters`. Casts `location` to `geography` so `ST_DWithin` and
	 * `ST_Distance` measure real meters over the sphere, not planar degrees.
	 */
	public async nearby(
		input: TNearbyRestaurantsInput,
	): Promise<TNearbyRestaurant[]> {
		const [lng, lat] = input.coordinates;
		const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
		const distance = sql<number>`ST_Distance(${restaurants.location}::geography, ${point})`;
		const rows = await this._databaseService.db
			.select({
				restaurant: restaurants,
				address: addresses,
				distanceMeters: distance,
			})
			.from(restaurants)
			.innerJoin(addresses, eq(restaurants.addressId, addresses.id))
			.where(
				and(
					eq(restaurants.status, RestaurantStatus.Online),
					sql`ST_DWithin(${restaurants.location}::geography, ${point}, ${input.radiusMeters})`,
					input.isPureVeg !== undefined
						? eq(restaurants.isPureVeg, input.isPureVeg)
						: undefined,
					input.cuisine
						? sql`${input.cuisine} = ANY(${restaurants.cuisines})`
						: undefined,
				),
			)
			.orderBy(distance)
			.limit(input.limit);
		return rows.map((row) => ({
			...this._toRow(row),
			distanceMeters: row.distanceMeters,
		}));
	}

	/** Runs the restaurant+address join, scoped by `filter`; null when no row matches. */
	private async _selectJoined(
		db: TDatabase,
		filter: ReturnType<typeof and>,
	): Promise<TRestaurant | null> {
		const [row] = await db
			.select({ restaurant: restaurants, address: addresses })
			.from(restaurants)
			.innerJoin(addresses, eq(restaurants.addressId, addresses.id))
			.where(filter);
		return row ? this._toRow(row) : null;
	}

	/** Like `_selectJoined`, but the row is expected to exist (right after an insert). */
	private async _selectJoinedOrThrow(
		db: TDatabase,
		filter: ReturnType<typeof and>,
	): Promise<TRestaurant> {
		const row = await this._selectJoined(db, filter);
		if (!row) {
			throw new Error("Restaurant vanished immediately after insert");
		}
		return row;
	}

	/** Maps a joined row to the plain `TRestaurant` row. */
	private _toRow(row: TJoinedRow): TRestaurant {
		const { addressId: _addressId, ...rest } = row.restaurant;
		return { ...rest, address: row.address };
	}
}
