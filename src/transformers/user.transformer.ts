import { USER_GENDERS } from "@/domain/enums/user-gender";
import type { TUser } from "@db/schemas/user.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";
import { type TUserResponse, userResponseSchema } from "./user.dto";

const _MAX_NAME = 100;
const _MAX_URL = 2048;
const _MIN_BIRTH_YEAR = 1900;

const _name = z.string().trim().min(1).max(_MAX_NAME);
const _phoneNumber = z
	.string()
	.trim()
	.regex(/^\+?[0-9]{10,15}$/, "enter a valid phone number");

/** `YYYY-MM-DD`, a real calendar date, not in the future. */
const _pastDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
	.refine((value) => !Number.isNaN(new Date(value).getTime()), {
		message: "invalid date",
	})
	.refine((value) => new Date(value).getUTCFullYear() >= _MIN_BIRTH_YEAR, {
		message: `year must be ${_MIN_BIRTH_YEAR} or later`,
	})
	.refine((value) => new Date(value).getTime() <= Date.now(), {
		message: "date cannot be in the future",
	});

const _updateMeSchema = z
	.object({
		firstName: _name.optional(),
		lastName: _name.optional(),
		avatarUrl: z.string().url().max(_MAX_URL).nullable().optional(),
		phoneNumber: _phoneNumber.nullable().optional(),
		dateOfBirth: _pastDate.nullable().optional(),
		anniversaryDate: _pastDate.nullable().optional(),
		gender: z.enum(USER_GENDERS).nullable().optional(),
	})
	.strict();

const _onboardSchema = z.object({ firstName: _name, lastName: _name }).strict();

/** Validates profile request bodies and shapes the user wire response. */
@Injectable()
export class UserTransformer {
	/** Body → profile patch, built by key presence; empty body is 400. */
	public toUpdateMeRequestDTO(body: unknown): {
		firstName?: string;
		lastName?: string;
		avatarUrl?: string | null;
		phoneNumber?: string | null;
		dateOfBirth?: string | null;
		anniversaryDate?: string | null;
		gender?: (typeof USER_GENDERS)[number] | null;
	} {
		const data = parseOrBadRequest(_updateMeSchema, body);
		const patch = {
			...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
			...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
			...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
			...(data.phoneNumber !== undefined
				? { phoneNumber: data.phoneNumber }
				: {}),
			...(data.dateOfBirth !== undefined
				? { dateOfBirth: data.dateOfBirth }
				: {}),
			...(data.anniversaryDate !== undefined
				? { anniversaryDate: data.anniversaryDate }
				: {}),
			...(data.gender !== undefined ? { gender: data.gender } : {}),
		};
		if (Object.keys(patch).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return patch;
	}

	/** Body → onboarding names. */
	public toOnboardRequestDTO(body: unknown): {
		firstName: string;
		lastName: string;
	} {
		return parseOrBadRequest(_onboardSchema, body);
	}

	/** User → wire DTO (drops `googleSub` and other internals). */
	public toMeResponseDTO(user: TUser): TUserResponse {
		return userResponseSchema.parse(user);
	}
}
