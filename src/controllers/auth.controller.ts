import { LogClass } from "@/app/modules/logger";
import { ClientContext } from "@/decorators/client-context.decorator";
import { AuthService } from "@/services/auth.service";
import { SessionService } from "@/services/session.service";
import {
	AuthTransformer,
	type TAuthResultResponse,
	type TMagicLinkResponse,
	type TTokensResponse,
} from "@/transformers/auth.transformer";
import type { TClientContext } from "@/types/client-context";
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Post,
	Query,
	Redirect,
} from "@nestjs/common";

/** Sign-in (magic link, Google), sessions, guest tokens and the caller's profile. */
@LogClass()
@Controller("auth")
export class AuthController {
	constructor(
		@Inject(AuthTransformer)
		private readonly _authTransformer: AuthTransformer,
		@Inject(AuthService)
		private readonly _authService: AuthService,
		@Inject(SessionService)
		private readonly _sessionService: SessionService,
	) {}

	/** Emails a sign-in link. `sent` whether or not the email is known. */
	@Post("magic-link")
	@HttpCode(HttpStatus.OK)
	public async requestMagicLink(
		@Body() body: unknown,
	): Promise<TMagicLinkResponse> {
		const input = this._authTransformer.toMagicLinkRequestDTO(body);
		const result = await this._authService.requestMagicLink(
			input.email,
			input.role,
		);
		return this._authTransformer.toMagicLinkResponseDTO(result);
	}

	/** Exchanges the emailed token (posted by the web app) for a session. */
	@Post("magic-link/verify")
	@HttpCode(HttpStatus.OK)
	public async verifyMagicLink(
		@Body() body: unknown,
		@ClientContext() context: TClientContext,
	): Promise<TAuthResultResponse> {
		const input = this._authTransformer.toVerifyRequestDTO(body);
		const result = await this._authService.verifyMagicLink(
			input.token,
			context,
		);
		return this._authTransformer.toAuthResponseDTO(result);
	}

	/** Redirects the browser to Google to start the Authorization Code + PKCE flow. */
	@Get("google")
	@Redirect()
	public async startGoogle(
		@Query() query: unknown,
	): Promise<{ url: string; statusCode: HttpStatus }> {
		const input = this._authTransformer.toStartGoogleRequestDTO(query);
		const url = await this._authService.authorizeGoogleUrl(input.role);
		return { url, statusCode: HttpStatus.FOUND };
	}

	/** Exchanges the code Google returned (posted by the web app) for a session. */
	@Post("google/verify")
	@HttpCode(HttpStatus.OK)
	public async verifyGoogle(
		@Body() body: unknown,
		@ClientContext() context: TClientContext,
	): Promise<TAuthResultResponse> {
		const input = this._authTransformer.toVerifyGoogleRequestDTO(body);
		const result = await this._authService.verifyGoogle(
			input.code,
			input.state,
			context,
		);
		return this._authTransformer.toAuthResponseDTO(result);
	}

	/** Rotates the refresh token and returns a new token pair. */
	@Post("refresh")
	@HttpCode(HttpStatus.OK)
	public async refresh(
		@Body() body: unknown,
		@ClientContext() context: TClientContext,
	): Promise<TTokensResponse> {
		const input = this._authTransformer.toRefreshRequestDTO(body);
		const tokens = await this._sessionService.refresh(
			input.refreshToken,
			context,
		);
		return this._authTransformer.toRefreshResponseDTO(tokens);
	}

	/** Revokes the refresh session. 204 even for an unknown token. */
	@Post("logout")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async logout(@Body() body: unknown): Promise<void> {
		const input = this._authTransformer.toLogoutRequestDTO(body);
		await this._sessionService.logout(input.refreshToken);
	}

	/** Anonymous guest access token. */
	@Post("guest")
	@HttpCode(HttpStatus.OK)
	public guest(): { accessToken: string; expiresIn: number } {
		return this._authTransformer.toGuestResponseDTO(this._authService.guest());
	}
}
