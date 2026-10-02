import {
	ALLOWED_DOCUMENT_CONTENT_TYPES,
	MAX_DOCUMENT_BYTES,
} from "@/domain/constants/document";
import {
	RESTAURANT_DOCUMENT_TYPES,
	type RestaurantDocumentType,
} from "@/domain/enums/restaurant-document-type";
import type {
	TCreateDocumentUploadInput,
	TDocumentUploadResult,
	TRestaurantDocumentView,
} from "@/domain/types/restaurant-document.types";
import type {
	TKycDetails,
	TUpdateKycInput,
} from "@/domain/types/restaurant-kyc.types";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";
import {
	type TDocumentUploadResponse,
	type TKycResponse,
	type TRestaurantDocumentResponse,
	toDocumentUploadResponse,
	toOwnerKycResponse,
	toRestaurantDocumentResponse,
} from "./restaurant-onboarding.dto";

const _MAX_KYC_NAME = 100;

/** Indian PAN: 5 letters, 4 digits, 1 letter (uppercased before matching). */
const _PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** FSSAI licence number: exactly 14 digits. */
const _FSSAI_RE = /^\d{14}$/;
/** IFSC: 4-letter bank code, a literal 0, then a 6-character branch code. */
const _IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** Indian bank account numbers are 9 to 18 digits. */
const _ACCOUNT_NUMBER_RE = /^\d{9,18}$/;

const _kycName = z.string().trim().min(1).max(_MAX_KYC_NAME);

/**
 * Every field optional so onboarding can be saved as a partial draft. Regex
 * failures report only the field path, never the submitted value.
 */
const _updateKycSchema = z
	.object({
		panNumber: z.string().trim().toUpperCase().regex(_PAN_RE),
		fssaiNumber: z.string().trim().regex(_FSSAI_RE),
		accountHolderName: _kycName,
		accountNumber: z.string().trim().regex(_ACCOUNT_NUMBER_RE),
		ifscCode: z.string().trim().toUpperCase().regex(_IFSC_RE),
		bankName: _kycName,
	})
	.partial()
	.strict();

const _createDocumentUploadSchema = z
	.object({
		type: z.enum(RESTAURANT_DOCUMENT_TYPES),
		contentType: z.enum(ALLOWED_DOCUMENT_CONTENT_TYPES),
		size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
	})
	.strict();

const _documentTypeSchema = z.enum(RESTAURANT_DOCUMENT_TYPES);

export type TDocumentListResponse = { items: TRestaurantDocumentResponse[] };

/** Request validation and wire mapping for `RestaurantOnboardingController`. */
@Injectable()
export class RestaurantOnboardingTransformer {
	/** Body → document upload input; 400 for an unknown type, disallowed content type or oversize request. */
	public toCreateDocumentUploadRequestDTO(
		body: unknown,
	): TCreateDocumentUploadInput {
		return parseOrBadRequest(_createDocumentUploadSchema, body);
	}

	/** `:type` path param → document type; an unknown type is a 404 (no such resource). */
	public toDocumentTypeRequestDTO(type: string): RestaurantDocumentType {
		const parsed = _documentTypeSchema.safeParse(type);
		if (!parsed.success) {
			throw new NotFoundException();
		}
		return parsed.data;
	}

	/** Presigned-post payload → wire DTO. */
	public toCreateDocumentUploadResponseDTO(
		data: TDocumentUploadResult,
	): TDocumentUploadResponse {
		return toDocumentUploadResponse(data);
	}

	/** Confirmed document → wire DTO. */
	public toConfirmDocumentUploadResponseDTO(
		view: TRestaurantDocumentView,
	): TRestaurantDocumentResponse {
		return toRestaurantDocumentResponse(view);
	}

	/** Body → KYC patch, built by key presence; empty body is 400. */
	public toUpdateKycRequestDTO(body: unknown): TUpdateKycInput {
		const data = parseOrBadRequest(_updateKycSchema, body);
		if (Object.keys(data).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return data;
	}

	/** KYC details → owner wire DTO (PAN and account number masked). */
	public toGetKycResponseDTO(details: TKycDetails): TKycResponse {
		return toOwnerKycResponse(details);
	}

	/** Saved KYC details → owner wire DTO (PAN and account number masked). */
	public toUpdateKycResponseDTO(details: TKycDetails): TKycResponse {
		return toOwnerKycResponse(details);
	}

	/** Documents → wire DTO list. */
	public toListDocumentsResponseDTO(
		views: TRestaurantDocumentView[],
	): TDocumentListResponse {
		return { items: views.map((view) => toRestaurantDocumentResponse(view)) };
	}
}
