import { JwtAdapter } from "@/adapters/jwt.adapter";
import { LogClass } from "@/app/modules/logger";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import type { TConfig } from "@/app/modules/config";
import { UserRepository } from "@/repositories/user.repository";
import type { TClientContext } from "@/types/client-context";
import type { TUser } from "@db/schemas/user.schema";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type TAuthTokens = {
	accessToken: string;
	refreshToken: string;
	/** Access-token lifetime in seconds. */
	expiresIn: number;
};

/** Issues, rotates and revokes access/refresh token pairs. */
@LogClass()
@Injectable()
export class SessionService {
	private readonly _sessionTtlSeconds: number;

	constructor(
		@Inject(JwtAdapter)
		private readonly _jwtAdapter: JwtAdapter,
		@Inject(SessionTokenHelper)
		private readonly _sessionTokenHelper: SessionTokenHelper,
		@Inject(AuthSessionRepository)
		private readonly _authSessionRepository: AuthSessionRepository,
		@Inject(UserRepository)
		private readonly _userRepository: UserRepository,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._sessionTtlSeconds = this._configService.getOrThrow(
			"SESSION_TTL_SECONDS",
		);
	}

	/** Signs an access token for the user's role and opens a refresh session. */
	public async issue(
		user: TUser,
		context: TClientContext,
	): Promise<TAuthTokens> {
		const { token, tokenHash } = this._sessionTokenHelper.generate();
		await this._authSessionRepository.create({
			userId: user.id,
			tokenHash,
			ip: context.ip,
			userAgent: context.userAgent,
			expiresAt: this._sessionTokenHelper.expiresAt(this._sessionTtlSeconds),
		});
		return {
			accessToken: this._jwtAdapter.signAccessToken(user.id, user.role),
			refreshToken: token,
			expiresIn: this._jwtAdapter.accessTtlSeconds(user.role),
		};
	}

	/**
	 * Spends the refresh token and issues a fresh pair. The user is re-read so a
	 * deleted account or changed role takes effect here; 401 for any token that
	 * is unknown, expired, or already used.
	 */
	public async refresh(
		refreshToken: string,
		context: TClientContext,
	): Promise<TAuthTokens> {
		const session = await this._authSessionRepository.consumeByHash(
			this._sessionTokenHelper.hash(refreshToken),
		);
		if (!session) {
			throw new UnauthorizedException();
		}
		const user = await this._userRepository.findById(session.userId);
		if (!user) {
			throw new UnauthorizedException();
		}
		return this.issue(user, context);
	}

	/** Revokes the session; idempotent, so an unknown token is not an error. */
	public async logout(refreshToken: string): Promise<void> {
		await this._authSessionRepository.deleteByHash(
			this._sessionTokenHelper.hash(refreshToken),
		);
	}
}
