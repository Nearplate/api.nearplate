import { UnauthorizedException } from "@nestjs/common";

export type TFakeGoogleClaims = {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	given_name?: string;
	family_name?: string;
	picture?: string;
};

/**
 * Maps opaque test `code` strings to Google claims; anything else is a bad
 * code. `authorizeUrl` embeds `state` as a query param so specs can read it
 * back without following a real redirect.
 */
export class FakeGoogleOauthAdapter {
	public lastCodeVerifier: string | null = null;
	private _codes = new Map<string, TFakeGoogleClaims>();

	public authorizeUrl(state: string, codeChallenge: string): string {
		const params = new URLSearchParams({
			state,
			code_challenge: codeChallenge,
		});
		return `https://accounts.google.com/fake-authorize?${params.toString()}`;
	}

	public register(code: string, claims: TFakeGoogleClaims): void {
		this._codes.set(code, claims);
	}

	public async exchangeCode(
		code: string,
		codeVerifier: string,
	): Promise<TFakeGoogleClaims> {
		this.lastCodeVerifier = codeVerifier;
		const claims = this._codes.get(code);
		if (!claims) {
			throw new UnauthorizedException();
		}
		return claims;
	}

	public reset(): void {
		this.lastCodeVerifier = null;
		this._codes.clear();
	}
}
