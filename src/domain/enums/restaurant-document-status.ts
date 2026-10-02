/**
 * `pending`: a presigned POST was issued but the upload is not confirmed yet
 * (swept after `expiresAt`). `uploaded`: confirmed against S3 via `headObject`.
 */
export enum RestaurantDocumentStatus {
	Pending = "pending",
	Uploaded = "uploaded",
}

export const RESTAURANT_DOCUMENT_STATUSES = [
	RestaurantDocumentStatus.Pending,
	RestaurantDocumentStatus.Uploaded,
] as const;
