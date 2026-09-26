import { AuthRole } from "@/domain/enums/auth-role";
import type {
	TAuthResult,
	TMagicLinkResult,
	TSignupRole,
} from "@/services/auth.service";
import type { TAuthTokens } from "@/services/session.service";
import type { TUser } from "@db/schemas/user.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";

const _MAX_EMAIL = 254;
const _MAX_NAME = 100;
const _MAX_URL = 2048;
const _MAX_TOKEN = 2048;

const _email = z.string().trim().toLowerCase().email().max(_MAX_EMAIL);
/** `admin` is deliberately not accepted: it can only be set in the database. */
const _signupRole = z.enum([AuthRole.User, AuthRole.Restaurant]).optional();
const _token = z.string().min(1).max(_MAX_TOKEN);

const _magicLinkSchema = z
	.object({ email: _email, role: _signupRole })
	.strict();
const _verifySchema = z.object({ token: _token }).strict();
const _googleSchema = z.object({ idToken: _token, role: _signupRole }).strict();
const _refreshSchema = z.object({ refreshToken: _token }).strict();
const _updateMeSchema = z
	.object({
		name: z.string().trim().min(1).max(_MAX_NAME).nullable().optional(),
		avatarUrl: z.string().url().max(_MAX_URL).nullable().optional(),
	})
	.strict();

const _userResponseSchema = z.object({
	id: z.string(),
	email: z.string(),
	role: z.enum([AuthRole.Admin, AuthRole.Restaurant, AuthRole.User]),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	/** Coerced: `@DBCache` hits arrive from Redis JSON with dates as strings. */
	createdAt: z.coerce.date().transform((d) => d.toISOString()),
});

export type TUserResponse = z.infer<typeof _userResponseSchema>;
export type TTokensResponse = TAuthTokens;
export type TAuthResultResponse =
	| ({ status: "authenticated"; user: TUserResponse } & TAuthTokens)
	| { status: "role_mismatch"; role: string };
export type TMagicLinkResponse =
	{ status: "sent" } | { status: "role_mismatch"; role: string };

/** Validates auth request bodies and shapes wire responses. */
@Injectable()
export class AuthTransformer {
	/** Body → magic-link request. */
	public toMagicLinkRequestDTO(body: unknown): {
		email: string;
		role?: TSignupRole;
	} {
		const data = this._parse(_magicLinkSchema, body);
		return { email: data.email, ...(data.role ? { role: data.role } : {}) };
	}

	/** Result → wire DTO. */
	public toMagicLinkResponseDTO(result: TMagicLinkResult): TMagicLinkResponse {
		return result;
	}

	/** Body → verify input. */
	public toVerifyRequestDTO(body: unknown): { token: string } {
		return this._parse(_verifySchema, body);
	}

	/** Body → Google login input. */
	public toGoogleRequestDTO(body: unknown): {
		idToken: string;
		role?: TSignupRole;
	} {
		const data = this._parse(_googleSchema, body);
		return {
			idToken: data.idToken,
			...(data.role ? { role: data.role } : {}),
		};
	}

	/** Login result → wire DTO. */
	public toAuthResponseDTO(result: TAuthResult): TAuthResultResponse {
		if (result.status === "role_mismatch") {
			return result;
		}
		const { user, accessToken, refreshToken, expiresIn } = result;
		return {
			status: "authenticated",
			user: this.toMeResponseDTO(user),
			accessToken,
			refreshToken,
			expiresIn,
		};
	}

	/** Body → refresh input. */
	public toRefreshRequestDTO(body: unknown): { refreshToken: string } {
		return this._parse(_refreshSchema, body);
	}

	/** Tokens → wire DTO. */
	public toRefreshResponseDTO(tokens: TAuthTokens): TTokensResponse {
		return tokens;
	}

	/** Body → logout input. */
	public toLogoutRequestDTO(body: unknown): { refreshToken: string } {
		return this._parse(_refreshSchema, body);
	}

	/** Guest token → wire DTO. */
	public toGuestResponseDTO(guest: {
		accessToken: string;
		expiresIn: number;
	}): { accessToken: string; expiresIn: number } {
		return guest;
	}

	/** Body → profile patch, built by key presence; empty body is 400. */
	public toUpdateMeRequestDTO(body: unknown): {
		name?: string | null;
		avatarUrl?: string | null;
	} {
		const data = this._parse(_updateMeSchema, body);
		const patch = {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
		};
		if (Object.keys(patch).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return patch;
	}

	/** User → wire DTO (drops `googleSub` and other internals). */
	public toMeResponseDTO(user: TUser): TUserResponse {
		return _userResponseSchema.parse(user);
	}

	/** Zod parse that turns failures into a 400. */
	private _parse<T extends z.ZodTypeAny>(
		schema: T,
		input: unknown,
	): z.infer<T> {
		const parsed = schema.safeParse(input);
		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues
					.map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
					.join("; "),
			);
		}
		return parsed.data;
	}
}
