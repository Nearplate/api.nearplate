import { S3DocumentStorageAdapter } from "@/adapters/s3-document-storage.adapter";
import { ErrorMessages } from "@/app/constants/errors";
import type { TConfig } from "@/app/modules/config/config";
import { LogClass } from "@/app/modules/logger";
import { MAX_DOCUMENT_BYTES } from "@/domain/constants/document";
import { extensionForContentType } from "@/domain/constants/upload";
import { RestaurantDocumentStatus } from "@/domain/enums/restaurant-document-status";
import type { RestaurantDocumentType } from "@/domain/enums/restaurant-document-type";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type {
	TCreateDocumentUploadInput,
	TDocumentUploadResult,
	TRestaurantDocumentView,
} from "@/domain/types/restaurant-document.types";
import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { RestaurantDocumentRepository } from "@/repositories/restaurant-document.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import type { TRestaurantDocument } from "@db/schemas/restaurant-document.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import {
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Verification states in which onboarding data may change. Anything else is
 * locked: `pending_review` so the admin reviews what was submitted, and
 * `approved` so verified KYC cannot be swapped out silently.
 */
const _EDITABLE_STATUSES: readonly RestaurantVerificationStatus[] = [
	RestaurantVerificationStatus.Draft,
	RestaurantVerificationStatus.Rejected,
];

/**
 * Restaurant onboarding data: KYC documents in the private documents bucket.
 * Every route is owner-scoped (another owner's restaurant is a 404); writes
 * are 409 unless the restaurant is `draft` or `rejected`.
 */
@LogClass()
@Injectable()
export class RestaurantOnboardingService {
	constructor(
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(RestaurantDocumentRepository)
		private readonly _restaurantDocumentRepository: RestaurantDocumentRepository,
		@Inject(S3DocumentStorageAdapter)
		private readonly _s3DocumentStorageAdapter: S3DocumentStorageAdapter,
		@Inject(BackgroundJobHelper)
		private readonly _backgroundJobHelper: BackgroundJobHelper,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {}

	/**
	 * Issues a presigned POST for one document type and records it as pending,
	 * replacing any earlier upload of that type. When the key changes (renamed
	 * restaurant, different file type) the old object is deleted in the
	 * background.
	 */
	public async createDocumentUpload(
		ownerId: string,
		id: string,
		input: TCreateDocumentUploadInput,
	): Promise<TDocumentUploadResult> {
		const restaurant = await this._getEditable(ownerId, id);
		const previous = await this._restaurantDocumentRepository.findByType(
			ownerId,
			restaurant.id,
			input.type,
		);
		const objectKey = this._documentObjectKey(
			restaurant,
			input.type,
			input.contentType,
		);
		const ttlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_URL_TTL_SECONDS",
		);
		const pendingTtlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_PENDING_TTL_SECONDS",
		);
		const expiresAt = new Date(Date.now() + pendingTtlSeconds * 1000);

		const [row, presignedPost] = await Promise.all([
			this._restaurantDocumentRepository.upsertPending({
				ownerId,
				restaurantId: restaurant.id,
				type: input.type,
				objectKey,
				contentType: input.contentType,
				size: input.size,
				expiresAt,
			}),
			this._s3DocumentStorageAdapter.createPresignedPost(
				objectKey,
				input.contentType,
				MAX_DOCUMENT_BYTES,
				ttlSeconds,
			),
		]);
		if (!row) {
			throw new NotFoundException();
		}
		if (previous && previous.objectKey !== objectKey) {
			this._deleteInBackground(previous.objectKey);
		}
		return {
			type: row.type,
			url: presignedPost.url,
			fields: presignedPost.fields,
			expiresAt,
		};
	}

	/**
	 * Confirms a pending document landed in S3 with the requested content type
	 * and within the size cap (409 otherwise). Confirming an already-uploaded
	 * document is a no-op that returns it.
	 */
	public async confirmDocumentUpload(
		ownerId: string,
		id: string,
		type: RestaurantDocumentType,
	): Promise<TRestaurantDocumentView> {
		const restaurant = await this._getEditable(ownerId, id);
		const row = await this._restaurantDocumentRepository.findByType(
			ownerId,
			restaurant.id,
			type,
		);
		if (!row) {
			throw new NotFoundException();
		}
		if (row.status === RestaurantDocumentStatus.Uploaded) {
			return this._toView(row);
		}
		const head = await this._s3DocumentStorageAdapter.headObject(row.objectKey);
		if (
			!head ||
			head.contentType !== row.contentType ||
			head.sizeBytes <= 0 ||
			head.sizeBytes > MAX_DOCUMENT_BYTES
		) {
			throw new ConflictException(
				ErrorMessages.restaurantDocumentUploadMismatch(type),
			);
		}
		const uploaded = await this._restaurantDocumentRepository.markUploaded(
			ownerId,
			restaurant.id,
			type,
			row.objectKey,
			head.sizeBytes,
		);
		if (!uploaded) {
			// A newer presign for this type replaced the row mid-confirm.
			throw new ConflictException(
				ErrorMessages.restaurantDocumentUploadMismatch(type),
			);
		}
		return this._toView(uploaded);
	}

	/** The caller's documents on `id`, readable in every verification state. */
	public async listDocuments(
		ownerId: string,
		id: string,
	): Promise<TRestaurantDocumentView[]> {
		const restaurant = await this._getRestaurant(ownerId, id);
		const rows = await this._restaurantDocumentRepository.listForRestaurant(
			ownerId,
			restaurant.id,
		);
		return Promise.all(rows.map((row) => this._toView(row)));
	}

	/** Deletes a document row and its S3 object; 404 if there is none. */
	public async removeDocument(
		ownerId: string,
		id: string,
		type: RestaurantDocumentType,
	): Promise<void> {
		const restaurant = await this._getEditable(ownerId, id);
		const deleted = await this._restaurantDocumentRepository.delete(
			ownerId,
			restaurant.id,
			type,
		);
		if (!deleted) {
			throw new NotFoundException();
		}
		await this._s3DocumentStorageAdapter.deleteObjects([deleted.objectKey]);
	}

	/** The caller's restaurant or 404. */
	private async _getRestaurant(
		ownerId: string,
		id: string,
	): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findById(ownerId, id);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/** The caller's restaurant, or 409 when its onboarding data is locked. */
	private async _getEditable(
		ownerId: string,
		id: string,
	): Promise<TRestaurant> {
		const restaurant = await this._getRestaurant(ownerId, id);
		if (!_EDITABLE_STATUSES.includes(restaurant.verificationStatus)) {
			throw new ConflictException(
				ErrorMessages.restaurantOnboardingLocked(restaurant.verificationStatus),
			);
		}
		return restaurant;
	}

	/** Adds a short-lived presigned GET URL to confirmed documents only. */
	private async _toView(
		row: TRestaurantDocument,
	): Promise<TRestaurantDocumentView> {
		if (row.status !== RestaurantDocumentStatus.Uploaded) {
			return { ...row, url: null };
		}
		const url = await this._s3DocumentStorageAdapter.presignedGetUrl(
			row.objectKey,
			this._configService.getOrThrow<number>("DOCUMENT_URL_TTL_SECONDS"),
		);
		return { ...row, url };
	}

	/**
	 * `{restaurantId}_{restaurantName}_{type}.{ext}`, server-generated only.
	 * Whitespace in the name becomes `_`; anything outside `[A-Za-z0-9_-]`
	 * (slashes, dots, control characters) is stripped so the key stays
	 * S3-safe and can never introduce a path segment.
	 */
	private _documentObjectKey(
		restaurant: TRestaurant,
		type: RestaurantDocumentType,
		contentType: string,
	): string {
		const name =
			restaurant.name
				.trim()
				.replace(/\s+/g, "_")
				.replace(/[^A-Za-z0-9_-]/g, "")
				.replace(/_+/g, "_")
				.replace(/^_+|_+$/g, "") || "restaurant";
		const extension = extensionForContentType(contentType);
		return `${restaurant.id}_${name}_${type}.${extension}`;
	}

	/** Deletes a replaced document object after the response is sent. */
	private _deleteInBackground(objectKey: string): void {
		this._backgroundJobHelper.run(
			() => this._s3DocumentStorageAdapter.deleteObjects([objectKey]),
			{ name: `delete-document:${objectKey}` },
		);
	}
}
