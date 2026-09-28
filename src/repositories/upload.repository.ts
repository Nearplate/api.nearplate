import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import type { UploadKind } from "@/domain/enums/upload-kind";
import { isUuid } from "@/repositories/repository.utils";
import { uploads, type TUpload } from "@db/schemas/upload.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, lt } from "drizzle-orm";

export type TCreateUploadInput = {
	ownerId: string;
	restaurantId: string;
	/** Set only for a `menu_item` kind upload. */
	menuItemId?: string;
	kind: UploadKind;
	objectKey: string;
	contentType: string;
	expiresAt: Date;
};

/**
 * Data access for `uploads` -- pending (unconfirmed) S3 uploads only. A row
 * is removed the moment it is confirmed, cancelled or swept.
 */
@LogClass()
@Injectable()
export class UploadRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Inserts a pending upload row. */
	public async create(input: TCreateUploadInput): Promise<TUpload> {
		const [row] = await this._databaseService.db
			.insert(uploads)
			.values(input)
			.returning();
		return row;
	}

	/**
	 * A pending, unexpired upload owned by `ownerId` for `restaurantId`
	 * (and `menuItemId`, when given); null otherwise.
	 */
	public async findPending(
		ownerId: string,
		restaurantId: string,
		id: string,
		menuItemId?: string,
	): Promise<TUpload | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.select()
			.from(uploads)
			.where(
				and(
					eq(uploads.id, id),
					eq(uploads.ownerId, ownerId),
					eq(uploads.restaurantId, restaurantId),
					menuItemId ? eq(uploads.menuItemId, menuItemId) : undefined,
					gt(uploads.expiresAt, new Date()),
				),
			);
		return row ?? null;
	}

	/**
	 * Atomically deletes and returns the pending upload, so confirm/cancel can
	 * never race the sweep or each other into double-deleting the S3 object.
	 */
	public async consume(
		ownerId: string,
		restaurantId: string,
		id: string,
		menuItemId?: string,
	): Promise<TUpload | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.delete(uploads)
			.where(
				and(
					eq(uploads.id, id),
					eq(uploads.ownerId, ownerId),
					eq(uploads.restaurantId, restaurantId),
					menuItemId ? eq(uploads.menuItemId, menuItemId) : undefined,
				),
			)
			.returning();
		return row ?? null;
	}

	/** Pending rows past their `expiresAt`, oldest first, capped at `limit`. */
	public async listExpired(limit: number): Promise<TUpload[]> {
		return this._databaseService.db
			.select()
			.from(uploads)
			.where(lt(uploads.expiresAt, new Date()))
			.limit(limit);
	}

	/** Deletes the given rows by id; used by the sweep after their S3 objects are gone. */
	public async deleteByIds(ids: string[]): Promise<void> {
		if (ids.length === 0) {
			return;
		}
		await this._databaseService.db
			.delete(uploads)
			.where(inArray(uploads.id, ids));
	}
}
