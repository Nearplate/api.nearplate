import { RESTAURANT_DOCUMENT_STATUSES } from "@/domain/enums/restaurant-document-status";
import { RESTAURANT_DOCUMENT_TYPES } from "@/domain/enums/restaurant-document-type";
import type {
	TDocumentUploadResult,
	TRestaurantDocumentView,
} from "@/domain/types/restaurant-document.types";
import type { TKycDetails } from "@/domain/types/restaurant-kyc.types";
import { z } from "zod";

/** PAN `ABCDE1234F` → `XXXXX1234F`: the 5-letter prefix is hidden. */
const _PAN_VISIBLE_FROM = 5;
/** Bank account numbers show only their last 4 digits. */
const _ACCOUNT_VISIBLE_TAIL = 4;

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

const _kycSchema = z.object({
	panNumber: z.string().nullable(),
	fssaiNumber: z.string().nullable(),
	accountHolderName: z.string().nullable(),
	accountNumber: z.string().nullable(),
	ifscCode: z.string().nullable(),
	bankName: z.string().nullable(),
	updatedAt: _date.nullable(),
});

export type TKycResponse = z.infer<typeof _kycSchema>;

/** Replaces every character before `visibleFrom` with `X`. */
function _mask(value: string | null, visibleFrom: number): string | null {
	if (value === null) {
		return null;
	}
	const from = Math.max(0, Math.min(visibleFrom, value.length));
	return "X".repeat(from) + value.slice(from);
}

/**
 * Owner wire shape: PAN and account number masked. The owner typed them in,
 * so the visible tail is enough to recognise them, and a leaked session or
 * screenshot never exposes the full values.
 */
export function toOwnerKycResponse(details: TKycDetails): TKycResponse {
	return _kycSchema.parse({
		...details,
		panNumber: _mask(details.panNumber, _PAN_VISIBLE_FROM),
		accountNumber: _mask(
			details.accountNumber,
			(details.accountNumber?.length ?? 0) - _ACCOUNT_VISIBLE_TAIL,
		),
	});
}

/** Admin wire shape: full values, needed to verify against the documents. */
export function toAdminKycResponse(details: TKycDetails): TKycResponse {
	return _kycSchema.parse(details);
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
