import type { TFakeObject } from "./s3-storage.adapter.fake";

const _BASE_URL = "https://fake-documents.test";

/**
 * In-memory stand-in for `S3DocumentStorageAdapter` (the private KYC bucket).
 * Specs call `simulateUpload` to mimic the browser's direct-to-S3 POST, then
 * exercise confirm/delete/sweep. `presignedGetUrl` returns a recognisable
 * signed-looking URL so specs can assert documents are never public.
 */
export class FakeS3DocumentStorageAdapter {
	public deletedKeys: string[] = [];
	private _objects = new Map<string, TFakeObject>();

	public async createPresignedPost(
		key: string,
		contentType: string,
	): Promise<{ url: string; fields: Record<string, string> }> {
		return {
			url: `${_BASE_URL}/upload`,
			fields: { key, "Content-Type": contentType },
		};
	}

	public async headObject(key: string): Promise<TFakeObject | null> {
		return this._objects.get(key) ?? null;
	}

	public async deleteObjects(keys: string[]): Promise<void> {
		for (const key of keys) {
			this._objects.delete(key);
			this.deletedKeys.push(key);
		}
	}

	public async presignedGetUrl(
		key: string,
		ttlSeconds: number,
	): Promise<string> {
		return `${_BASE_URL}/${encodeURIComponent(key)}?X-Amz-Expires=${ttlSeconds}&X-Amz-Signature=fake`;
	}

	/** Test-only: makes `headObject` see the object as if S3 received it. */
	public simulateUpload(
		key: string,
		sizeBytes: number,
		contentType: string,
	): void {
		this._objects.set(key, { sizeBytes, contentType });
	}

	public reset(): void {
		this._objects.clear();
		this.deletedKeys = [];
	}

	/** Polls for `key` to appear in `deletedKeys` (background deletes). */
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
