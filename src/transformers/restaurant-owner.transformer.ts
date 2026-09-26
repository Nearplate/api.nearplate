import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";
import type {
	ICRUDTransformer,
	TPage,
} from "@/domain/interfaces/crud.interface";
import type {
	TCreateRestaurantInput,
	TListRestaurantsInput,
	TUpdateRestaurantInput,
} from "@/domain/types/restaurant.types";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { parseOrBadRequest } from "./parse";
import {
	type TRestaurantResponse,
	toRestaurantResponse,
} from "./restaurant.dto";

const _MAX_NAME = 120;
const _MAX_CUISINES = 10;
const _MAX_CUISINE = 40;
const _MAX_LINE = 200;
const _MAX_SHORT = 40;
const _DEFAULT_LIMIT = 50;
const _MAX_LIMIT = 100;

const _line = z.string().trim().min(1).max(_MAX_LINE);
const _short = z.string().trim().min(1).max(_MAX_SHORT);

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
const _name = z.string().trim().min(1).max(_MAX_NAME);

const _createSchema = z
	.object({
		name: _name,
		cuisines: _cuisines,
		isPureVeg: z.boolean(),
		coordinates: _coordinates,
		address: _addressSchema,
	})
	.strict();

const _updateSchema = z
	.object({
		name: _name.optional(),
		cuisines: _cuisines.optional(),
		isPureVeg: z.boolean().optional(),
		coordinates: _coordinates.optional(),
		address: _addressSchema.partial().optional(),
	})
	.strict();

const _listSchema = z.object({
	status: z.enum(RESTAURANT_STATUSES).optional(),
	limit: z.coerce.number().int().min(1).max(_MAX_LIMIT).default(_DEFAULT_LIMIT),
	offset: z.coerce.number().int().min(0).default(0),
});

const _statusSchema = z
	.object({ status: z.enum(RESTAURANT_STATUSES) })
	.strict();

export type TRestaurantListResponse = {
	items: TRestaurantResponse[];
	total: number;
};

/** Validates owner restaurant requests and shapes the wire responses. */
@Injectable()
export class RestaurantOwnerTransformer implements ICRUDTransformer<
	TRestaurant,
	TCreateRestaurantInput,
	TUpdateRestaurantInput,
	TListRestaurantsInput,
	TRestaurantResponse,
	TRestaurantListResponse
> {
	/** Body → create input (legacy shape: name, cuisines, isPureVeg, coordinates, address). */
	public toCreateRequestDTO(body: unknown): TCreateRestaurantInput {
		return parseOrBadRequest(_createSchema, body);
	}

	/** Query → list input. */
	public toListRequestDTO(query: unknown): TListRestaurantsInput {
		const data = parseOrBadRequest(_listSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.status ? { status: data.status } : {}),
		};
	}

	/** Body → partial update; empty body (or empty `address`) is 400. */
	public toUpdateRequestDTO(body: unknown): TUpdateRestaurantInput {
		const data = parseOrBadRequest(_updateSchema, body);
		const input: TUpdateRestaurantInput = {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.cuisines !== undefined ? { cuisines: data.cuisines } : {}),
			...(data.isPureVeg !== undefined ? { isPureVeg: data.isPureVeg } : {}),
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
	public toCreateResponseDTO(row: TRestaurant): TRestaurantResponse {
		return toRestaurantResponse(row);
	}

	/** Page → wire DTO. */
	public toListResponseDTO(page: TPage<TRestaurant>): TRestaurantListResponse {
		return { items: page.items.map(toRestaurantResponse), total: page.total };
	}

	/** Row → wire DTO. */
	public toGetResponseDTO(row: TRestaurant): TRestaurantResponse {
		return toRestaurantResponse(row);
	}

	/** Row → wire DTO. */
	public toUpdateResponseDTO(row: TRestaurant): TRestaurantResponse {
		return toRestaurantResponse(row);
	}
}
