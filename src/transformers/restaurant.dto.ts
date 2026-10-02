import type { TNearbyRestaurant } from "@/repositories/restaurant.repository";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { z } from "zod";
import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";
import { RESTAURANT_VERIFICATION_STATUSES } from "@/domain/enums/restaurant-verification-status";
import type { TImageUploadResponse as TImageUploadInput } from "@/domain/types/upload.types";

const _date = z.coerce.date().transform((d) => d.toISOString());

const _addressResponseSchema = z.object({
	id: z.string(),
	line1: z.string(),
	line2: z.string().nullable(),
	city: z.string(),
	state: z.string(),
	zipcode: z.string(),
	phoneNumber: z.string().nullable(),
});

/**
 * Wire shape of a restaurant, shared by the owner and public transformers.
 * Unknown keys (`ownerId`, address timestamps) are stripped. `createdAt` is
 * coerced because cached rows arrive from Redis JSON with dates as strings.
 */
const _restaurantSchema = z.object({
	id: z.string(),
	slug: z.string(),
	name: z.string(),
	status: z.enum(RESTAURANT_STATUSES),
	cuisines: z.array(z.string()),
	isPureVeg: z.boolean(),
	description: z.string().nullable(),
	logoUrl: z.string().nullable(),
	bannerUrl: z.string().nullable(),
	location: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
	address: _addressResponseSchema,
	createdAt: _date,
	updatedAt: _date,
});

type TParsedRestaurant = z.infer<typeof _restaurantSchema>;

/** `coordinates` is `[longitude, latitude]`. */
export type TRestaurantResponse = Omit<TParsedRestaurant, "location"> & {
	coordinates: [number, number];
};
export type TNearbyRestaurantResponse = TRestaurantResponse & {
	distanceMeters: number;
};

/** Row → wire DTO. */
export function toRestaurantResponse(row: TRestaurant): TRestaurantResponse {
	const { location, ...rest } = _restaurantSchema.parse(row);
	return { ...rest, coordinates: location.coordinates };
}

const _ownerFieldsSchema = z.object({
	verificationStatus: z.enum(RESTAURANT_VERIFICATION_STATUSES),
	rejectionReason: z.string().nullable(),
});

/** Owner-facing wire shape: the public shape plus the review state. */
export type TOwnerRestaurantResponse = TRestaurantResponse &
	z.infer<typeof _ownerFieldsSchema>;

/** Row → owner wire DTO (never used on public routes). */
export function toOwnerRestaurantResponse(
	row: TRestaurant,
): TOwnerRestaurantResponse {
	return {
		...toRestaurantResponse(row),
		..._ownerFieldsSchema.parse(row),
	};
}

/** Admin wire shape: the owner shape plus the owner id and review times. */
export type TAdminRestaurantResponse = TOwnerRestaurantResponse & {
	ownerId: string;
	submittedAt: string | null;
	reviewedAt: string | null;
};

/** Row → admin wire DTO (admin routes only). */
export function toAdminRestaurantResponse(
	row: TRestaurant,
): TAdminRestaurantResponse {
	return {
		...toOwnerRestaurantResponse(row),
		ownerId: row.ownerId,
		submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
		reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
	};
}

/** Nearby row → wire DTO with the distance rounded to whole metres. */
export function toNearbyRestaurantResponse(
	row: TNearbyRestaurant,
): TNearbyRestaurantResponse {
	return {
		...toRestaurantResponse(row),
		distanceMeters: Math.round(row.distanceMeters),
	};
}

const _qrCodeSchema = z.object({
	url: z.string(),
	pngDataUrl: z.string(),
	svgDataUrl: z.string(),
});

export type TQrCodeResponse = z.infer<typeof _qrCodeSchema>;

/** Validates the outgoing QR code payload before it reaches the wire. */
export function toQrCodeResponse(data: TQrCodeResponse): TQrCodeResponse {
	return _qrCodeSchema.parse(data);
}

const _imageUploadSchema = z.object({
	uploadId: z.string(),
	url: z.string(),
	fields: z.record(z.string()),
	publicUrl: z.string(),
	expiresAt: _date,
});

export type TImageUploadResponse = z.infer<typeof _imageUploadSchema>;

/** Validates the outgoing presigned-post payload before it reaches the wire. */
export function toImageUploadResponse(
	data: TImageUploadInput,
): TImageUploadResponse {
	return _imageUploadSchema.parse(data);
}
