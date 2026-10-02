import {
	ALLOWED_IMAGE_CONTENT_TYPES,
	MAX_UPLOAD_BYTES,
} from "@/domain/constants/upload";
import { FOOD_TYPES } from "@/domain/enums/food-type";
import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";
import { UPLOAD_KINDS, UploadKind } from "@/domain/enums/upload-kind";
import type { TPage } from "@/domain/types/page.types";
import type {
	TCreateMenuItemInput,
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import type {
	TCreateRestaurantInput,
	TListRestaurantsInput,
	TNearbyRestaurantsInput,
	TUpdateRestaurantInput,
} from "@/domain/types/restaurant.types";
import type {
	TCreateImageUploadInput,
	TCreateMenuItemImageUploadInput,
	TImageUploadResponse as TImageUploadResult,
} from "@/domain/types/upload.types";
import type { TNearbyRestaurant } from "@/repositories/restaurant.repository";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TMenuItemResponse, toMenuItemResponse } from "./menu-item.dto";
import { parseOrBadRequest } from "./parse";
import {
	type TImageUploadResponse,
	type TNearbyRestaurantResponse,
	type TQrCodeResponse,
	type TOwnerRestaurantResponse,
	type TRestaurantResponse,
	toImageUploadResponse,
	toNearbyRestaurantResponse,
	toQrCodeResponse,
	toOwnerRestaurantResponse,
	toRestaurantResponse,
} from "./restaurant.dto";

const _MAX_NAME = 120;
const _MAX_CUISINES = 10;
const _MAX_CUISINE = 40;
const _MAX_LINE = 200;
const _MAX_SHORT = 40;
const _MAX_CATEGORY = 60;
const _MAX_SLUG = 200;
const _DEFAULT_LIMIT = 50;
const _MAX_LIMIT = 100;
const _METERS_PER_KM = 1000;
const _DEFAULT_RADIUS_KM = 5;
const _MAX_RADIUS_KM = 25;
const _NEARBY_DEFAULT_LIMIT = 20;
const _NEARBY_MAX_LIMIT = 50;
const _MAX_DESCRIPTION = 500;
const _MAX_URL = 2048;

const _line = z.string().trim().min(1).max(_MAX_LINE);
const _short = z.string().trim().min(1).max(_MAX_SHORT);
const _name = z.string().trim().min(1).max(_MAX_NAME);
const _limit = z.coerce
	.number()
	.int()
	.min(1)
	.max(_MAX_LIMIT)
	.default(_DEFAULT_LIMIT);
const _offset = z.coerce.number().int().min(0).default(0);

const _addressSchema = z
	.object({
		line1: _line,
		line2: _line.nullable().optional(),
		city: _short,
		state: _short,
		zipcode: _short,
		phoneNumber: _short.nullable().optional(),
	})
	.strict();

/** Shared with `OrderTransformer`, for the order delivery-address snapshot. */
export const addressSchema = _addressSchema;

/** The order snapshot also keeps the address-book title (Home, Office). */
export const deliveryAddressSchema = _addressSchema.extend({
	label: _short.nullable().optional(),
});

/** `[longitude, latitude]`. */
const _coordinates = z.tuple([
	z.number().min(-180).max(180),
	z.number().min(-90).max(90),
]);
/** Cuisines are stored lowercase so filters match exactly. */
const _cuisines = z
	.array(z.string().trim().toLowerCase().min(1).max(_MAX_CUISINE))
	.min(1)
	.max(_MAX_CUISINES);
/** Nullable, optional text shown on the public page. */
const _description = z.string().trim().max(_MAX_DESCRIPTION).nullable();
/** Nullable, optional image URL (logo, banner, menu-item photo). */
const _imageUrl = z.string().url().max(_MAX_URL).nullable();

const _createRestaurantSchema = z
	.object({
		name: _name,
		cuisines: _cuisines,
		isPureVeg: z.boolean(),
		description: _description.optional(),
		logoUrl: _imageUrl.optional(),
		bannerUrl: _imageUrl.optional(),
		coordinates: _coordinates,
		address: _addressSchema,
	})
	.strict();

const _updateRestaurantSchema = z
	.object({
		name: _name.optional(),
		cuisines: _cuisines.optional(),
		isPureVeg: z.boolean().optional(),
		description: _description.optional(),
		logoUrl: _imageUrl.optional(),
		bannerUrl: _imageUrl.optional(),
		coordinates: _coordinates.optional(),
		address: _addressSchema.partial().optional(),
	})
	.strict();

const _listRestaurantsSchema = z.object({
	status: z.enum(RESTAURANT_STATUSES).optional(),
	limit: _limit,
	offset: _offset,
});

const _statusSchema = z
	.object({ status: z.enum(RESTAURANT_STATUSES) })
	.strict();

const _category = z.string().trim().min(1).max(_MAX_CATEGORY);
/** Integer paise: money is never a float. */
const _price = z.number().int().min(0);
const _foodType = z.enum(FOOD_TYPES);

const _createMenuItemSchema = z
	.object({
		name: _name,
		category: _category,
		description: _description.optional(),
		imageUrl: _imageUrl.optional(),
		priceInPaise: _price,
		foodType: _foodType,
		isAvailable: z.boolean().default(true),
	})
	.strict();

const _updateMenuItemSchema = z
	.object({
		name: _name.optional(),
		category: _category.optional(),
		description: _description.optional(),
		imageUrl: _imageUrl.optional(),
		priceInPaise: _price.optional(),
		foodType: _foodType.optional(),
		isAvailable: z.boolean().optional(),
	})
	.strict();

const _listMenuItemsSchema = z.object({
	category: _category.optional(),
	isAvailable: z
		.enum(["true", "false"])
		.transform((v) => v === "true")
		.optional(),
	limit: _limit,
	offset: _offset,
});

const _availabilitySchema = z.object({ isAvailable: z.boolean() }).strict();

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
		.pipe(z.number().int().min(1).max(_NEARBY_MAX_LIMIT))
		.default(String(_NEARBY_DEFAULT_LIMIT)),
});

const _slugSchema = z.string().trim().min(1).max(_MAX_SLUG);

const _createImageUploadSchema = z
	.object({
		kind: z.enum(UPLOAD_KINDS),
		contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
		size: z.number().int().positive(),
	})
	.strict()
	.refine((data) => data.size <= MAX_UPLOAD_BYTES[data.kind], {
		message: "size exceeds the limit for this kind",
		path: ["size"],
	});

const _createMenuItemImageUploadSchema = z
	.object({
		contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
		size: z.number().int().positive(),
	})
	.strict()
	.refine((data) => data.size <= MAX_UPLOAD_BYTES[UploadKind.MenuItem], {
		message: "size exceeds the limit for a menu item photo",
		path: ["size"],
	});

export type TRestaurantListResponse = {
	items: TOwnerRestaurantResponse[];
	total: number;
};
export type TMenuItemListResponse = {
	items: TMenuItemResponse[];
	total: number;
};

/**
 * Validates every restaurant and menu request and shapes the wire responses.
 * Menu items, status, nearby and slug lookups are extra methods on the same
 * class.
 */
@Injectable()
export class RestaurantTransformer {
	/** Body → create input (name, cuisines, isPureVeg, coordinates, address). */
	public toCreateRequestDTO(body: unknown): TCreateRestaurantInput {
		return parseOrBadRequest(_createRestaurantSchema, body);
	}

	/** Query → owner list input (`GET mine`). */
	public toListRequestDTO(query: unknown): TListRestaurantsInput {
		const data = parseOrBadRequest(_listRestaurantsSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.status ? { status: data.status } : {}),
		};
	}

	/** Body → partial update; empty body (or empty `address`) is 400. */
	public toUpdateRequestDTO(body: unknown): TUpdateRestaurantInput {
		const data = parseOrBadRequest(_updateRestaurantSchema, body);
		const input: TUpdateRestaurantInput = {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.cuisines !== undefined ? { cuisines: data.cuisines } : {}),
			...(data.isPureVeg !== undefined ? { isPureVeg: data.isPureVeg } : {}),
			...(data.description !== undefined
				? { description: data.description }
				: {}),
			...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
			...(data.bannerUrl !== undefined ? { bannerUrl: data.bannerUrl } : {}),
			...(data.coordinates !== undefined
				? { coordinates: data.coordinates }
				: {}),
			...(data.address !== undefined ? { address: data.address } : {}),
		};
		const addressEmpty =
			input.address !== undefined && Object.keys(input.address).length === 0;
		if (Object.keys(input).length === 0 || addressEmpty) {
			throw new BadRequestException("at least one field is required");
		}
		return input;
	}

	/** Body → new status. */
	public toStatusRequestDTO(body: unknown): {
		status: (typeof RESTAURANT_STATUSES)[number];
	} {
		return parseOrBadRequest(_statusSchema, body);
	}

	/** Row → wire DTO. */
	public toCreateResponseDTO(row: TRestaurant): TOwnerRestaurantResponse {
		return toOwnerRestaurantResponse(row);
	}

	/** Page → wire DTO. */
	public toListResponseDTO(page: TPage<TRestaurant>): TRestaurantListResponse {
		return {
			items: page.items.map(toOwnerRestaurantResponse),
			total: page.total,
		};
	}

	/** Row → wire DTO. */
	public toGetResponseDTO(row: TRestaurant): TOwnerRestaurantResponse {
		return toOwnerRestaurantResponse(row);
	}

	/** Row → wire DTO. */
	public toUpdateResponseDTO(row: TRestaurant): TOwnerRestaurantResponse {
		return toOwnerRestaurantResponse(row);
	}

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

	/** Items → public menu wire DTO (already sorted by category, then name). */
	public toGetMenuResponseDTO(items: TMenuItem[]): {
		items: TMenuItemResponse[];
	} {
		return { items: items.map(toMenuItemResponse) };
	}

	/** Body → create input; `isAvailable` defaults to true. */
	public toCreateMenuItemRequestDTO(body: unknown): TCreateMenuItemInput {
		return parseOrBadRequest(_createMenuItemSchema, body);
	}

	/** Query → menu-item list input. */
	public toListMenuItemsRequestDTO(query: unknown): TListMenuItemsInput {
		const data = parseOrBadRequest(_listMenuItemsSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.category ? { category: data.category } : {}),
			...(data.isAvailable !== undefined
				? { isAvailable: data.isAvailable }
				: {}),
		};
	}

	/** Body → partial menu-item update built by key presence; empty body is 400. */
	public toUpdateMenuItemRequestDTO(body: unknown): TUpdateMenuItemInput {
		const data = parseOrBadRequest(_updateMenuItemSchema, body);
		const input: TUpdateMenuItemInput = {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.category !== undefined ? { category: data.category } : {}),
			...(data.description !== undefined
				? { description: data.description }
				: {}),
			...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
			...(data.priceInPaise !== undefined
				? { priceInPaise: data.priceInPaise }
				: {}),
			...(data.foodType !== undefined ? { foodType: data.foodType } : {}),
			...(data.isAvailable !== undefined
				? { isAvailable: data.isAvailable }
				: {}),
		};
		if (Object.keys(input).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return input;
	}

	/** Body → availability flag. */
	public toAvailabilityRequestDTO(body: unknown): { isAvailable: boolean } {
		return parseOrBadRequest(_availabilitySchema, body);
	}

	/** Item → wire DTO. */
	public toMenuItemResponseDTO(item: TMenuItem): TMenuItemResponse {
		return toMenuItemResponse(item);
	}

	/** Page of items → wire DTO. */
	public toMenuItemListResponseDTO(
		page: TPage<TMenuItem>,
	): TMenuItemListResponse {
		return { items: page.items.map(toMenuItemResponse), total: page.total };
	}

	/** QR code payload → wire DTO. */
	public toQrCodeResponseDTO(data: TQrCodeResponse): TQrCodeResponse {
		return toQrCodeResponse(data);
	}

	/** Body → new-upload input; 400 for a disallowed kind, type, or oversize request. */
	public toCreateImageUploadRequestDTO(body: unknown): TCreateImageUploadInput {
		return parseOrBadRequest(_createImageUploadSchema, body);
	}

	/** Presigned-post payload → wire DTO. */
	public toCreateImageUploadResponseDTO(
		data: TImageUploadResult,
	): TImageUploadResponse {
		return toImageUploadResponse(data);
	}

	/** Row → wire DTO. */
	public toConfirmImageUploadResponseDTO(
		row: TRestaurant,
	): TOwnerRestaurantResponse {
		return toOwnerRestaurantResponse(row);
	}

	/** Body → new-upload input for a menu item's photo; 400 for a disallowed type or oversize request. */
	public toCreateMenuItemImageUploadRequestDTO(
		body: unknown,
	): TCreateMenuItemImageUploadInput {
		return parseOrBadRequest(_createMenuItemImageUploadSchema, body);
	}

	/** Presigned-post payload → wire DTO. */
	public toCreateMenuItemImageUploadResponseDTO(
		data: TImageUploadResult,
	): TImageUploadResponse {
		return toImageUploadResponse(data);
	}

	/** Item → wire DTO. */
	public toConfirmMenuItemImageUploadResponseDTO(
		item: TMenuItem,
	): TMenuItemResponse {
		return toMenuItemResponse(item);
	}
}
