/** MIME types accepted for a restaurant KYC document upload. */
export const ALLOWED_DOCUMENT_CONTENT_TYPES = [
	"application/pdf",
	"image/jpeg",
	"image/png",
] as const;

/** Max size of one KYC document upload, in bytes (5 MB). */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
