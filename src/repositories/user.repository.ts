import { CacheTTL } from "@/app/constants/cache-ttl";
import { LogClass } from "@/app/modules/logger";
import { DBCache, DBCacheInvalidate } from "@/decorators/db-cache.decorator";
import {
	User,
	type TUser,
	type TUserRole,
	type UserDocument,
} from "@db/schemas/user.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type Model, isValidObjectId } from "mongoose";

const _ENTITY = "user";
const _DUPLICATE_KEY_ERROR = 11000;
const _CACHE_FIELDS = ["id", "email", "googleSub"];

export type TCreateUserInput = {
	email: string;
	role: TUserRole;
	name?: string | null;
	avatarUrl?: string | null;
	googleSub?: string;
	emailVerifiedAt?: Date | null;
};

export type TUpdateUserInput = Partial<{
	name: string | null;
	avatarUrl: string | null;
	googleSub: string;
	emailVerifiedAt: Date;
	lastLoginAt: Date;
}>;

type TLeanUser = Omit<TUser, "id" | "googleSub"> & {
	_id: { toString(): string };
	googleSub?: string;
};

/**
 * Data access for `users`. Reads are cached (5 min), so cached rows come back
 * with dates as ISO strings -- do not call `Date` methods on them. Editing a
 * user directly in the database leaves the cache stale for up to that TTL.
 */
@LogClass()
@Injectable()
export class UserRepository {
	constructor(
		@InjectModel(User.name)
		private readonly _model: Model<UserDocument>,
	) {}

	/** Null when missing or the id is malformed. */
	@DBCache({ entity: _ENTITY, by: "id", ttl: CacheTTL.FIVE_MIN })
	public async findById(id: string): Promise<TUser | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model.findById(id).lean<TLeanUser>();
		return row ? this._toRow(row) : null;
	}

	/** `email` must already be lowercased. */
	@DBCache({ entity: _ENTITY, by: "email", ttl: CacheTTL.FIVE_MIN })
	public async findByEmail(email: string): Promise<TUser | null> {
		const row = await this._model.findOne({ email }).lean<TLeanUser>();
		return row ? this._toRow(row) : null;
	}

	/** Lookup by Google's stable subject id. */
	@DBCache({ entity: _ENTITY, by: "googleSub", ttl: CacheTTL.FIVE_MIN })
	public async findByGoogleSub(googleSub: string): Promise<TUser | null> {
		const row = await this._model.findOne({ googleSub }).lean<TLeanUser>();
		return row ? this._toRow(row) : null;
	}

	/**
	 * Inserts a user. Returns null when the email (or Google sub) is already
	 * taken -- a lost signup race -- so the caller can re-read the winner.
	 */
	public async create(input: TCreateUserInput): Promise<TUser | null> {
		try {
			const doc = await this._model.create(input);
			return this._toRow(doc.toObject() as unknown as TLeanUser);
		} catch (error) {
			if ((error as { code?: number }).code === _DUPLICATE_KEY_ERROR) {
				return null;
			}
			throw error;
		}
	}

	/** Applies only the keys present in `patch`; null when the user is gone. */
	@DBCacheInvalidate({
		entity: _ENTITY,
		fields: _CACHE_FIELDS,
		resolve: (_args, result) => (result as TUser | null) ?? undefined,
	})
	public async update(
		id: string,
		patch: TUpdateUserInput,
	): Promise<TUser | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findByIdAndUpdate(id, { $set: patch }, { new: true })
			.lean<TLeanUser>();
		return row ? this._toRow(row) : null;
	}

	/** Maps a lean document to the plain `TUser` row (`_id` → `id`). */
	private _toRow(row: TLeanUser): TUser {
		const { _id, googleSub, ...rest } = row;
		return { id: _id.toString(), googleSub: googleSub ?? null, ...rest };
	}
}
