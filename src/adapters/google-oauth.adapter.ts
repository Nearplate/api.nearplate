import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type JwtHeader, decode, verify } from "jsonwebtoken";
import { createPublicKey } from "node:crypto";
import { z } from "zod";

const _JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const _AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const _TOKEN_URL = "https://oauth2.googleapis.com/token";
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
type TTokenResponse = { id_token?: string };

/**
 * Google OAuth via the Authorization Code + PKCE flow -- no `googleapis`
 * dependency: two `fetch` calls (authorize URL is built locally, code
 * exchange is a POST) plus manual ID-token verification against Google's
 * JWKS (signature, issuer, audience, expiry).
 */
@LogClass()
@Injectable()
export class GoogleOauthAdapter {
	private readonly _clientId: string;
	private readonly _clientSecret: string;
	private readonly _redirectUri: string;
	private _keyCache = new Map<string, string>();

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._clientId = this._configService.getOrThrow("GOOGLE_CLIENT_ID");
		this._clientSecret = this._configService.getOrThrow("GOOGLE_CLIENT_SECRET");
		this._redirectUri = this._configService.getOrThrow("GOOGLE_REDIRECT_URI");
	}

	/**
	 * Builds the URL to send the browser to. `state` binds the round trip to
	 * this login attempt (CSRF); `codeChallenge` is the S256 PKCE challenge for
	 * `codeVerifier`, so only the party that started the flow can redeem the
	 * code Google hands back.
	 */
	public authorizeUrl(state: string, codeChallenge: string): string {
		const params = new URLSearchParams({
			client_id: this._clientId,
			redirect_uri: this._redirectUri,
			response_type: "code",
			scope: "openid email profile",
			state,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
			access_type: "online",
			prompt: "select_account",
		});
		return `${_AUTHORIZE_URL}?${params.toString()}`;
	}

	/** Exchanges the authorization code for an ID token and verifies it. */
	public async exchangeCode(
		code: string,
		codeVerifier: string,
	): Promise<TGoogleClaims> {
		const body = new URLSearchParams({
			code,
			client_id: this._clientId,
			client_secret: this._clientSecret,
			redirect_uri: this._redirectUri,
			grant_type: "authorization_code",
			code_verifier: codeVerifier,
		});
		let response: Response;
		try {
			response = await fetch(_TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: body.toString(),
				signal: AbortSignal.timeout(_FETCH_TIMEOUT_MS),
			});
		} catch {
			throw new UnauthorizedException();
		}
		if (!response.ok) {
			throw new UnauthorizedException();
		}
		const { id_token: idToken } = (await response.json()) as TTokenResponse;
		if (!idToken) {
			throw new UnauthorizedException();
		}
		return this._verifyIdToken(idToken);
	}

	/** Verifies signature, issuer, audience and expiry; returns the claims. */
	private async _verifyIdToken(idToken: string): Promise<TGoogleClaims> {
		const kid = this._keyId(idToken);
		const key = await this._publicKey(kid);
		let payload: unknown;
		try {
			payload = verify(idToken, key, {
				algorithms: ["RS256"],
				audience: this._clientId,
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
