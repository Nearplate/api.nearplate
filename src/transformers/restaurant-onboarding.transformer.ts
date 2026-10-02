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
import { Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";
import {
	type TDocumentUploadResponse,
	type TRestaurantDocumentResponse,
	toDocumentUploadResponse,
	toRestaurantDocumentResponse,
} from "./restaurant-onboarding.dto";

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

	/** Documents → wire DTO list. */
	public toListDocumentsResponseDTO(
		views: TRestaurantDocumentView[],
	): TDocumentListResponse {
		return { items: views.map((view) => toRestaurantDocumentResponse(view)) };
	}
}
