import { LogClass } from "@/app/modules/logger";
import type { FoodType } from "@/domain/enums/food-type";
import type {
	ICRUDRepository,
	TPage,
} from "@/domain/interfaces/crud.interface";
import type {
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import type { TGeoPoint } from "@db/schemas/geo";
import {
	MenuItem,
	type MenuItemDocument,
	type TMenuItem,
} from "@db/schemas/menu-item.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type FilterQuery, type Model, isValidObjectId } from "mongoose";

/** Persistence-level create: the location is copied from the restaurant. */
export type TCreateMenuItemRecord = {
	restaurantId: string;
	name: string;
	category: string;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
	location: TGeoPoint;
};

type TLeanMenuItem = Omit<TMenuItem, "id" | "restaurantId"> & {
	_id: { toString(): string };
	restaurant: { toString(): string };
};

/** Data access for `menu_items`. Owner-facing methods scope by `ownerId`. */
@LogClass()
@Injectable()
export class MenuItemRepository implements ICRUDRepository<
	TMenuItem,
	TCreateMenuItemRecord,
	TUpdateMenuItemInput,
	TListMenuItemsInput
> {
	constructor(
		@InjectModel(MenuItem.name)
		private readonly _model: Model<MenuItemDocument>,
	) {}

	/** Inserts an item for `ownerId` (who must own the restaurant). */
	public async create(
		ownerId: string,
		input: TCreateMenuItemRecord,
	): Promise<TMenuItem> {
		const { restaurantId, ...rest } = input;
		const doc = await this._model.create({
			...rest,
			ownerId,
			restaurant: restaurantId,
		});
		return this._toRow(doc.toObject() as unknown as TLeanMenuItem);
	}

	/** The owner's items, sorted by category then name. */
	public async list(
		ownerId: string,
		query: TListMenuItemsInput,
	): Promise<TPage<TMenuItem>> {
		if (query.restaurantId && !isValidObjectId(query.restaurantId)) {
			return { items: [], total: 0 };
		}
		const filter: FilterQuery<MenuItemDocument> = {
			ownerId,
			...(query.restaurantId ? { restaurant: query.restaurantId } : {}),
			...(query.category ? { category: query.category } : {}),
			...(query.isAvailable !== undefined
				? { isAvailable: query.isAvailable }
				: {}),
		};
		const [rows, total] = await Promise.all([
			this._model
				.find(filter)
				.sort({ category: 1, name: 1, _id: 1 })
				.skip(query.offset)
				.limit(query.limit)
				.lean<TLeanMenuItem[]>(),
			this._model.countDocuments(filter),
		]);
		return { items: rows.map((row) => this._toRow(row)), total };
	}

	/** Null when missing, malformed id, or owned by someone else. */
	public async findById(
		ownerId: string,
		id: string,
	): Promise<TMenuItem | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOne({ _id: id, ownerId })
			.lean<TLeanMenuItem>();
		return row ? this._toRow(row) : null;
	}

	/** Applies only the keys present; null when missing or not owned. */
	public async update(
		ownerId: string,
		id: string,
		patch: TUpdateMenuItemInput,
	): Promise<TMenuItem | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOneAndUpdate({ _id: id, ownerId }, { $set: patch }, { new: true })
			.lean<TLeanMenuItem>();
		return row ? this._toRow(row) : null;
	}

	/** True when an item was deleted. */
	public async delete(ownerId: string, id: string): Promise<boolean> {
		if (!isValidObjectId(id)) {
			return false;
		}
		const result = await this._model.deleteOne({ _id: id, ownerId });
		return result.deletedCount === 1;
	}

	/** Every item of a restaurant for the public menu, by category then name. */
	public async listByRestaurant(restaurantId: string): Promise<TMenuItem[]> {
		if (!isValidObjectId(restaurantId)) {
			return [];
		}
		const rows = await this._model
			.find({ restaurant: restaurantId })
			.sort({ category: 1, name: 1, _id: 1 })
			.lean<TLeanMenuItem[]>();
		return rows.map((row) => this._toRow(row));
	}

	/** Keeps the denormalized location in step with the restaurant's. */
	public async updateLocationByRestaurant(
		restaurantId: string,
		location: TGeoPoint,
	): Promise<void> {
		await this._model.updateMany(
			{ restaurant: restaurantId },
			{ $set: { location } },
		);
	}

	/** Removes every item of a restaurant (used when the restaurant is deleted). */
	public async deleteByRestaurant(restaurantId: string): Promise<void> {
		await this._model.deleteMany({ restaurant: restaurantId });
	}

	/** Maps a lean document to the plain `TMenuItem` row. */
	private _toRow(row: TLeanMenuItem): TMenuItem {
		const { _id, restaurant, ...rest } = row;
		return {
			id: _id.toString(),
			restaurantId: restaurant.toString(),
			...rest,
		};
	}
}
