import { RESTAURANT_DOCUMENT_STATUSES } from "@/domain/enums/restaurant-document-status";
import { RESTAURANT_DOCUMENT_TYPES } from "@/domain/enums/restaurant-document-type";
import type {
	TDocumentUploadResult,
	TRestaurantDocumentView,
} from "@/domain/types/restaurant-document.types";
import { z } from "zod";

const _date = z.coerce.date().transform((d) => d.toISOString());

/**
 * Wire shape of one KYC document, shared by the owner and admin routes.
 * `objectKey`, `ownerId` and ids are stripped: the only way to read the file
 * is the short-lived presigned `url`.
 */
const _documentSchema = z.object({
	type: z.enum(RESTAURANT_DOCUMENT_TYPES),
	status: z.enum(RESTAURANT_DOCUMENT_STATUSES),
	contentType: z.string(),
	size: z.number(),
	url: z.string().nullable(),
	updatedAt: _date,
});

export type TRestaurantDocumentResponse = z.infer<typeof _documentSchema>;

/** Document view → wire DTO. */
export function toRestaurantDocumentResponse(
	view: TRestaurantDocumentView,
): TRestaurantDocumentResponse {
	return _documentSchema.parse(view);
}

const _documentUploadSchema = z.object({
	type: z.enum(RESTAURANT_DOCUMENT_TYPES),
	url: z.string(),
	fields: z.record(z.string()),
	expiresAt: _date,
});

export type TDocumentUploadResponse = z.infer<typeof _documentUploadSchema>;

/** Validates the outgoing presigned-post payload before it reaches the wire. */
export function toDocumentUploadResponse(
	data: TDocumentUploadResult,
): TDocumentUploadResponse {
	return _documentUploadSchema.parse(data);
}
