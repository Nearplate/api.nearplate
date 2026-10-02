import { createS3Client } from "@/adapters/s3-client";
import type {
	THeadObjectResult,
	TPresignedPost,
} from "@/adapters/s3-storage.adapter";
import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import {
	DeleteObjectsCommand,
	GetObjectCommand,
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
 * Thin wrapper over the S3 SDK for the private KYC documents bucket
 * (`S3_DOCUMENTS_BUCKET`). Unlike `S3StorageAdapter` there is deliberately no
 * public URL: objects are only readable through short-lived presigned GETs.
 */
@LogClass()
@Injectable()
export class S3DocumentStorageAdapter {
	private readonly _client: S3Client;
	private readonly _bucket: string;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._bucket = this._configService.getOrThrow("S3_DOCUMENTS_BUCKET");
		this._client = createS3Client(this._configService);
	}

	/**
	 * A presigned POST scoped to exactly `key`, `contentType` and a byte-size
	 * range, so S3 rejects any upload that does not match.
	 */
	public async createPresignedPost(
		key: string,
		contentType: string,
		maxBytes: number,
		ttlSeconds: number,
	): Promise<TPresignedPost> {
		return createPresignedPost(this._client, {
			Bucket: this._bucket,
			Key: key,
			Conditions: [
				["content-length-range", 1, maxBytes],
				["eq", "$Content-Type", contentType],
			],
			Fields: { "Content-Type": contentType },
			Expires: ttlSeconds,
		});
	}

	/** `null` when the object does not exist. */
	public async headObject(key: string): Promise<THeadObjectResult | null> {
		try {
			const result = await this._client.send(
				new HeadObjectCommand({ Bucket: this._bucket, Key: key }),
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

	/** Deletes every key, batched to S3's 1000-key limit per call. */
	public async deleteObjects(keys: string[]): Promise<void> {
		for (let i = 0; i < keys.length; i += _DELETE_BATCH_SIZE) {
			const batch = keys.slice(i, i + _DELETE_BATCH_SIZE);
			if (batch.length === 0) {
				continue;
			}
			await this._client.send(
				new DeleteObjectsCommand({
					Bucket: this._bucket,
					Delete: { Objects: batch.map((Key) => ({ Key })) },
				}),
			);
		}
	}

	/**
	 * A presigned GET for one object, valid for `ttlSeconds`. Signing is local
	 * (no S3 round trip), so listing documents stays cheap.
	 */
	public async presignedGetUrl(
		key: string,
		ttlSeconds: number,
	): Promise<string> {
		return getSignedUrl(
			this._client,
			new GetObjectCommand({ Bucket: this._bucket, Key: key }),
			{ expiresIn: ttlSeconds },
		);
	}
}
