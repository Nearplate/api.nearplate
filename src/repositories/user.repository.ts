import { CacheTTL } from "@/app/constants/cache-ttl";
import { LogClass } from "@/app/modules/logger";
import { DatabaseService } from "@/app/modules/database";
import { DBCache, DBCacheInvalidate } from "@/decorators/db-cache.decorator";
import { isUniqueViolation, isUuid } from "@/repositories/repository.utils";
import { users, type TUser, type TUserRole } from "@db/schemas/user.schema";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

const _ENTITY = "user";
const _CACHE_FIELDS = ["id", "email", "googleSub"];

export type TCreateUserInput = {
	email: string;
	role: TUserRole;
	firstName?: string | null;
	lastName?: string | null;
	isOnboarded?: boolean;
	avatarUrl?: string | null;
	googleSub?: string;
	emailVerifiedAt?: Date | null;
};

export type TUpdateUserInput = Partial<{
	firstName: string | null;
	lastName: string | null;
	isOnboarded: boolean;
	avatarUrl: string | null;
	googleSub: string;
	emailVerifiedAt: Date;
	lastLoginAt: Date;
}>;

/**
 * Data access for `users`. Reads are cached (5 min), so cached rows come back
 * with dates as ISO strings -- do not call `Date` methods on them. Editing a
 * user directly in the database leaves the cache stale for up to that TTL.
 */
@LogClass()
@Injectable()
export class UserRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Null when missing or the id is malformed. */
	@DBCache({ entity: _ENTITY, by: "id", ttl: CacheTTL.FIVE_MIN })
	public async findById(id: string): Promise<TUser | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.select()
			.from(users)
			.where(eq(users.id, id));
		return row ?? null;
	}

	/** `email` must already be lowercased. */
	@DBCache({ entity: _ENTITY, by: "email", ttl: CacheTTL.FIVE_MIN })
	public async findByEmail(email: string): Promise<TUser | null> {
		const [row] = await this._databaseService.db
			.select()
			.from(users)
			.where(eq(users.email, email));
		return row ?? null;
	}

	/** Lookup by Google's stable subject id. */
	@DBCache({ entity: _ENTITY, by: "googleSub", ttl: CacheTTL.FIVE_MIN })
	public async findByGoogleSub(googleSub: string): Promise<TUser | null> {
		const [row] = await this._databaseService.db
			.select()
			.from(users)
			.where(eq(users.googleSub, googleSub));
		return row ?? null;
	}

	/**
	 * Inserts a user. Returns null when the email (or Google sub) is already
	 * taken -- a lost signup race -- so the caller can re-read the winner.
	 */
	public async create(input: TCreateUserInput): Promise<TUser | null> {
		try {
			const [row] = await this._databaseService.db
				.insert(users)
				.values(input)
				.returning();
			return row;
		} catch (error) {
			if (isUniqueViolation(error)) {
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
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.update(users)
			.set(patch)
			.where(eq(users.id, id))
			.returning();
		return row ?? null;
	}
}
