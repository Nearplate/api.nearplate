import { AuthRole } from "@/domain/enums/auth-role";
import { type TUserResponse, userResponseSchema } from "./user.dto";
import type {
	TAuthResult,
	TMagicLinkResult,
	TSignupRole,
} from "@/services/auth.service";
import type { TAuthTokens } from "@/services/session.service";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";

const _MAX_EMAIL = 254;
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
		const data = parseOrBadRequest(_magicLinkSchema, body);
		return { email: data.email, ...(data.role ? { role: data.role } : {}) };
	}

	/** Result → wire DTO. */
	public toMagicLinkResponseDTO(result: TMagicLinkResult): TMagicLinkResponse {
		return result;
	}

	/** Body → verify input. */
	public toVerifyRequestDTO(body: unknown): { token: string } {
		return parseOrBadRequest(_verifySchema, body);
	}

	/** Body → Google login input. */
	public toGoogleRequestDTO(body: unknown): {
		idToken: string;
		role?: TSignupRole;
	} {
		const data = parseOrBadRequest(_googleSchema, body);
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
			user: userResponseSchema.parse(user),
			accessToken,
			refreshToken,
			expiresIn,
		};
	}

	/** Body → refresh input. */
	public toRefreshRequestDTO(body: unknown): { refreshToken: string } {
		return parseOrBadRequest(_refreshSchema, body);
	}

	/** Tokens → wire DTO. */
	public toRefreshResponseDTO(tokens: TAuthTokens): TTokensResponse {
		return tokens;
	}

	/** Body → logout input. */
	public toLogoutRequestDTO(body: unknown): { refreshToken: string } {
		return parseOrBadRequest(_refreshSchema, body);
	}

	/** Guest token → wire DTO. */
	public toGuestResponseDTO(guest: {
		accessToken: string;
		expiresIn: number;
	}): { accessToken: string; expiresIn: number } {
		return guest;
	}
}
