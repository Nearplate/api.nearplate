import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	NotFound,
	S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/** `S3.deleteObjects` accepts at most 1000 keys per call. */
const _DELETE_BATCH_SIZE = 1000;

/**
 * Which bucket an operation targets: `image` holds logos, banners and menu
 * photos (`S3_IMAGES_BUCKET`); `documents` holds private KYC documents
 * (`S3_DOCUMENTS_BUCKET`), which are only ever read via presigned GETs.
 */
export type TS3Bucket = "image" | "documents";

export type TPresignedPost = {
	url: string;
	fields: Record<string, string>;
};

export type THeadObjectResult = {
	sizeBytes: number;
	contentType: string | null;
};

/**
 * Thin wrapper over the S3 SDK for both buckets, sharing one client. Presigned
 * POSTs let the browser upload bytes straight to S3 (never through this API);
 * `headObject`/`deleteObjects` back the confirm/cancel/sweep flows. Public
 * URLs exist only for the `image` bucket; documents get short-lived
 * presigned GET URLs instead.
 */
@LogClass()
@Injectable()
export class S3StorageAdapter {
	private readonly _client: S3Client;
	private readonly _buckets: Record<TS3Bucket, string>;
	private readonly _publicBaseUrl: string;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._buckets = {
			image: this._configService.getOrThrow("S3_IMAGES_BUCKET"),
			documents: this._configService.getOrThrow("S3_DOCUMENTS_BUCKET"),
		};
		this._publicBaseUrl = this._configService
			.getOrThrow<string>("S3_PUBLIC_BASE_URL")
			.replace(/\/+$/, "");
		const accessKeyId = this._configService.get("S3_ACCESS_KEY_ID");
		const secretAccessKey = this._configService.get("S3_SECRET_ACCESS_KEY");
		this._client = new S3Client({
			region: this._configService.getOrThrow("S3_REGION"),
			endpoint: this._configService.get("S3_ENDPOINT"),
			forcePathStyle: this._configService.get("S3_FORCE_PATH_STYLE"),
			// Unset falls back to the SDK's default credential chain.
			credentials:
				accessKeyId && secretAccessKey
					? { accessKeyId, secretAccessKey }
					: undefined,
		});
	}

	/**
	 * A presigned POST scoped to exactly `key`, `contentType` and a byte-size
	 * range -- S3 itself rejects any upload that does not match, so validation
	 * does not rely on the client behaving.
	 */
	public async createPresignedPost(
		key: string,
		contentType: string,
		maxBytes: number,
		ttlSeconds: number,
		bucket: TS3Bucket = "image",
	): Promise<TPresignedPost> {
		return createPresignedPost(this._client, {
			Bucket: this._buckets[bucket],
			Key: key,
			Conditions: [
				["content-length-range", 1, maxBytes],
				["eq", "$Content-Type", contentType],
			],
			Fields: { "Content-Type": contentType },
			Expires: ttlSeconds,
		});
	}

	/** Liveness probe for `AppService`; throws if the image bucket is unreachable. */
	public async ping(): Promise<void> {
		await this._client.send(
			new HeadBucketCommand({ Bucket: this._buckets.image }),
		);
	}

	/** `null` when the object does not exist. */
	public async headObject(
		key: string,
		bucket: TS3Bucket = "image",
	): Promise<THeadObjectResult | null> {
		try {
			const result = await this._client.send(
				new HeadObjectCommand({ Bucket: this._buckets[bucket], Key: key }),
			);
			return {
				sizeBytes: result.ContentLength ?? 0,
				contentType: result.ContentType ?? null,
			};
		} catch (error) {
			if (error instanceof NotFound) {
				return null;
			}
			throw error;
		}
	}

	/** Deletes every key, batched to S3's 1000-key limit per call. Best effort per batch. */
	public async deleteObjects(
		keys: string[],
		bucket: TS3Bucket = "image",
	): Promise<void> {
		for (let i = 0; i < keys.length; i += _DELETE_BATCH_SIZE) {
			const batch = keys.slice(i, i + _DELETE_BATCH_SIZE);
			if (batch.length === 0) {
				continue;
			}
			await this._client.send(
				new DeleteObjectsCommand({
					Bucket: this._buckets[bucket],
					Delete: { Objects: batch.map((Key) => ({ Key })) },
				}),
			);
		}
	}

	/**
	 * A presigned GET for a private document, valid for `ttlSeconds`. Signing
	 * is local (no S3 round trip), so listing documents stays cheap. Always
	 * the `documents` bucket: image objects use `publicUrl`.
	 */
	public async presignedGetUrl(
		key: string,
		ttlSeconds: number,
	): Promise<string> {
		return getSignedUrl(
			this._client,
			new GetObjectCommand({ Bucket: this._buckets.documents, Key: key }),
			{ expiresIn: ttlSeconds },
		);
	}

	/** The public URL an object key in the `image` bucket resolves to. */
	public publicUrl(key: string): string {
		return `${this._publicBaseUrl}/${key}`;
	}

	/**
	 * The object key backing a public URL, or `null` if `url` is not one of
	 * ours (an owner-pasted external URL must never be deleted).
	 */
	public keyFromPublicUrl(url: string): string | null {
		const prefix = `${this._publicBaseUrl}/`;
		if (!url.startsWith(prefix)) {
			return null;
		}
		const key = url.slice(prefix.length);
		return key.length > 0 ? key : null;
	}
}
