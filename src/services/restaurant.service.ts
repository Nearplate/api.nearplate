import { S3StorageAdapter } from "@/adapters/s3-storage.adapter";
import { ErrorMessages } from "@/app/constants/errors";
import type { TConfig } from "@/app/modules/config/config";
import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	ALLOWED_IMAGE_CONTENT_TYPES,
	MAX_UPLOAD_BYTES,
	extensionForContentType,
} from "@/domain/constants/upload";
import { UploadKind } from "@/domain/enums/upload-kind";
import type {
	TCreateMenuItemInput,
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type { TPage } from "@/domain/types/page.types";
import type {
	TCoordinates,
	TCreateRestaurantInput,
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
	TUpdateRestaurantInput,
} from "@/domain/types/restaurant.types";
import type {
	TCreateImageUploadInput,
	TCreateMenuItemImageUploadInput,
	TImageUploadResponse,
} from "@/domain/types/upload.types";
import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { QrCodeHelper } from "@/helpers/qr-code.helper";
import type { OrderStatus } from "@/domain/enums/order-status";
import type { TListOrdersInput } from "@/domain/types/order.types";
import { AddressRepository } from "@/repositories/address.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import {
	RestaurantRepository,
	type TNearbyRestaurant,
} from "@/repositories/restaurant.repository";
import { UploadRepository } from "@/repositories/upload.repository";
import { OrderService } from "@/services/order.service";
import { RestaurantOnboardingService } from "@/services/restaurant-onboarding.service";
import type { TQrCodeResponse } from "@/transformers/restaurant.dto";
import type { TGeoPoint } from "@db/schemas/geo";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TOrder } from "@db/schemas/order.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { randomUUID } from "node:crypto";
import {
	BadRequestException,
	ConflictException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** Verification states an owner may submit for review from. */
const _SUBMITTABLE_STATUSES: readonly RestaurantVerificationStatus[] = [
	RestaurantVerificationStatus.Draft,
	RestaurantVerificationStatus.Rejected,
];

/** Batch size for one sweep run; keeps a single cron tick bounded. */
const _SWEEP_BATCH_SIZE = 200;

/**
 * Restaurant and menu business logic. A restaurant or menu item that is
 * missing, not the caller's, or under a different restaurant is a 404.
 * Multi-table writes (`create`, `update`, `remove`) run inside a Postgres
 * transaction, so a failure partway through leaves nothing behind -- no
 * manual compensation is needed.
 */
@LogClass()
@Injectable()
export class RestaurantService {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(RestaurantRepository)
		private readonly _restaurantRepository: RestaurantRepository,
		@Inject(AddressRepository)
		private readonly _addressRepository: AddressRepository,
		@Inject(MenuItemRepository)
		private readonly _menuItemRepository: MenuItemRepository,
		@Inject(QrCodeHelper)
		private readonly _qrCodeHelper: QrCodeHelper,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
		@Inject(OrderService)
		private readonly _orderService: OrderService,
		@Inject(UploadRepository)
		private readonly _uploadRepository: UploadRepository,
		@Inject(S3StorageAdapter)
		private readonly _s3StorageAdapter: S3StorageAdapter,
		@Inject(BackgroundJobHelper)
		private readonly _backgroundJobHelper: BackgroundJobHelper,
		@Inject(RestaurantOnboardingService)
		private readonly _restaurantOnboardingService: RestaurantOnboardingService,
	) {}

	/**
	 * Creates the address, then the restaurant, in one transaction. The
	 * caller's role is not changed: only `restaurant` accounts reach this.
	 */
	public async create(
		ownerId: string,
		input: TCreateRestaurantInput,
	): Promise<TRestaurant> {
		return this._databaseService.transaction(async () => {
			const address = await this._addressRepository.create(input.address);
			return this._restaurantRepository.create(ownerId, {
				name: input.name,
				cuisines: input.cuisines,
				isPureVeg: input.isPureVeg,
				description: input.description,
				logoUrl: input.logoUrl,
				bannerUrl: input.bannerUrl,
				location: this._toPoint(input.coordinates),
				addressId: address.id,
			});
		});
	}

	/** The caller's restaurants. */
	public list(
		ownerId: string,
		query: TListRestaurantsInput,
	): Promise<TPage<TRestaurant>> {
		return this._restaurantRepository.list(ownerId, query);
	}

	/** The caller's restaurant or 404. */
	public async get(ownerId: string, id: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findById(ownerId, id);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/**
	 * Updates fields and/or the address, and the denormalized location on its
	 * menu items when coordinates move, all in one transaction. The slug never
	 * changes.
	 */
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateRestaurantInput,
	): Promise<TRestaurant> {
		const result = await this._databaseService.transaction(async () => {
			const current = await this.get(ownerId, id);
			const { address, coordinates, ...fields } = input;

			if (address && Object.keys(address).length > 0) {
				await this._addressRepository.update(current.address.id, address);
			}
			const location = coordinates ? this._toPoint(coordinates) : undefined;
			const patch = { ...fields, ...(location ? { location } : {}) };
			if (Object.keys(patch).length > 0) {
				const updated = await this._restaurantRepository.update(
					ownerId,
					id,
					patch,
				);
				if (!updated) {
					throw new NotFoundException();
				}
			}
			if (location) {
				await this._menuItemRepository.updateLocationByRestaurant(id, location);
			}
			return { previous: current, restaurant: await this.get(ownerId, id) };
		});
		this._deleteReplacedImage(
			result.previous.logoUrl,
			result.restaurant.logoUrl,
		);
		this._deleteReplacedImage(
			result.previous.bannerUrl,
			result.restaurant.bannerUrl,
		);
		return result.restaurant;
	}

	/**
	 * Deletes the restaurant and its address in one transaction; menu items
	 * cascade with the restaurant at the database level.
	 */
	public async remove(ownerId: string, id: string): Promise<void> {
		const current = await this._databaseService.transaction(async () => {
			const restaurant = await this.get(ownerId, id);
			const deleted = await this._restaurantRepository.delete(ownerId, id);
			if (!deleted) {
				throw new NotFoundException();
			}
			await this._addressRepository.delete(restaurant.address.id);
			return restaurant;
		});
		this._deleteReplacedImage(current.logoUrl, null);
		this._deleteReplacedImage(current.bannerUrl, null);
	}

	/**
	 * Puts the caller's restaurant online or offline. Going online requires
	 * the restaurant to be approved (409); going offline is always allowed.
	 */
	public async setStatus(
		ownerId: string,
		id: string,
		status: RestaurantStatus,
	): Promise<TRestaurant> {
		if (status === RestaurantStatus.Online) {
			const current = await this.get(ownerId, id);
			if (
				current.verificationStatus !== RestaurantVerificationStatus.Approved
			) {
				throw new ConflictException(
					ErrorMessages.restaurantNotApproved(current.name),
				);
			}
		}
		const updated = await this._restaurantRepository.update(ownerId, id, {
			status,
		});
		if (!updated) {
			throw new NotFoundException();
		}
		return updated;
	}

	/**
	 * Sends a draft or rejected restaurant to admin review. 409 when it is in
	 * any other verification state or its required data is incomplete.
	 */
	public async submitForReview(
		ownerId: string,
		id: string,
	): Promise<TRestaurant> {
		const current = await this.get(ownerId, id);
		if (!_SUBMITTABLE_STATUSES.includes(current.verificationStatus)) {
			throw new ConflictException(
				ErrorMessages.restaurantVerificationTransitionNotAllowed(
					current.verificationStatus,
					RestaurantVerificationStatus.PendingReview,
				),
			);
		}
		await this._assertReadyForReview(ownerId, current);
		const submitted = await this._restaurantRepository.updateVerification(
			id,
			_SUBMITTABLE_STATUSES,
			{
				verificationStatus: RestaurantVerificationStatus.PendingReview,
				submittedAt: new Date(),
				rejectionReason: null,
			},
		);
		if (!submitted) {
			throw new ConflictException(
				ErrorMessages.restaurantVerificationTransitionNotAllowed(
					current.verificationStatus,
					RestaurantVerificationStatus.PendingReview,
				),
			);
		}
		return submitted;
	}

	/** Public lookup by slug; an offline restaurant is still returned. */
	public async getBySlug(slug: string): Promise<TRestaurant> {
		const restaurant = await this._restaurantRepository.findBySlug(slug);
		if (!restaurant) {
			throw new NotFoundException();
		}
		return restaurant;
	}

	/** Public search: online restaurants near a point, nearest first. */
	public nearby(input: TNearbyRestaurantsInput): Promise<TNearbyRestaurant[]> {
		return this._restaurantRepository.nearby(input);
	}

	/**
	 * Creates an item on the caller's own restaurant (404 if it is missing or
	 * someone else's) and copies the restaurant's location onto it.
	 */
	public async createMenuItem(
		ownerId: string,
		restaurantId: string,
		input: TCreateMenuItemInput,
	): Promise<TMenuItem> {
		const restaurant = await this.get(ownerId, restaurantId);
		return this._menuItemRepository.create(ownerId, {
			...input,
			restaurantId: restaurant.id,
			location: restaurant.location,
		});
	}

	/** The restaurant's items for its owner; 404 if the restaurant is not theirs. */
	public async listMenuItems(
		ownerId: string,
		restaurantId: string,
		query: TListMenuItemsInput,
	): Promise<TPage<TMenuItem>> {
		await this.get(ownerId, restaurantId);
		return this._menuItemRepository.list(ownerId, restaurantId, query);
	}

	/** One item of the caller's restaurant, or 404. */
	public async getMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
	): Promise<TMenuItem> {
		const item = await this._menuItemRepository.findInRestaurant(
			ownerId,
			restaurantId,
			itemId,
		);
		if (!item) {
			throw new NotFoundException();
		}
		return item;
	}

	/** Updates one item of the caller's restaurant, or 404. */
	public async updateMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		input: TUpdateMenuItemInput,
	): Promise<TMenuItem> {
		const current = await this.getMenuItem(ownerId, restaurantId, itemId);
		const item = await this._menuItemRepository.updateInRestaurant(
			ownerId,
			restaurantId,
			itemId,
			input,
		);
		if (!item) {
			throw new NotFoundException();
		}
		this._deleteReplacedImage(current.imageUrl, item.imageUrl);
		return item;
	}

	/** Marks an item available or sold out. */
	public setMenuItemAvailability(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		isAvailable: boolean,
	): Promise<TMenuItem> {
		return this.updateMenuItem(ownerId, restaurantId, itemId, { isAvailable });
	}

	/** Deletes one item of the caller's restaurant, or 404. */
	public async removeMenuItem(
		ownerId: string,
		restaurantId: string,
		itemId: string,
	): Promise<void> {
		const item = await this.getMenuItem(ownerId, restaurantId, itemId);
		const deleted = await this._menuItemRepository.deleteInRestaurant(
			ownerId,
			restaurantId,
			itemId,
		);
		if (!deleted) {
			throw new NotFoundException();
		}
		this._deleteReplacedImage(item.imageUrl, null);
	}

	/** Public menu of a restaurant by slug, sorted by category then name. */
	public async getMenuBySlug(slug: string): Promise<TMenuItem[]> {
		const restaurant = await this.getBySlug(slug);
		return this._menuItemRepository.listByRestaurant(restaurant.id);
	}

	/**
	 * A QR code pointing at the caller's public menu page. 404 if the
	 * restaurant is missing or not theirs.
	 */
	public async getQrCode(
		ownerId: string,
		id: string,
	): Promise<TQrCodeResponse> {
		const restaurant = await this.get(ownerId, id);
		const webAppBaseUrl =
			this._configService.getOrThrow<string>("WEB_APP_BASE_URL");
		const url = `${webAppBaseUrl}/r/${restaurant.slug}`;
		const [pngDataUrl, svgDataUrl] = await Promise.all([
			this._qrCodeHelper.toPngDataUrl(url),
			this._qrCodeHelper.toSvgDataUrl(url),
		]);
		return { url, pngDataUrl, svgDataUrl };
	}

	/** The restaurant's orders for its owner; 404 if the restaurant is not theirs. */
	public async listOrders(
		ownerId: string,
		restaurantId: string,
		query: TListOrdersInput,
	): Promise<TPage<TOrder>> {
		await this.get(ownerId, restaurantId);
		return this._orderService.listForOwner(ownerId, restaurantId, query);
	}

	/** Advances one of the caller's orders to a new status; 404/409 as documented on `OrderService.updateStatus`. */
	public async updateOrderStatus(
		ownerId: string,
		restaurantId: string,
		orderId: string,
		status: OrderStatus,
	): Promise<TOrder> {
		await this.get(ownerId, restaurantId);
		return this._orderService.updateStatus(
			ownerId,
			restaurantId,
			orderId,
			status,
		);
	}

	/**
	 * Issues a presigned POST for a new logo/banner and records it as pending.
	 * 404 if the restaurant is missing or not the caller's; 400 for a
	 * disallowed content type or an oversize request.
	 */
	public async createImageUpload(
		ownerId: string,
		id: string,
		input: TCreateImageUploadInput,
	): Promise<TImageUploadResponse> {
		const restaurant = await this.get(ownerId, id);
		if (
			!ALLOWED_IMAGE_CONTENT_TYPES.includes(
				input.contentType as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
			)
		) {
			throw new BadRequestException();
		}
		const maxBytes = MAX_UPLOAD_BYTES[input.kind];
		if (input.size <= 0 || input.size > maxBytes) {
			throw new BadRequestException();
		}

		const ttlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_URL_TTL_SECONDS",
		);
		const pendingTtlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_PENDING_TTL_SECONDS",
		);
		const extension = extensionForContentType(input.contentType);
		const objectKey = `restaurants/${restaurant.id}/${input.kind}/${randomUUID()}.${extension}`;
		const expiresAt = new Date(Date.now() + pendingTtlSeconds * 1000);

		const [upload, presignedPost] = await Promise.all([
			this._uploadRepository.create({
				ownerId,
				restaurantId: restaurant.id,
				kind: input.kind,
				objectKey,
				contentType: input.contentType,
				expiresAt,
			}),
			this._s3StorageAdapter.createPresignedPost(
				objectKey,
				input.contentType,
				maxBytes,
				ttlSeconds,
			),
		]);

		return {
			uploadId: upload.id,
			url: presignedPost.url,
			fields: presignedPost.fields,
			publicUrl: this._s3StorageAdapter.publicUrl(objectKey),
			expiresAt: upload.expiresAt,
		};
	}

	/**
	 * Confirms a pending upload actually landed in S3, then atomically swaps
	 * it onto the restaurant's `logoUrl`/`bannerUrl` in place of the previous
	 * image, which is deleted in the background after commit.
	 */
	public async confirmImageUpload(
		ownerId: string,
		id: string,
		uploadId: string,
	): Promise<TRestaurant> {
		const restaurant = await this.get(ownerId, id);
		const pending = await this._uploadRepository.findPending(
			ownerId,
			restaurant.id,
			uploadId,
		);
		if (!pending) {
			throw new NotFoundException();
		}
		const head = await this._s3StorageAdapter.headObject(pending.objectKey);
		if (!head || head.contentType !== pending.contentType) {
			throw new ConflictException();
		}
		const publicUrl = this._s3StorageAdapter.publicUrl(pending.objectKey);
		const field = pending.kind === UploadKind.Logo ? "logoUrl" : "bannerUrl";
		const previousUrl =
			pending.kind === UploadKind.Logo
				? restaurant.logoUrl
				: restaurant.bannerUrl;

		const updated = await this._databaseService.transaction(async () => {
			const consumed = await this._uploadRepository.consume(
				ownerId,
				restaurant.id,
				uploadId,
			);
			if (!consumed) {
				throw new NotFoundException();
			}
			const result = await this._restaurantRepository.update(
				ownerId,
				restaurant.id,
				{ [field]: publicUrl },
			);
			if (!result) {
				throw new NotFoundException();
			}
			return result;
		});
		this._deleteReplacedImage(previousUrl, publicUrl);
		return updated;
	}

	/** Deletes a pending upload's S3 object and row; 404 if already gone. */
	public async cancelImageUpload(
		ownerId: string,
		id: string,
		uploadId: string,
	): Promise<void> {
		const restaurant = await this.get(ownerId, id);
		const consumed = await this._uploadRepository.consume(
			ownerId,
			restaurant.id,
			uploadId,
		);
		if (!consumed) {
			throw new NotFoundException();
		}
		await this._s3StorageAdapter.deleteObjects([consumed.objectKey]);
	}

	/**
	 * Issues a presigned POST for a menu item's photo and records it as
	 * pending. 404 if the item is missing or not the caller's; 400 for a
	 * disallowed content type or an oversize request.
	 */
	public async createMenuItemImageUpload(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		input: TCreateMenuItemImageUploadInput,
	): Promise<TImageUploadResponse> {
		const item = await this.getMenuItem(ownerId, restaurantId, itemId);
		if (
			!ALLOWED_IMAGE_CONTENT_TYPES.includes(
				input.contentType as (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number],
			)
		) {
			throw new BadRequestException();
		}
		const maxBytes = MAX_UPLOAD_BYTES[UploadKind.MenuItem];
		if (input.size <= 0 || input.size > maxBytes) {
			throw new BadRequestException();
		}

		const ttlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_URL_TTL_SECONDS",
		);
		const pendingTtlSeconds = this._configService.getOrThrow<number>(
			"UPLOAD_PENDING_TTL_SECONDS",
		);
		const extension = extensionForContentType(input.contentType);
		const objectKey = `restaurants/${restaurantId}/menu-items/${item.id}/${randomUUID()}.${extension}`;
		const expiresAt = new Date(Date.now() + pendingTtlSeconds * 1000);

		const [upload, presignedPost] = await Promise.all([
			this._uploadRepository.create({
				ownerId,
				restaurantId,
				menuItemId: item.id,
				kind: UploadKind.MenuItem,
				objectKey,
				contentType: input.contentType,
				expiresAt,
			}),
			this._s3StorageAdapter.createPresignedPost(
				objectKey,
				input.contentType,
				maxBytes,
				ttlSeconds,
			),
		]);

		return {
			uploadId: upload.id,
			url: presignedPost.url,
			fields: presignedPost.fields,
			publicUrl: this._s3StorageAdapter.publicUrl(objectKey),
			expiresAt: upload.expiresAt,
		};
	}

	/**
	 * Confirms a pending upload actually landed in S3, then atomically swaps
	 * it onto the item's `imageUrl` in place of the previous photo, which is
	 * deleted in the background after commit.
	 */
	public async confirmMenuItemImageUpload(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		uploadId: string,
	): Promise<TMenuItem> {
		const item = await this.getMenuItem(ownerId, restaurantId, itemId);
		const pending = await this._uploadRepository.findPending(
			ownerId,
			restaurantId,
			uploadId,
			item.id,
		);
		if (!pending) {
			throw new NotFoundException();
		}
		const head = await this._s3StorageAdapter.headObject(pending.objectKey);
		if (!head || head.contentType !== pending.contentType) {
			throw new ConflictException();
		}
		const publicUrl = this._s3StorageAdapter.publicUrl(pending.objectKey);

		const updated = await this._databaseService.transaction(async () => {
			const consumed = await this._uploadRepository.consume(
				ownerId,
				restaurantId,
				uploadId,
				item.id,
			);
			if (!consumed) {
				throw new NotFoundException();
			}
			const result = await this._menuItemRepository.updateInRestaurant(
				ownerId,
				restaurantId,
				itemId,
				{ imageUrl: publicUrl },
			);
			if (!result) {
				throw new NotFoundException();
			}
			return result;
		});
		this._deleteReplacedImage(item.imageUrl, publicUrl);
		return updated;
	}

	/** Deletes a menu item's pending upload's S3 object and row; 404 if already gone. */
	public async cancelMenuItemImageUpload(
		ownerId: string,
		restaurantId: string,
		itemId: string,
		uploadId: string,
	): Promise<void> {
		await this.getMenuItem(ownerId, restaurantId, itemId);
		const consumed = await this._uploadRepository.consume(
			ownerId,
			restaurantId,
			uploadId,
			itemId,
		);
		if (!consumed) {
			throw new NotFoundException();
		}
		await this._s3StorageAdapter.deleteObjects([consumed.objectKey]);
	}

	/**
	 * Deletes every pending upload past its `expiresAt`, oldest first. Objects
	 * are deleted before rows, so a mid-sweep failure leaves the row behind
	 * for the next run rather than losing track of an orphaned object.
	 */
	public async sweepExpiredUploads(): Promise<void> {
		const expired = await this._uploadRepository.listExpired(_SWEEP_BATCH_SIZE);
		if (expired.length === 0) {
			return;
		}
		await this._s3StorageAdapter.deleteObjects(
			expired.map((upload) => upload.objectKey),
		);
		await this._uploadRepository.deleteByIds(
			expired.map((upload) => upload.id),
		);
	}

	/**
	 * Deletes `previousUrl`'s object in the background when it differs from
	 * `nextUrl` and is one of our own objects (never an externally-pasted URL).
	 */
	private _deleteReplacedImage(
		previousUrl: string | null,
		nextUrl: string | null,
	): void {
		if (!previousUrl || previousUrl === nextUrl) {
			return;
		}
		const key = this._s3StorageAdapter.keyFromPublicUrl(previousUrl);
		if (!key) {
			return;
		}
		this._backgroundJobHelper.run(
			() => this._s3StorageAdapter.deleteObjects([key]),
			{ name: `delete-image:${key}` },
		);
	}

	/** `[lng, lat]` → GeoJSON Point. */
	private _toPoint(coordinates: TCoordinates): TGeoPoint {
		return { type: "Point", coordinates };
	}

	/**
	 * 409 `restaurantIncomplete` listing every confirmed document and KYC
	 * field the restaurant still lacks; resolves when it is ready for review.
	 */
	private async _assertReadyForReview(
		ownerId: string,
		restaurant: TRestaurant,
	): Promise<void> {
		const missing =
			await this._restaurantOnboardingService.listMissingForReview(
				ownerId,
				restaurant.id,
			);
		if (missing.length > 0) {
			throw new ConflictException(ErrorMessages.restaurantIncomplete(missing));
		}
	}
}
