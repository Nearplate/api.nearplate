import type { TConfig } from "@/app/modules/config";
import { LogClass } from "@/app/modules/logger";
import { AUTH_ROLES, AuthRole, type TAuthRole } from "@/domain/enums/auth-role";
import {
	ForbiddenException,
	Inject,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decode, sign, verify } from "jsonwebtoken";
import { z } from "zod";

export { AUTH_ROLES, AuthRole, type TAuthRole };

const _accessTokenPayloadSchema = z.object({
	sub: z.string().min(1),
	role: z.enum(AUTH_ROLES),
});
export type TAccessTokenPayload = z.infer<typeof _accessTokenPayloadSchema>;

type TRoleKeys = { secret: string; ttlSeconds: number };

/** Access-token signing/verification with one secret per role. */
@LogClass()
@Injectable()
export class JwtAdapter {
	private readonly _keys: Record<TAuthRole, TRoleKeys>;

	constructor(
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {
		this._keys = {
			[AuthRole.Admin]: this._load("ADMIN"),
			[AuthRole.Restaurant]: this._load("RESTAURANT"),
			[AuthRole.User]: this._load("USER"),
			[AuthRole.Guest]: this._load("GUEST"),
		};
	}

	/** Signs an access token for `subject` with the secret of `role`. */
	public signAccessToken(subject: string, role: TAuthRole): string {
		const { secret, ttlSeconds } = this._keys[role];
		return sign({ sub: subject, role }, secret, { expiresIn: ttlSeconds });
	}

	/** Access-token lifetime for `role`, in seconds. */
	public accessTtlSeconds(role: TAuthRole): number {
		return this._keys[role].ttlSeconds;
	}

	/**
	 * Verifies `token` against the secret of the role it *claims*, so a token is
	 * accepted only if it was signed with that role's own secret. The claim is
	 * read unverified solely to choose the secret; the verified payload is what
	 * gets returned. 401 for any invalid token, 403 for a valid one whose role
	 * is not in `allowedRoles`.
	 */
	public verifyAccessToken(
		token: string,
		allowedRoles: readonly TAuthRole[],
	): TAccessTokenPayload {
		const claimedRole = this._claimedRole(token);
		let verified: unknown;
		try {
			verified = verify(token, this._keys[claimedRole].secret);
		} catch {
			throw new UnauthorizedException();
		}
		const parsed = _accessTokenPayloadSchema.safeParse(verified);
		if (!parsed.success || parsed.data.role !== claimedRole) {
			throw new UnauthorizedException();
		}
		if (!allowedRoles.includes(parsed.data.role)) {
			throw new ForbiddenException();
		}
		return parsed.data;
	}

	/** Reads the unverified `role` claim; unknown or absent roles are 401. */
	private _claimedRole(token: string): TAuthRole {
		const decoded = decode(token);
		const role =
			decoded && typeof decoded === "object" ? decoded["role"] : undefined;
		if (!AUTH_ROLES.includes(role as TAuthRole)) {
			throw new UnauthorizedException();
		}
		return role as TAuthRole;
	}

	/** Loads `JWT_{ROLE}_ACCESS_SECRET` / `_TTL_SECONDS` from config. */
	private _load(role: "ADMIN" | "RESTAURANT" | "USER" | "GUEST"): TRoleKeys {
		return {
			secret: this._configService.getOrThrow<string>(
				`JWT_${role}_ACCESS_SECRET`,
			),
			ttlSeconds: this._configService.getOrThrow<number>(
				`JWT_${role}_ACCESS_TTL_SECONDS`,
			),
		};
	}
}
