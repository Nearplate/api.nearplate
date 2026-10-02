import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import { RestaurantDocumentStatus } from "@/domain/enums/restaurant-document-status";
import type { RestaurantDocumentType } from "@/domain/enums/restaurant-document-type";
import {
	restaurantDocuments,
	type TRestaurantDocument,
} from "@db/schemas/restaurant-document.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";

export type TUpsertPendingDocumentInput = {
	ownerId: string;
	restaurantId: string;
	type: RestaurantDocumentType;
	objectKey: string;
	contentType: string;
	size: number;
	expiresAt: Date;
};

/**
 * Data access for `restaurant_documents`. Owner queries are scoped by both
 * `ownerId` and `restaurantId`, so another owner's document is never found.
 */
@LogClass()
@Injectable()
export class RestaurantDocumentRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/**
	 * Inserts the (restaurant, type) row as `pending`, or resets an existing
	 * one to `pending` with the new key/metadata. The conflict update is
	 * owner-scoped, so it can never take over another owner's row.
	 */
	public async upsertPending(
		input: TUpsertPendingDocumentInput,
	): Promise<TRestaurantDocument | null> {
		const values = {
			...input,
			status: RestaurantDocumentStatus.Pending,
		};
		const [row] = await this._databaseService.db
			.insert(restaurantDocuments)
			.values(values)
			.onConflictDoUpdate({
				target: [restaurantDocuments.restaurantId, restaurantDocuments.type],
				set: {
					objectKey: values.objectKey,
					contentType: values.contentType,
					size: values.size,
					status: values.status,
					expiresAt: values.expiresAt,
					updatedAt: sql`now()`,
				},
				setWhere: eq(restaurantDocuments.ownerId, input.ownerId),
			})
			.returning();
		return row ?? null;
	}

	/** The owner's document of `type` on `restaurantId`; null otherwise. */
	public async findByType(
		ownerId: string,
		restaurantId: string,
		type: RestaurantDocumentType,
	): Promise<TRestaurantDocument | null> {
		const [row] = await this._databaseService.db
			.select()
			.from(restaurantDocuments)
			.where(this._scope(ownerId, restaurantId, type));
		return row ?? null;
	}

	/**
	 * Flips a pending row to `uploaded`, but only while it still points at
	 * `objectKey` -- a newer presign for the same type wins over a stale confirm.
	 */
	public async markUploaded(
		ownerId: string,
		restaurantId: string,
		type: RestaurantDocumentType,
		objectKey: string,
	): Promise<TRestaurantDocument | null> {
		const [row] = await this._databaseService.db
			.update(restaurantDocuments)
			.set({
				status: RestaurantDocumentStatus.Uploaded,
				expiresAt: null,
				updatedAt: sql`now()`,
			})
			.where(
				and(
					this._scope(ownerId, restaurantId, type),
					eq(restaurantDocuments.objectKey, objectKey),
					eq(restaurantDocuments.status, RestaurantDocumentStatus.Pending),
				),
			)
			.returning();
		return row ?? null;
	}

	/** Every document (pending and uploaded) the owner has on `restaurantId`. */
	public async listForRestaurant(
		ownerId: string,
		restaurantId: string,
	): Promise<TRestaurantDocument[]> {
		return this._databaseService.db
			.select()
			.from(restaurantDocuments)
			.where(
				and(
					eq(restaurantDocuments.ownerId, ownerId),
					eq(restaurantDocuments.restaurantId, restaurantId),
				),
			)
			.orderBy(asc(restaurantDocuments.type));
	}

	/**
	 * Every document on `restaurantId` regardless of owner. Admin review only;
	 * callers must already have authorised access to the restaurant.
	 */
	public async listForRestaurantAny(
		restaurantId: string,
	): Promise<TRestaurantDocument[]> {
		return this._databaseService.db
			.select()
			.from(restaurantDocuments)
			.where(eq(restaurantDocuments.restaurantId, restaurantId))
			.orderBy(asc(restaurantDocuments.type));
	}

	/** Deletes and returns the owner's document of `type`; null when absent. */
	public async delete(
		ownerId: string,
		restaurantId: string,
		type: RestaurantDocumentType,
	): Promise<TRestaurantDocument | null> {
		const [row] = await this._databaseService.db
			.delete(restaurantDocuments)
			.where(this._scope(ownerId, restaurantId, type))
			.returning();
		return row ?? null;
	}

	/** Pending rows past their `expiresAt`, oldest first, capped at `limit`. */
	public async listExpiredPending(
		limit: number,
	): Promise<TRestaurantDocument[]> {
		return this._databaseService.db
			.select()
			.from(restaurantDocuments)
			.where(
				and(
					eq(restaurantDocuments.status, RestaurantDocumentStatus.Pending),
					lt(restaurantDocuments.expiresAt, new Date()),
				),
			)
			.orderBy(asc(restaurantDocuments.expiresAt))
			.limit(limit);
	}

	/**
	 * Deletes the given rows only while they are still pending, so a confirm
	 * that lands mid-sweep keeps its row.
	 */
	public async deletePendingByIds(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}
		await this._databaseService.db
			.delete(restaurantDocuments)
			.where(
				and(
					inArray(restaurantDocuments.id, ids),
					eq(restaurantDocuments.status, RestaurantDocumentStatus.Pending),
				),
			);
	}

	/** Owner + restaurant + type filter shared by single-row queries. */
	private _scope(
		ownerId: string,
		restaurantId: string,
		type: RestaurantDocumentType,
	) {
		return and(
			eq(restaurantDocuments.ownerId, ownerId),
			eq(restaurantDocuments.restaurantId, restaurantId),
			eq(restaurantDocuments.type, type),
		);
	}
}
