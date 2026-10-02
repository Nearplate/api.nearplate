import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	restaurantKyc,
	type TRestaurantKyc,
} from "@db/schemas/restaurant-kyc.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

/** Columns a KYC upsert may write; ciphertext only for PAN/account number. */
export type TKycPatch = Partial<
	Pick<
		TRestaurantKyc,
		| "panNumberEncrypted"
		| "fssaiNumber"
		| "accountHolderName"
		| "accountNumberEncrypted"
		| "ifscCode"
		| "bankName"
	>
>;

/**
 * Data access for `restaurant_kyc` (one row per restaurant). Owner queries
 * are scoped by `ownerId`, so another owner's KYC is never found.
 */
@LogClass()
@Injectable()
export class RestaurantKycRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** The owner's KYC row for `restaurantId`; null when none is saved yet. */
	public async findByRestaurantId(
		ownerId: string,
		restaurantId: string,
	): Promise<TRestaurantKyc | null> {
		const [row] = await this._databaseService.db
			.select()
			.from(restaurantKyc)
			.where(
				and(
					eq(restaurantKyc.ownerId, ownerId),
					eq(restaurantKyc.restaurantId, restaurantId),
				),
			);
		return row ?? null;
	}

	/**
	 * The KYC row for `restaurantId` regardless of owner. Admin review only;
	 * callers must already have authorised access to the restaurant.
	 */
	public async findByRestaurantIdAny(
		restaurantId: string,
	): Promise<TRestaurantKyc | null> {
		const [row] = await this._databaseService.db
			.select()
			.from(restaurantKyc)
			.where(eq(restaurantKyc.restaurantId, restaurantId));
		return row ?? null;
	}

	/**
	 * Creates the row or merges `patch` into it (keys absent from `patch` are
	 * left alone). The conflict update is owner-scoped.
	 */
	public async upsert(
		ownerId: string,
		restaurantId: string,
		patch: TKycPatch,
	): Promise<TRestaurantKyc | null> {
		const [row] = await this._databaseService.db
			.insert(restaurantKyc)
			.values({ ...patch, ownerId, restaurantId })
			.onConflictDoUpdate({
				target: restaurantKyc.restaurantId,
				set: { ...patch, updatedAt: sql`now()` },
				setWhere: eq(restaurantKyc.ownerId, ownerId),
			})
			.returning();
		return row ?? null;
	}
}
