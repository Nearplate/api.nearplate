import {
	RESTAURANT_VERIFICATION_STATUSES,
	RestaurantVerificationStatus,
} from "@/domain/enums/restaurant-verification-status";
import type { TPage } from "@/domain/types/page.types";
import type { TListRestaurantsForReviewInput } from "@/domain/types/restaurant.types";
import {
	toAdminRestaurantResponse,
	type TAdminRestaurantResponse,
} from "@/transformers/restaurant.dto";
import { parseOrBadRequest } from "@/transformers/parse";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { Injectable } from "@nestjs/common";
import { z } from "zod";

const _MAX_LIMIT = 100;
const _DEFAULT_LIMIT = 20;
const _MAX_REASON = 500;

const _listSchema = z.object({
	status: z
		.enum(RESTAURANT_VERIFICATION_STATUSES)
		.default(RestaurantVerificationStatus.PendingReview),
	limit: z.coerce.number().int().min(1).max(_MAX_LIMIT).default(_DEFAULT_LIMIT),
	offset: z.coerce.number().int().min(0).default(0),
});

const _rejectSchema = z
	.object({ reason: z.string().trim().min(1).max(_MAX_REASON) })
	.strict();

export type TAdminRestaurantListResponse = {
	items: TAdminRestaurantResponse[];
	total: number;
};

/** Validates admin restaurant-review input and maps rows to the admin wire DTO. */
@Injectable()
export class AdminRestaurantTransformer {
	/** Query → review queue filter; defaults to `pending_review`. */
	public toListRequestDTO(query: unknown): TListRestaurantsForReviewInput {
		const data = parseOrBadRequest(_listSchema, query);
		return {
			verificationStatus: data.status,
			limit: data.limit,
			offset: data.offset,
		};
	}

	/** Body → rejection reason; a blank or missing reason is 400. */
	public toRejectRequestDTO(body: unknown): { reason: string } {
		return parseOrBadRequest(_rejectSchema, body);
	}

	/** Page → wire DTO. */
	public toListResponseDTO(
		page: TPage<TRestaurant>,
	): TAdminRestaurantListResponse {
		return {
			items: page.items.map(toAdminRestaurantResponse),
			total: page.total,
		};
	}

	/** Row → wire DTO. */
	public toResponseDTO(row: TRestaurant): TAdminRestaurantResponse {
		return toAdminRestaurantResponse(row);
	}
}
