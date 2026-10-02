import {
	RESTAURANT_VERIFICATION_STATUSES,
	RestaurantVerificationStatus,
} from "@/domain/enums/restaurant-verification-status";
import type { TPage } from "@/domain/types/page.types";
import type { TRestaurantReviewDetail } from "@/domain/types/admin.types";
import type { TListRestaurantsForReviewInput } from "@/domain/types/restaurant.types";
import {
	toAdminKycResponse,
	toRestaurantDocumentResponse,
	type TKycResponse,
	type TRestaurantDocumentResponse,
} from "@/transformers/restaurant.dto";
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

/**
 * Review detail: the admin restaurant shape plus full (unmasked) KYC and
 * every document with a short-lived download URL.
 */
export type TAdminRestaurantDetailResponse = TAdminRestaurantResponse & {
	kyc: TKycResponse | null;
	documents: TRestaurantDocumentResponse[];
};

/** Validates admin restaurant-review input and maps rows to the admin wire DTO. */
@Injectable()
export class AdminTransformer {
	/** Query → review queue filter; defaults to `pending_review`. */
	public toListRestaurantsRequestDTO(
		query: unknown,
	): TListRestaurantsForReviewInput {
		const data = parseOrBadRequest(_listSchema, query);
		return {
			verificationStatus: data.status,
			limit: data.limit,
			offset: data.offset,
		};
	}

	/** Body → rejection reason; a blank or missing reason is 400. */
	public toRejectRestaurantRequestDTO(body: unknown): { reason: string } {
		return parseOrBadRequest(_rejectSchema, body);
	}

	/** Page → wire DTO. */
	public toListRestaurantsResponseDTO(
		page: TPage<TRestaurant>,
	): TAdminRestaurantListResponse {
		return {
			items: page.items.map(toAdminRestaurantResponse),
			total: page.total,
		};
	}

	/** Review detail → wire DTO with full KYC and document download URLs. */
	public toGetRestaurantResponseDTO(
		detail: TRestaurantReviewDetail,
	): TAdminRestaurantDetailResponse {
		return {
			...toAdminRestaurantResponse(detail.restaurant),
			kyc: detail.kyc ? toAdminKycResponse(detail.kyc) : null,
			documents: detail.documents.map(toRestaurantDocumentResponse),
		};
	}

	/** Row → wire DTO. */
	public toRestaurantResponseDTO(row: TRestaurant): TAdminRestaurantResponse {
		return toAdminRestaurantResponse(row);
	}
}
