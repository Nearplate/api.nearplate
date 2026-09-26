import type { TNearbyRestaurantsInput } from "@/domain/types/restaurant.types";
import type { TNearbyRestaurant } from "@/repositories/restaurant.repository";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TMenuItemResponse, toMenuItemResponse } from "./menu-item.dto";
import { parseOrBadRequest } from "./parse";
import {
	type TNearbyRestaurantResponse,
	type TRestaurantResponse,
	toNearbyRestaurantResponse,
	toRestaurantResponse,
} from "./restaurant.dto";

const _METERS_PER_KM = 1000;
const _DEFAULT_RADIUS_KM = 5;
const _MAX_RADIUS_KM = 25;
const _DEFAULT_LIMIT = 20;
const _MAX_LIMIT = 50;
const _MAX_SLUG = 200;
const _MAX_CUISINE = 40;

/**
 * A query-string number. Not `z.coerce.number()`: `Number("")` is 0, which
 * would silently turn `?lng=` into a valid longitude.
 */
const _queryNumber = z
	.string()
	.trim()
	.min(1)
	.transform(Number)
	.pipe(z.number().finite());

const _nearbySchema = z.object({
	lng: _queryNumber.pipe(z.number().min(-180).max(180)),
	lat: _queryNumber.pipe(z.number().min(-90).max(90)),
	radiusKm: _queryNumber
		.pipe(z.number().positive().max(_MAX_RADIUS_KM))
		.default(String(_DEFAULT_RADIUS_KM)),
	isPureVeg: z
		.enum(["true", "false"])
		.transform((v) => v === "true")
		.optional(),
	cuisine: z.string().trim().toLowerCase().min(1).max(_MAX_CUISINE).optional(),
	limit: _queryNumber
		.pipe(z.number().int().min(1).max(_MAX_LIMIT))
		.default(String(_DEFAULT_LIMIT)),
});

const _slugSchema = z.string().trim().min(1).max(_MAX_SLUG);

/** Validates public restaurant requests and shapes the wire responses. */
@Injectable()
export class RestaurantTransformer {
	/** Query → nearby search input (radius in km on the wire, metres inside). */
	public toNearbyRequestDTO(query: unknown): TNearbyRestaurantsInput {
		const data = parseOrBadRequest(_nearbySchema, query);
		return {
			coordinates: [data.lng, data.lat],
			radiusMeters: data.radiusKm * _METERS_PER_KM,
			limit: data.limit,
			...(data.isPureVeg !== undefined ? { isPureVeg: data.isPureVeg } : {}),
			...(data.cuisine ? { cuisine: data.cuisine } : {}),
		};
	}

	/** Path param → slug. */
	public toSlugRequestDTO(slug: unknown): string {
		return parseOrBadRequest(_slugSchema, slug);
	}

	/** Rows → wire DTO. */
	public toNearbyResponseDTO(rows: TNearbyRestaurant[]): {
		items: TNearbyRestaurantResponse[];
	} {
		return { items: rows.map(toNearbyRestaurantResponse) };
	}

	/** Row → wire DTO. */
	public toGetBySlugResponseDTO(row: TRestaurant): TRestaurantResponse {
		return toRestaurantResponse(row);
	}

	/** Items → wire DTO (already sorted by category, then name). */
	public toGetMenuResponseDTO(items: TMenuItem[]): {
		items: TMenuItemResponse[];
	} {
		return { items: items.map(toMenuItemResponse) };
	}
}
