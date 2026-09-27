import { GoogleOauthAdapter } from "@/adapters/google-oauth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import type { TConfig } from "@/app/modules/config";
import { LogClass, maskEmail } from "@/app/modules/logger";
import { AuthRole } from "@/domain/enums/auth-role";
import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { AuthTokenRepository } from "@/repositories/auth-token.repository";
import { UserRepository } from "@/repositories/user.repository";
import { SessionService, type TAuthTokens } from "@/services/session.service";
import type { TClientContext } from "@/types/client-context";
import { AUTH_TOKEN_PURPOSES } from "@db/schemas/auth-token.schema";
import type { TUser, TUserRole } from "@db/schemas/user.schema";
import {
	HttpException,
	HttpStatus,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const _SECONDS_PER_MINUTE = 60;
const _RATE_LIMIT_WINDOW_SECONDS = 3600;
const _RATE_LIMIT_KEY_PREFIX = "ratelimit:magic:";

/** Roles a person may pick at sign-up. `admin` is only ever set in the DB. */
export type TSignupRole = AuthRole.User | AuthRole.Restaurant;

/**
 * Same discriminator convention throughout: the global exception filter strips
 * error messages, so a `status` in the 200 body is the only way to tell the
 * client *why* a login did not complete.
 */
export type TRoleMismatch = { status: "role_mismatch"; role: TUserRole };
export type TMagicLinkResult = { status: "sent" } | TRoleMismatch;
export type TAuthResult =
	({ status: "authenticated"; user: TUser } & TAuthTokens) | TRoleMismatch;

/**
 * Magic link and Google are two ways to prove the same fact -- that someone
 * controls an email address. Everything after the proof (find or create the
 * user, enforce the role, open a session) lives here, once.
 */
@LogClass()
@Injectable()
export class AuthService {
	private readonly _magicLinkTtlSeconds: number;
	private readonly _magicLinkMaxPerHour: number;
	private readonly _webAppBaseUrl: string;
	private readonly _webAppMagicPath: string;
	private readonly _oauthStateTtlSeconds: number;

	constructor(
		@Inject(UserRepository)
		private readonly _userRepository: UserRepository,
		@Inject(AuthTokenRepository)
		private readonly _authTokenRepository: AuthTokenRepository,
		@Inject(SessionService)
		private readonly _sessionService: SessionService,
		@Inject(SessionTokenHelper)
		private readonly _sessionTokenHelper: SessionTokenHelper,
		@Inject(BackgroundJobHelper)
		private readonly _backgroundJobHelper: BackgroundJobHelper,
		@Inject(ResendAdapter)
		private readonly _resendAdapter: ResendAdapter,
		@Inject(GoogleOauthAdapter)
		private readonly _googleOauthAdapter: GoogleOauthAdapter,
		@Inject(JwtAdapter)
		private readonly _jwtAdapter: JwtAdapter,
		@Inject(RedisCacheAdapter)
		private readonly _redisCacheAdapter: RedisCacheAdapter,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._magicLinkTtlSeconds = this._configService.getOrThrow(
			"MAGIC_LINK_TTL_SECONDS",
		);
		this._magicLinkMaxPerHour = this._configService.getOrThrow(
			"MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR",
		);
		this._webAppBaseUrl = this._configService.getOrThrow("WEB_APP_BASE_URL");
		this._webAppMagicPath =
			this._configService.getOrThrow("WEB_APP_MAGIC_PATH");
		this._oauthStateTtlSeconds = this._configService.getOrThrow(
			"OAUTH_STATE_TTL_SECONDS",
		);
	}

	/**
	 * Unknown and known emails both answer `sent`, and the email goes out in a
	 * background job so response timing does not reveal which. The one thing
	 * surfaced is a role mismatch: an email that already owns an account under a
	 * different role than the one picked gets told so instead of a link that
	 * would sign it into the wrong workspace. Rate-limited per email, and the
	 * limit is checked first so mismatch probing counts against it too.
	 */
	public async requestMagicLink(
		email: string,
		role?: TSignupRole,
	): Promise<TMagicLinkResult> {
		await this._assertUnderRateLimit(email);
		const existing = await this._userRepository.findByEmail(email);
		if (existing && role && existing.role !== role) {
			return { status: "role_mismatch", role: existing.role };
		}
		await this._authTokenRepository.deleteByEmail(
			email,
			AUTH_TOKEN_PURPOSES.MagicLink,
		);
		const { token, tokenHash } = this._sessionTokenHelper.generate();
		await this._authTokenRepository.create({
			tokenHash,
			email,
			purpose: AUTH_TOKEN_PURPOSES.MagicLink,
			intendedRole: role ?? null,
			codeVerifier: null,
			expiresAt: this._sessionTokenHelper.expiresAt(this._magicLinkTtlSeconds),
		});
		const url = this._magicLinkUrl(token);
		const minutes = Math.round(this._magicLinkTtlSeconds / _SECONDS_PER_MINUTE);
		this._backgroundJobHelper.run(
			() => this._resendAdapter.sendMagicLink(email, url, minutes),
			{ name: `magic-link:${maskEmail(email)}` },
		);
		return { status: "sent" };
	}

	/** Spends the emailed token (401 if unknown, expired or reused) and signs in. */
	public async verifyMagicLink(
		token: string,
		context: TClientContext,
	): Promise<TAuthResult> {
		const burned = await this._authTokenRepository.consumeByHash(
			this._sessionTokenHelper.hash(token),
			AUTH_TOKEN_PURPOSES.MagicLink,
		);
		if (!burned?.email) {
			throw new UnauthorizedException();
		}
		return this._signIn(
			{ email: burned.email },
			this._toSignupRole(burned.intendedRole),
			context,
		);
	}

	/**
	 * Starts the redirect flow: stores a PKCE verifier under a one-time `state`
	 * (the same `auth_tokens` collection as magic-link, distinguished by
	 * `purpose`) and returns the Google URL to send the browser to.
	 */
	public async authorizeGoogleUrl(role?: TSignupRole): Promise<string> {
		const { token: state, tokenHash } = this._sessionTokenHelper.generate();
		const codeVerifier = randomBytes(32).toString("base64url");
		const codeChallenge = createHash("sha256")
			.update(codeVerifier)
			.digest("base64url");
		await this._authTokenRepository.create({
			tokenHash,
			email: null,
			purpose: AUTH_TOKEN_PURPOSES.OauthState,
			intendedRole: role ?? null,
			codeVerifier,
			expiresAt: this._sessionTokenHelper.expiresAt(this._oauthStateTtlSeconds),
		});
		return this._googleOauthAdapter.authorizeUrl(state, codeChallenge);
	}

	/**
	 * Spends the `state` (401 if unknown, expired or reused), exchanges `code`
	 * for Google's claims using the matching PKCE verifier, and signs in. 401
	 * for an unverified Google email. Linking to an existing account by email
	 * is safe only because `email_verified` is required.
	 */
	public async verifyGoogle(
		code: string,
		state: string,
		context: TClientContext,
	): Promise<TAuthResult> {
		const burned = await this._authTokenRepository.consumeByHash(
			this._sessionTokenHelper.hash(state),
			AUTH_TOKEN_PURPOSES.OauthState,
		);
		if (!burned?.codeVerifier) {
			throw new UnauthorizedException();
		}
		const claims = await this._googleOauthAdapter.exchangeCode(
			code,
			burned.codeVerifier,
		);
		if (!claims.email_verified) {
			throw new UnauthorizedException();
		}
		return this._signIn(
			{
				email: claims.email.trim().toLowerCase(),
				googleSub: claims.sub,
				...this._splitName(claims),
				avatarUrl: claims.picture ?? null,
			},
			this._toSignupRole(burned.intendedRole),
			context,
		);
	}

	/** Anonymous, stateless guest token; no user row is created. */
	public guest(): { accessToken: string; expiresIn: number } {
		return {
			accessToken: this._jwtAdapter.signAccessToken(
				randomUUID(),
				AuthRole.Guest,
			),
			expiresIn: this._jwtAdapter.accessTtlSeconds(AuthRole.Guest),
		};
	}

	/**
	 * The shared tail of both login methods. Finds the user (Google sub first,
	 * being the stable id, then email), enforces the picked role against an
	 * existing account, or creates the user. `intendedRole` only ever applies to
	 * a brand-new account; `admin` never comes from a request.
	 */
	private async _signIn(
		proof: {
			email: string;
			googleSub?: string;
			firstName?: string | null;
			lastName?: string | null;
			avatarUrl?: string | null;
		},
		intendedRole: TSignupRole | undefined,
		context: TClientContext,
	): Promise<TAuthResult> {
		const existing = await this._findExisting(proof);
		if (existing && intendedRole && existing.role !== intendedRole) {
			return { status: "role_mismatch", role: existing.role };
		}
		const user = existing
			? await this._verifyAndLink(existing, proof)
			: await this._createUser(proof, intendedRole ?? AuthRole.User);
		const signedIn =
			(await this._userRepository.update(user.id, {
				lastLoginAt: new Date(),
			})) ?? user;
		const tokens = await this._sessionService.issue(signedIn, context);
		return { status: "authenticated", user: signedIn, ...tokens };
	}

	/** Google sub first, then email. */
	private async _findExisting(proof: {
		email: string;
		googleSub?: string;
	}): Promise<TUser | null> {
		if (proof.googleSub) {
			const bySub = await this._userRepository.findByGoogleSub(proof.googleSub);
			if (bySub) {
				return bySub;
			}
		}
		return this._userRepository.findByEmail(proof.email);
	}

	/** Marks the email verified and links Google, filling only empty profile fields. */
	private async _verifyAndLink(
		user: TUser,
		proof: {
			googleSub?: string;
			firstName?: string | null;
			lastName?: string | null;
			avatarUrl?: string | null;
		},
	): Promise<TUser> {
		const patch = {
			...(user.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
			...(proof.googleSub && !user.googleSub
				? { googleSub: proof.googleSub }
				: {}),
			...(!user.firstName && proof.firstName
				? { firstName: proof.firstName, isOnboarded: true }
				: {}),
			...(!user.lastName && proof.lastName ? { lastName: proof.lastName } : {}),
			...(!user.avatarUrl && proof.avatarUrl
				? { avatarUrl: proof.avatarUrl }
				: {}),
		};
		if (Object.keys(patch).length === 0) {
			return user;
		}
		return (await this._userRepository.update(user.id, patch)) ?? user;
	}

	/** Creates the user; on a lost signup race, returns the winner's row. */
	private async _createUser(
		proof: {
			email: string;
			googleSub?: string;
			firstName?: string | null;
			lastName?: string | null;
			avatarUrl?: string | null;
		},
		role: TSignupRole,
	): Promise<TUser> {
		const created = await this._userRepository.create({
			email: proof.email,
			role,
			firstName: proof.firstName ?? null,
			lastName: proof.lastName ?? null,
			isOnboarded: Boolean(proof.firstName),
			avatarUrl: proof.avatarUrl ?? null,
			...(proof.googleSub ? { googleSub: proof.googleSub } : {}),
			emailVerifiedAt: new Date(),
		});
		if (created) {
			return created;
		}
		const winner = await this._userRepository.findByEmail(proof.email);
		if (!winner) {
			throw new UnauthorizedException();
		}
		return winner;
	}

	/**
	 * First/last name from Google's claims: the dedicated `given_name` /
	 * `family_name` when present, otherwise the full `name` split on whitespace.
	 */
	private _splitName(claims: {
		name?: string;
		given_name?: string;
		family_name?: string;
	}): { firstName: string | null; lastName: string | null } {
		const parts = (claims.name ?? "").trim().split(/\s+/).filter(Boolean);
		const lastFromName = parts.slice(1).join(" ");
		return {
			firstName: claims.given_name || parts[0] || null,
			lastName: claims.family_name || lastFromName || null,
		};
	}

	/** Defense in depth: a stored `admin` intent is dropped, never honoured. */
	private _toSignupRole(role: TUserRole | null): TSignupRole | undefined {
		return role === AuthRole.User || role === AuthRole.Restaurant
			? role
			: undefined;
	}

	/** Fixed-window per-email limit; 429 when exceeded. */
	private async _assertUnderRateLimit(email: string): Promise<void> {
		const count = await this._redisCacheAdapter.incrementWithTtl(
			`${_RATE_LIMIT_KEY_PREFIX}${email}`,
			_RATE_LIMIT_WINDOW_SECONDS,
		);
		if (count > this._magicLinkMaxPerHour) {
			throw new HttpException(
				"Too many sign-in requests",
				HttpStatus.TOO_MANY_REQUESTS,
			);
		}
	}

	/** Link to the web app (never this API -- see `WebAppConfigSchema`). */
	private _magicLinkUrl(token: string): string {
		return `${this._webAppBaseUrl}${this._webAppMagicPath}?token=${encodeURIComponent(token)}`;
	}
}
