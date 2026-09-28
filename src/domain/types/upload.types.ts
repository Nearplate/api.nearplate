import type { UploadKind } from "@/domain/enums/upload-kind";

export type TCreateImageUploadInput = {
	kind: UploadKind;
	contentType: string;
	size: number;
};

/** A menu item has one photo slot, so the kind is implied by the route. */
export type TCreateMenuItemImageUploadInput = {
	contentType: string;
	size: number;
};

/** Presigned-POST response returned to the client for a new pending upload. */
export type TImageUploadResponse = {
	uploadId: string;
	url: string;
	fields: Record<string, string>;
	publicUrl: string;
	expiresAt: Date;
};
