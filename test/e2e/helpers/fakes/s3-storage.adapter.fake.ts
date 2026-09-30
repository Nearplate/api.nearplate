export type TFakeObject = {
	sizeBytes: number;
	contentType: string;
};

const _PUBLIC_BASE_URL = "https://fake-bucket.test";

/**
 * In-memory stand-in for `S3StorageAdapter`. Specs call `simulateUpload` to
 * mimic the browser's direct-to-S3 POST completing, then exercise
 * confirm/cancel/sweep against `headObject`/`deleteObjects` as the real
 * adapter would see them.
 */
export class FakeS3StorageAdapter {
	public deletedKeys: string[] = [];
	private _objects = new Map<string, TFakeObject>();

	public async createPresignedPost(
		key: string,
		contentType: string,
	): Promise<{ url: string; fields: Record<string, string> }> {
		return {
			url: `${_PUBLIC_BASE_URL}/upload`,
			fields: { key, "Content-Type": contentType },
		};
	}

	public async ping(): Promise<void> {}

	public async headObject(key: string): Promise<TFakeObject | null> {
		return this._objects.get(key) ?? null;
	}

	public async deleteObjects(keys: string[]): Promise<void> {
		for (const key of keys) {
			this._objects.delete(key);
			this.deletedKeys.push(key);
		}
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
	): void {
		this._objects.set(key, { sizeBytes, contentType });
	}

	public reset(): void {
		this._objects.clear();
		this.deletedKeys = [];
	}

	/**
	 * Polls for `key` to appear in `deletedKeys`, since replaced/removed
	 * images are deleted by `BackgroundJobHelper` after the HTTP response.
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
