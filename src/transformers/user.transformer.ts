import type { TUser } from "@db/schemas/user.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";
import { type TUserResponse, userResponseSchema } from "./user.dto";

const _MAX_NAME = 100;
const _MAX_URL = 2048;

const _name = z.string().trim().min(1).max(_MAX_NAME);

const _updateMeSchema = z
	.object({
		firstName: _name.optional(),
		lastName: _name.optional(),
		avatarUrl: z.string().url().max(_MAX_URL).nullable().optional(),
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
	} {
		const data = parseOrBadRequest(_updateMeSchema, body);
		const patch = {
			...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
			...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
			...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
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
