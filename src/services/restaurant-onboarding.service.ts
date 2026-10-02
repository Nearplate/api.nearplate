import { S3DocumentStorageAdapter } from "@/adapters/s3-document-storage.adapter";
import { ErrorMessages } from "@/app/constants/errors";
import type { TConfig } from "@/app/modules/config/config";
import { LogClass } from "@/app/modules/logger";
import { MAX_DOCUMENT_BYTES } from "@/domain/constants/document";
import { extensionForContentType } from "@/domain/constants/upload";
import { RestaurantDocumentStatus } from "@/domain/enums/restaurant-document-status";
import {
	RESTAURANT_DOCUMENT_TYPES,
	type RestaurantDocumentType,
} from "@/domain/enums/restaurant-document-type";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type {
	TCreateDocumentUploadInput,
	TDocumentUploadResult,
	TRestaurantDocumentView,
} from "@/domain/types/restaurant-document.types";
import type {
	TKycDetails,
	TUpdateKycInput,
} from "@/domain/types/restaurant-kyc.types";
import type { TOnboardingReviewData } from "@/domain/types/restaurant-review.types";
import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { EncryptionHelper } from "@/helpers/encryption.helper";
import { RestaurantDocumentRepository } from "@/repositories/restaurant-document.repository";
import {
	RestaurantKycRepository,
	type TKycPatch,
} from "@/repositories/restaurant-kyc.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import type { TRestaurantDocument } from "@db/schemas/restaurant-document.schema";
import type { TRestaurantKyc } from "@db/schemas/restaurant-kyc.schema";
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

/** Batch size for one sweep run; keeps a single cron tick bounded. */
const _SWEEP_BATCH_SIZE = 200;

/** KYC fields required before submitting for review, in reporting order. */
const _REQUIRED_KYC_FIELDS = [
	"panNumber",
	"fssaiNumber",
	"accountHolderName",
	"accountNumber",
	"ifscCode",
	"bankName",
] as const;

/** KYC details before anything has been saved. */
const _EMPTY_KYC: TKycDetails = {
	panNumber: null,
	fssaiNumber: null,
	accountHolderName: null,
	accountNumber: null,
	ifscCode: null,
	bankName: null,
	updatedAt: null,
};

/**
 * Restaurant onboarding data: KYC documents in the private documents bucket
 * and KYC/bank details (PAN and account number encrypted at rest). Every
 * route is owner-scoped (another owner's restaurant is a 404); writes are 409
 * unless the restaurant is `draft` or `rejected`.
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
		@Inject(RestaurantKycRepository)
		private readonly _restaurantKycRepository: RestaurantKycRepository,
		@Inject(EncryptionHelper)
		private readonly _encryptionHelper: EncryptionHelper,
	) {}

	/**
	 * What still blocks `restaurantId` from review: every document type not yet
	 * confirmed (pending uploads do not count), then every missing KYC field,
	 * by its wire name. Empty when the restaurant is ready to submit.
	 */
	public async listMissingForReview(
		ownerId: string,
		restaurantId: string,
	): Promise<string[]> {
		const [documents, kyc] = await Promise.all([
			this._restaurantDocumentRepository.listForRestaurant(
				ownerId,
				restaurantId,
			),
			this._restaurantKycRepository.findByRestaurantId(ownerId, restaurantId),
		]);
		const uploaded = new Set(
			documents
				.filter((doc) => doc.status === RestaurantDocumentStatus.Uploaded)
				.map((doc) => doc.type),
		);
		const saved: Record<(typeof _REQUIRED_KYC_FIELDS)[number], unknown> = {
			panNumber: kyc?.panNumberEncrypted,
			fssaiNumber: kyc?.fssaiNumber,
			accountHolderName: kyc?.accountHolderName,
			accountNumber: kyc?.accountNumberEncrypted,
			ifscCode: kyc?.ifscCode,
			bankName: kyc?.bankName,
		};
		return [
			...RESTAURANT_DOCUMENT_TYPES.filter((type) => !uploaded.has(type)),
			..._REQUIRED_KYC_FIELDS.filter((field) => !saved[field]),
		];
	}

	/**
	 * Onboarding data for admin review, regardless of owner: decrypted KYC
	 * (null before the first save) and every document. Callers must already
	 * have authorised access to `restaurantId`.
	 */
	public async getOnboardingForReview(
		restaurantId: string,
	): Promise<TOnboardingReviewData> {
		const [kyc, documents] = await Promise.all([
			this._restaurantKycRepository.findByRestaurantIdAny(restaurantId),
			this._restaurantDocumentRepository.listForRestaurantAny(restaurantId),
		]);
		return {
			kyc: kyc ? this._decryptKyc(kyc) : null,
			documents: await Promise.all(documents.map((row) => this._toView(row))),
		};
	}

	/** The caller's decrypted KYC details (all null before the first save). */
	public async getKyc(ownerId: string, id: string): Promise<TKycDetails> {
		const restaurant = await this._getRestaurant(ownerId, id);
		const row = await this._restaurantKycRepository.findByRestaurantId(
			ownerId,
			restaurant.id,
		);
		return row ? this._decryptKyc(row) : _EMPTY_KYC;
	}

	/**
	 * Saves the KYC fields present in `input` (a partial draft is fine) and
	 * returns the merged details. PAN and account number are encrypted before
	 * they reach the repository.
	 */
	public async updateKyc(
		ownerId: string,
		id: string,
		input: TUpdateKycInput,
	): Promise<TKycDetails> {
		const restaurant = await this._getEditable(ownerId, id);
		const { panNumber, accountNumber, ...plain } = input;
		const patch: TKycPatch = {
			...plain,
			...(panNumber !== undefined && {
				panNumberEncrypted: this._encryptionHelper.encrypt(panNumber),
			}),
			...(accountNumber !== undefined && {
				accountNumberEncrypted: this._encryptionHelper.encrypt(accountNumber),
			}),
		};
		const row = await this._restaurantKycRepository.upsert(
			ownerId,
			restaurant.id,
			patch,
		);
		if (!row) {
			throw new NotFoundException();
		}
		return this._decryptKyc(row);
	}

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

	/**
	 * Deletes every pending document upload past its `expiresAt`, oldest
	 * first. Objects go before rows, so a mid-sweep failure leaves the row for
	 * the next run instead of orphaning the object; rows confirmed mid-sweep
	 * are kept (only still-pending rows are deleted).
	 */
	public async sweepExpiredDocumentUploads(): Promise<void> {
		const expired =
			await this._restaurantDocumentRepository.listExpiredPending(
				_SWEEP_BATCH_SIZE,
			);
		if (expired.length === 0) {
			return;
		}
		await this._s3DocumentStorageAdapter.deleteObjects(
			expired.map((document) => document.objectKey),
		);
		await this._restaurantDocumentRepository.deletePendingByIds(
			expired.map((document) => document.id),
		);
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

	/** Row → decrypted details. */
	private _decryptKyc(row: TRestaurantKyc): TKycDetails {
		return {
			panNumber: row.panNumberEncrypted
				? this._encryptionHelper.decrypt(row.panNumberEncrypted)
				: null,
			fssaiNumber: row.fssaiNumber,
			accountHolderName: row.accountHolderName,
			accountNumber: row.accountNumberEncrypted
				? this._encryptionHelper.decrypt(row.accountNumberEncrypted)
				: null,
			ifscCode: row.ifscCode,
			bankName: row.bankName,
			updatedAt: row.updatedAt,
		};
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
