import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type JwtHeader, decode, verify } from "jsonwebtoken";
import { createPublicKey } from "node:crypto";
import { z } from "zod";

const _JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const _ISSUERS: [string, string] = [
	"https://accounts.google.com",
	"accounts.google.com",
];
const _FETCH_TIMEOUT_MS = 10_000;

const _claimsSchema = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
	email_verified: z.boolean(),
	name: z.string().optional(),
	given_name: z.string().optional(),
	family_name: z.string().optional(),
	picture: z.string().optional(),
});
export type TGoogleClaims = z.infer<typeof _claimsSchema>;

type TJwk = { kid: string; n: string; e: string; kty: string };

/**
 * Verifies Google ID tokens sent by the client (Google Identity Services or
 * native sign-in). No code exchange, client secret or `googleapis` dependency:
 * an ID token is a signed JWT, so this fetches Google's public keys and checks
 * signature, issuer, audience and expiry.
 */
@LogClass()
@Injectable()
export class GoogleAuthAdapter {
	private readonly _clientIds: string[];
	private _keyCache = new Map<string, string>();

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._clientIds = this._configService.getOrThrow("GOOGLE_CLIENT_IDS");
	}

	/** False when no `GOOGLE_CLIENT_IDS` are configured. */
	public isConfigured(): boolean {
		return this._clientIds.length > 0;
	}

	/** Returns the verified claims, or throws 401. */
	public async verifyIdToken(idToken: string): Promise<TGoogleClaims> {
		const kid = this._keyId(idToken);
		const key = await this._publicKey(kid);
		let payload: unknown;
		try {
			payload = verify(idToken, key, {
				algorithms: ["RS256"],
				audience: this._clientIds as [string, ...string[]],
				issuer: _ISSUERS,
			});
		} catch {
			throw new UnauthorizedException();
		}
		const parsed = _claimsSchema.safeParse(payload);
		if (!parsed.success) {
			throw new UnauthorizedException();
		}
		return parsed.data;
	}

	/** Key id from the token header; 401 if absent. */
	private _keyId(idToken: string): string {
		const header: JwtHeader | undefined = decode(idToken, {
			complete: true,
		})?.header;
		if (!header?.kid) {
			throw new UnauthorizedException();
		}
		return header.kid;
	}

	/** Cached, with one refresh on a miss to cover Google's key rotation. */
	private async _publicKey(kid: string): Promise<string> {
		const cached = this._keyCache.get(kid);
		if (cached) {
			return cached;
		}
		this._keyCache = await this._fetchKeys();
		const refreshed = this._keyCache.get(kid);
		if (!refreshed) {
			throw new UnauthorizedException();
		}
		return refreshed;
	}

	/** Downloads Google's JWKS and converts each key to PEM. */
	private async _fetchKeys(): Promise<Map<string, string>> {
		const response = await fetch(_JWKS_URL, {
			signal: AbortSignal.timeout(_FETCH_TIMEOUT_MS),
		});
		if (!response.ok) {
			throw new UnauthorizedException();
		}
		const body = (await response.json()) as { keys?: TJwk[] };
		const keys = new Map<string, string>();
		for (const jwk of body.keys ?? []) {
			keys.set(
				jwk.kid,
				createPublicKey({ key: jwk, format: "jwk" }).export({
					type: "spki",
					format: "pem",
				}) as string,
			);
		}
		return keys;
	}
}
