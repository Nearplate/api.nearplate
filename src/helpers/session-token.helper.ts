import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

const _TOKEN_BYTES = 32;
const _MS_PER_SECOND = 1000;

export type TGeneratedToken = {
	/** Handed to the client exactly once. Never stored. */
	token: string;
	/** What goes in the database. */
	tokenHash: string;
};

/**
 * Generate, hash and expire opaque auth tokens (magic links, refresh tokens).
 *
 * Hashing is sha256, not bcrypt: these tokens are 32 bytes of CSPRNG output, so
 * there is no dictionary to attack and no low-entropy input to slow down -- a
 * salt and a work factor would buy nothing an attacker cares about.
 */
@Injectable()
export class SessionTokenHelper {
	/** New random token plus the hash to persist. */
	public generate(): TGeneratedToken {
		const token = randomBytes(_TOKEN_BYTES).toString("hex");
		return { token, tokenHash: this.hash(token) };
	}

	/** sha256 hex of a token, as stored in the database. */
	public hash(token: string): string {
		return createHash("sha256").update(token).digest("hex");
	}

	/** Date `ttlSeconds` from now. */
	public expiresAt(ttlSeconds: number): Date {
		return new Date(Date.now() + ttlSeconds * _MS_PER_SECOND);
	}
}
