import { LogClass } from "@/app/modules/logger";
import type {
	ICRUDRepository,
	TPage,
} from "@/domain/interfaces/crud.interface";
import type { RestaurantStatus } from "@/domain/enums/restaurant-status";
import type {
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
} from "@/domain/types/restaurant.types";
import { SlugHelper } from "@/helpers/slug.helper";
import {
	type TLeanAddress,
	toAddressRow,
} from "@/repositories/address.repository";
import type { TGeoPoint } from "@db/schemas/geo";
import {
	Restaurant,
	type RestaurantDocument,
	type TRestaurant,
} from "@db/schemas/restaurant.schema";
import { Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type FilterQuery, type Model, isValidObjectId } from "mongoose";

const _DUPLICATE_KEY_ERROR = 11000;
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

type TLeanRestaurant = Omit<TRestaurant, "id" | "address"> & {
	_id: { toString(): string };
	address: TLeanAddress;
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
		@InjectModel(Restaurant.name)
		private readonly _model: Model<RestaurantDocument>,
		@Inject(SlugHelper)
		private readonly _slugHelper: SlugHelper,
	) {}

	/**
	 * Inserts a restaurant with a slug derived from its name. A slug collision
	 * (duplicate-key error) retries with a random suffix, up to a few attempts.
	 */
	public async create(
		ownerId: string,
		input: TCreateRestaurantRecord,
	): Promise<TRestaurant> {
		const { addressId, ...rest } = input;
		const base = this._slugHelper.toSlug(input.name);
		for (let attempt = 0; attempt < _SLUG_ATTEMPTS; attempt += 1) {
			const slug = attempt === 0 ? base : this._slugHelper.withSuffix(base);
			try {
				const doc = await this._model.create({
					...rest,
					ownerId,
					slug,
					address: addressId,
				});
				await doc.populate("address");
				return this._toRow(doc.toObject() as unknown as TLeanRestaurant);
			} catch (error) {
				if ((error as { code?: number }).code !== _DUPLICATE_KEY_ERROR) {
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
		const filter: FilterQuery<RestaurantDocument> = {
			ownerId,
			...(query.status ? { status: query.status } : {}),
		};
		const [rows, total] = await Promise.all([
			this._model
				.find(filter)
				.sort({ createdAt: -1, _id: -1 })
				.skip(query.offset)
				.limit(query.limit)
				.populate("address")
				.lean<TLeanRestaurant[]>(),
			this._model.countDocuments(filter),
		]);
		return { items: rows.map((row) => this._toRow(row)), total };
	}

	/** Null when missing, malformed id, or owned by someone else. */
	public async findById(
		ownerId: string,
		id: string,
	): Promise<TRestaurant | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOne({ _id: id, ownerId })
			.populate("address")
			.lean<TLeanRestaurant>();
		return row ? this._toRow(row) : null;
	}

	/** Applies only the keys present; null when missing or not owned. */
	public async update(
		ownerId: string,
		id: string,
		patch: TUpdateRestaurantRecord,
	): Promise<TRestaurant | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOneAndUpdate({ _id: id, ownerId }, { $set: patch }, { new: true })
			.populate("address")
			.lean<TLeanRestaurant>();
		return row ? this._toRow(row) : null;
	}

	/** True when a restaurant was deleted. */
	public async delete(ownerId: string, id: string): Promise<boolean> {
		if (!isValidObjectId(id)) {
			return false;
		}
		const result = await this._model.deleteOne({ _id: id, ownerId });
		return result.deletedCount === 1;
	}

	/** Public lookup by slug (any status, so clients can show "closed"). */
	public async findBySlug(slug: string): Promise<TRestaurant | null> {
		const row = await this._model
			.findOne({ slug })
			.populate("address")
			.lean<TLeanRestaurant>();
		return row ? this._toRow(row) : null;
	}

	/**
	 * Online restaurants within `radiusMeters` of a point, nearest first, with
	 * `distanceMeters`. `$geoNear` must be the first stage and uses the
	 * collection's single 2dsphere index.
	 */
	public async nearby(
		input: TNearbyRestaurantsInput,
	): Promise<TNearbyRestaurant[]> {
		const rows = await this._model.aggregate<
			TLeanRestaurant & { distanceMeters: number }
		>([
			{
				$geoNear: {
					near: { type: "Point", coordinates: input.coordinates },
					distanceField: "distanceMeters",
					maxDistance: input.radiusMeters,
					spherical: true,
					query: {
						status: "online",
						...(input.isPureVeg !== undefined
							? { isPureVeg: input.isPureVeg }
							: {}),
						...(input.cuisine ? { cuisines: input.cuisine } : {}),
					},
				},
			},
			{ $limit: input.limit },
			{
				$lookup: {
					from: "addresses",
					localField: "address",
					foreignField: "_id",
					as: "address",
				},
			},
			{ $unwind: "$address" },
		]);
		return rows.map((row) => ({
			...this._toRow(row),
			distanceMeters: row.distanceMeters,
		}));
	}

	/** Maps a lean, address-populated document to the plain `TRestaurant` row. */
	private _toRow(row: TLeanRestaurant): TRestaurant {
		const { _id, address, ...rest } = row;
		return { id: _id.toString(), address: toAddressRow(address), ...rest };
	}
}
