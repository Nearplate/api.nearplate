import type { TConfig } from "@/app/modules/config";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const _ALGORITHM = "aes-256-gcm";
/** 96-bit IV, the size GCM is designed for. */
const _IV_BYTES = 12;
const _TAG_BYTES = 16;
/** Bumped if the algorithm or key ever changes, so old values stay readable. */
const _VERSION = "v1";

/**
 * AES-256-GCM encryption for sensitive values at rest (KYC bank account and
 * PAN numbers). Each call uses a fresh random IV, and the GCM auth tag makes
 * any tampering with the stored value fail loudly on decrypt. The key is
 * `KYC_ENCRYPTION_KEY` (32 bytes, base64), validated at boot.
 */
@Injectable()
export class EncryptionHelper {
	private readonly _key: Buffer;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._key = Buffer.from(
			this._configService.getOrThrow<string>("KYC_ENCRYPTION_KEY"),
			"base64",
		);
	}

	/** Plaintext → `v1:<iv>:<tag>:<ciphertext>` (each part base64). */
	public encrypt(plaintext: string): string {
		const iv = randomBytes(_IV_BYTES);
		const cipher = createCipheriv(_ALGORITHM, this._key, iv, {
			authTagLength: _TAG_BYTES,
		});
		const ciphertext = Buffer.concat([
			cipher.update(plaintext, "utf8"),
			cipher.final(),
		]);
		return [
			_VERSION,
			iv.toString("base64"),
			cipher.getAuthTag().toString("base64"),
			ciphertext.toString("base64"),
		].join(":");
	}

	/** Inverse of `encrypt`; throws on a malformed, tampered or foreign-key value. */
	public decrypt(token: string): string {
		const [version, iv, tag, ciphertext] = token.split(":");
		if (version !== _VERSION || !iv || !tag || ciphertext === undefined) {
			throw new Error("Unsupported encrypted value");
		}
		const decipher = createDecipheriv(
			_ALGORITHM,
			this._key,
			Buffer.from(iv, "base64"),
			{ authTagLength: _TAG_BYTES },
		);
		decipher.setAuthTag(Buffer.from(tag, "base64"));
		return Buffer.concat([
			decipher.update(Buffer.from(ciphertext, "base64")),
			decipher.final(),
		]).toString("utf8");
	}
}
