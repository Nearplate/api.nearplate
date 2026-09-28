import type { TNearbyRestaurant } from "@/repositories/restaurant.repository";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { z } from "zod";
import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";

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
