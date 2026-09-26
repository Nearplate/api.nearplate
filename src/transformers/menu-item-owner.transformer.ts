import { FOOD_TYPES } from "@/domain/enums/food-type";
import type {
	ICRUDTransformer,
	TPage,
} from "@/domain/interfaces/crud.interface";
import type {
	TCreateMenuItemInput,
	TListMenuItemsInput,
	TUpdateMenuItemInput,
} from "@/domain/types/menu-item.types";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TMenuItemResponse, toMenuItemResponse } from "./menu-item.dto";
import { parseOrBadRequest } from "./parse";

const _MAX_NAME = 120;
const _MAX_CATEGORY = 60;
const _DEFAULT_LIMIT = 50;
const _MAX_LIMIT = 100;
const _OBJECT_ID = /^[a-f0-9]{24}$/;

const _restaurantId = z.string().regex(_OBJECT_ID);
const _name = z.string().trim().min(1).max(_MAX_NAME);
const _category = z.string().trim().min(1).max(_MAX_CATEGORY);
/** Integer paise: money is never a float. */
const _price = z.number().int().min(0);
const _foodType = z.enum(FOOD_TYPES);

const _createSchema = z
	.object({
		restaurantId: _restaurantId,
		name: _name,
		category: _category,
		priceInPaise: _price,
		foodType: _foodType,
		isAvailable: z.boolean().default(true),
	})
	.strict();

const _updateSchema = z
	.object({
		name: _name.optional(),
		category: _category.optional(),
		priceInPaise: _price.optional(),
		foodType: _foodType.optional(),
		isAvailable: z.boolean().optional(),
	})
	.strict();

const _listSchema = z.object({
	restaurantId: _restaurantId.optional(),
	category: _category.optional(),
	isAvailable: z
		.enum(["true", "false"])
		.transform((v) => v === "true")
		.optional(),
	limit: z.coerce.number().int().min(1).max(_MAX_LIMIT).default(_DEFAULT_LIMIT),
	offset: z.coerce.number().int().min(0).default(0),
});

const _availabilitySchema = z.object({ isAvailable: z.boolean() }).strict();

export type TMenuItemListResponse = {
	items: TMenuItemResponse[];
	total: number;
};

/** Validates owner menu-item requests and shapes the wire responses. */
@Injectable()
export class MenuItemOwnerTransformer implements ICRUDTransformer<
	TMenuItem,
	TCreateMenuItemInput,
	TUpdateMenuItemInput,
	TListMenuItemsInput,
	TMenuItemResponse,
	TMenuItemListResponse
> {
	/** Body → create input; `isAvailable` defaults to true. */
	public toCreateRequestDTO(body: unknown): TCreateMenuItemInput {
		return parseOrBadRequest(_createSchema, body);
	}

	/** Query → list input. */
	public toListRequestDTO(query: unknown): TListMenuItemsInput {
		const data = parseOrBadRequest(_listSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.restaurantId ? { restaurantId: data.restaurantId } : {}),
			...(data.category ? { category: data.category } : {}),
			...(data.isAvailable !== undefined
				? { isAvailable: data.isAvailable }
				: {}),
		};
	}

	/** Body → partial update built by key presence; empty body is 400. */
	public toUpdateRequestDTO(body: unknown): TUpdateMenuItemInput {
		const data = parseOrBadRequest(_updateSchema, body);
		const input: TUpdateMenuItemInput = {
			...(data.name !== undefined ? { name: data.name } : {}),
			...(data.category !== undefined ? { category: data.category } : {}),
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

	/** Row → wire DTO. */
	public toCreateResponseDTO(row: TMenuItem): TMenuItemResponse {
		return toMenuItemResponse(row);
	}

	/** Page → wire DTO. */
	public toListResponseDTO(page: TPage<TMenuItem>): TMenuItemListResponse {
		return { items: page.items.map(toMenuItemResponse), total: page.total };
	}

	/** Row → wire DTO. */
	public toGetResponseDTO(row: TMenuItem): TMenuItemResponse {
		return toMenuItemResponse(row);
	}

	/** Row → wire DTO. */
	public toUpdateResponseDTO(row: TMenuItem): TMenuItemResponse {
		return toMenuItemResponse(row);
	}
}
