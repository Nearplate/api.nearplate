import { LogClass } from "@/app/modules/logger";
import { CacheTTL } from "@/app/constants/cache-ttl";
import { DBCache, DBCacheInvalidate } from "@/decorators/db-cache.decorator";
import { Todo, type TodoDocument, type TTodo } from "@db/schemas/todo.schema";
import type { ICRUDRepository } from "@/domain/interfaces/crud.interface";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, type FilterQuery, type Model } from "mongoose";

const _ENTITY = "todo";
/** Cache key is `JSON.stringify([id, ownerId])` (2-arg rule in `@DBCache`; `ownerId` first), so one owner never reads another's row. */
const _CACHE_FIELD = "idOwner";

export type TCreateTodoInput = { title: string; description: string | null };
export type TUpdateTodoInput = Partial<{
	title: string;
	description: string | null;
	completed: boolean;
}>;
export type TListTodosInput = {
	completed?: boolean;
	limit: number;
	offset: number;
};

type TLeanTodo = Omit<TTodo, "id"> & { _id: { toString(): string } };

/** Data access for the `todos` collection. Every query is owner-scoped. */
@LogClass()
@Injectable()
export class TodoRepository implements ICRUDRepository<
	TTodo,
	TCreateTodoInput,
	TUpdateTodoInput,
	TListTodosInput
> {
	constructor(
		@InjectModel(Todo.name)
		private readonly _model: Model<TodoDocument>,
	) {}

	/** Inserts a todo for `ownerId`. */
	public async create(
		ownerId: string,
		input: TCreateTodoInput,
	): Promise<TTodo> {
		const doc = await this._model.create({ ownerId, ...input });
		return this._toRow(doc.toObject() as unknown as TLeanTodo);
	}

	/** Newest first; returns the page and the total matching the filter. */
	public async list(
		ownerId: string,
		input: TListTodosInput,
	): Promise<{ items: TTodo[]; total: number }> {
		const filter: FilterQuery<TodoDocument> = {
			ownerId,
			...(input.completed !== undefined ? { completed: input.completed } : {}),
		};
		const [rows, total] = await Promise.all([
			this._model
				.find(filter)
				.sort({ createdAt: -1, _id: -1 })
				.skip(input.offset)
				.limit(input.limit)
				.lean<TLeanTodo[]>(),
			this._model.countDocuments(filter),
		]);
		return { items: rows.map((row) => this._toRow(row)), total };
	}

	/** Null when missing, malformed id, or owned by someone else. */
	@DBCache({ entity: _ENTITY, by: _CACHE_FIELD, ttl: CacheTTL.FIVE_MIN })
	public async findById(ownerId: string, id: string): Promise<TTodo | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOne({ _id: id, ownerId })
			.lean<TLeanTodo>();
		return row ? this._toRow(row) : null;
	}

	/** Applies only the keys present in `input`; null if not found/owned. */
	@DBCacheInvalidate({
		entity: _ENTITY,
		fields: [_CACHE_FIELD],
		resolve: (args) => ({
			[_CACHE_FIELD]: JSON.stringify([args[0], args[1]]),
		}),
	})
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateTodoInput,
	): Promise<TTodo | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findOneAndUpdate({ _id: id, ownerId }, { $set: input }, { new: true })
			.lean<TLeanTodo>();
		return row ? this._toRow(row) : null;
	}

	/** True when a todo was deleted. */
	@DBCacheInvalidate({
		entity: _ENTITY,
		fields: [_CACHE_FIELD],
		resolve: (args) => ({
			[_CACHE_FIELD]: JSON.stringify([args[0], args[1]]),
		}),
	})
	public async delete(ownerId: string, id: string): Promise<boolean> {
		if (!isValidObjectId(id)) {
			return false;
		}
		const result = await this._model.deleteOne({ _id: id, ownerId });
		return result.deletedCount === 1;
	}

	/** Cron helper: removes completed todos last touched before `cutoff`. */
	public async deleteCompletedBefore(cutoff: Date): Promise<number> {
		const result = await this._model.deleteMany({
			completed: true,
			updatedAt: { $lt: cutoff },
		});
		return result.deletedCount;
	}

	/** Maps a lean document to the plain `TTodo` row (`_id` → `id`). */
	private _toRow(row: TLeanTodo): TTodo {
		const { _id, ...rest } = row;
		return { id: _id.toString(), ...rest };
	}
}
