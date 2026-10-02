import { UploadKind } from "@/domain/enums/upload-kind";

/** MIME types accepted for a restaurant logo or banner upload. */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

const _ONE_MB = 1024 * 1024;

/** Max upload size per kind, in bytes. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
	[UploadKind.Logo]: 2 * _ONE_MB,
	[UploadKind.Banner]: 5 * _ONE_MB,
	[UploadKind.MenuItem]: 3 * _ONE_MB,
};

const _EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"application/pdf": "pdf",
};

/** File extension for an allowed image or document content type. */
export function extensionForContentType(contentType: string): string {
	return _EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
}
