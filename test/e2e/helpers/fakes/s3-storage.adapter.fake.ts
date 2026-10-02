import type { TS3Bucket } from "@/adapters/s3-storage.adapter";

export type TFakeObject = {
	sizeBytes: number;
	contentType: string;
};

const _PUBLIC_BASE_URL = "https://fake-bucket.test";
const _DOCUMENTS_BASE_URL = "https://fake-documents.test";

/**
 * In-memory stand-in for `S3StorageAdapter`. Specs call `simulateUpload` to
 * mimic the browser's direct-to-S3 POST completing, then exercise
 * confirm/cancel/sweep against `headObject`/`deleteObjects` as the real
 * adapter would see them. Objects are stored per bucket, so a document
 * looked up in the `public` bucket (or vice versa) is not found.
 */
export class FakeS3StorageAdapter {
	/** Deleted keys from either bucket, in deletion order. */
	public deletedKeys: string[] = [];
	private _objects: Record<TS3Bucket, Map<string, TFakeObject>> = {
		public: new Map(),
		documents: new Map(),
	};

	public async createPresignedPost(
		key: string,
		contentType: string,
		_maxBytes?: number,
		_ttlSeconds?: number,
		bucket: TS3Bucket = "public",
	): Promise<{ url: string; fields: Record<string, string> }> {
		const base =
			bucket === "documents" ? _DOCUMENTS_BASE_URL : _PUBLIC_BASE_URL;
		return {
			url: `${base}/upload`,
			fields: { key, "Content-Type": contentType },
		};
	}

	public async ping(): Promise<void> {}

	public async headObject(
		key: string,
		bucket: TS3Bucket = "public",
	): Promise<TFakeObject | null> {
		return this._objects[bucket].get(key) ?? null;
	}

	public async deleteObjects(
		keys: string[],
		bucket: TS3Bucket = "public",
	): Promise<void> {
		for (const key of keys) {
			this._objects[bucket].delete(key);
			this.deletedKeys.push(key);
		}
	}

	public async presignedGetUrl(
		key: string,
		ttlSeconds: number,
	): Promise<string> {
		return `${_DOCUMENTS_BASE_URL}/${encodeURIComponent(key)}?X-Amz-Expires=${ttlSeconds}&X-Amz-Signature=fake`;
	}

	public publicUrl(key: string): string {
		return `${_PUBLIC_BASE_URL}/${key}`;
	}

	public keyFromPublicUrl(url: string): string | null {
		const prefix = `${_PUBLIC_BASE_URL}/`;
		if (!url.startsWith(prefix)) {
			return null;
		}
		const key = url.slice(prefix.length);
		return key.length > 0 ? key : null;
	}

	/** Test-only: makes `headObject` see the object as if S3 received it. */
	public simulateUpload(
		key: string,
		sizeBytes: number,
		contentType: string,
		bucket: TS3Bucket = "public",
	): void {
		this._objects[bucket].set(key, { sizeBytes, contentType });
	}

	public reset(): void {
		this._objects.public.clear();
		this._objects.documents.clear();
		this.deletedKeys = [];
	}

	/**
	 * Polls for `key` to appear in `deletedKeys`, since replaced/removed
	 * objects are deleted by `BackgroundJobHelper` after the HTTP response.
	 */
	public async waitForDelete(key: string): Promise<void> {
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			if (this.deletedKeys.includes(key)) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(`${key} was not deleted`);
	}
}
