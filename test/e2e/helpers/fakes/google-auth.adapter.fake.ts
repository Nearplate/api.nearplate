import { UnauthorizedException } from "@nestjs/common";

export type TFakeGoogleClaims = {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
};

/** Maps opaque test strings to Google claims; anything else is a bad token. */
export class FakeGoogleAuthAdapter {
	public configured = true;
	private _tokens = new Map<string, TFakeGoogleClaims>();

	public isConfigured(): boolean {
		return this.configured;
	}

	public register(idToken: string, claims: TFakeGoogleClaims): void {
		this._tokens.set(idToken, claims);
	}

	public async verifyIdToken(idToken: string): Promise<TFakeGoogleClaims> {
		const claims = this._tokens.get(idToken);
		if (!claims) {
			throw new UnauthorizedException();
		}
		return claims;
	}

	public reset(): void {
		this.configured = true;
		this._tokens.clear();
	}
}
