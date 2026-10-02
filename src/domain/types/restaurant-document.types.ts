import type { RestaurantDocumentType } from "@/domain/enums/restaurant-document-type";
import type { TRestaurantDocument } from "@db/schemas/restaurant-document.schema";

export type TCreateDocumentUploadInput = {
	type: RestaurantDocumentType;
	contentType: string;
	size: number;
};

/** Presigned-POST response returned to the client for a document upload. */
export type TDocumentUploadResult = {
	type: RestaurantDocumentType;
	url: string;
	fields: Record<string, string>;
	expiresAt: Date;
};

/**
 * A document row plus a short-lived presigned GET `url`, which is set only
 * once the upload is confirmed.
 */
export type TRestaurantDocumentView = TRestaurantDocument & {
	url: string | null;
};
