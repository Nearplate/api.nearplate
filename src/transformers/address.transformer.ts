import type { TAddress } from "@db/schemas/address.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TAddressResponse, toAddressResponse } from "./address.dto";
import { parseOrBadRequest } from "./parse";
import { addressSchema } from "./restaurant.transformer";

const _MAX_LABEL = 30;

const _MAX_LAT = 90;
const _MAX_LNG = 180;
/** Optional `+91`/`91`/`0` prefix, then 10 digits starting 6-9 (captured). */
const _INDIAN_MOBILE = /^(?:\+91|91|0)?([6-9][0-9]{9})$/;

const _label = z.string().trim().min(1).max(_MAX_LABEL);
const _lat = z.number().min(-_MAX_LAT).max(_MAX_LAT);
const _lng = z.number().min(-_MAX_LNG).max(_MAX_LNG);

/** Indian mobile in any common form; normalised to `+91XXXXXXXXXX`. */
const _indianMobile = z
	.string()
	.trim()
	.transform((value, ctx) => {
		const match = _INDIAN_MOBILE.exec(value.replace(/[\s-]/g, ""));
		if (!match) {
			ctx.addIssue({
				code: "custom",
				message: "enter a valid 10-digit Indian mobile number",
			});
			return z.NEVER;
		}
		return `+91${match[1]}`;
	});

/** Address-book entries: mandatory phone, optional map pin. */
const _userAddressSchema = addressSchema.extend({
	phoneNumber: _indianMobile,
	lat: _lat.nullable().optional(),
	lng: _lng.nullable().optional(),
});

const _createAddressSchema = _userAddressSchema.extend({
	label: _label,
	isDefault: z.boolean().optional(),
});

const _updateAddressSchema = _userAddressSchema
	.partial()
	.extend({ label: _label.optional(), isDefault: z.boolean().optional() })
	.strict();

export type TCreateAddressRequest = z.infer<typeof _createAddressSchema>;
export type TUpdateAddressRequest = z.infer<typeof _updateAddressSchema>;

/** Validates address-book request bodies and shapes the wire response. */
@Injectable()
export class AddressTransformer {
	/** Body → create input. */
	public toCreateRequestDTO(body: unknown): TCreateAddressRequest {
		return parseOrBadRequest(_createAddressSchema, body);
	}

	/** Body → patch, built by key presence; empty body is 400. */
	public toUpdateRequestDTO(body: unknown): TUpdateAddressRequest {
		const data = parseOrBadRequest(_updateAddressSchema, body);
		if (Object.keys(data).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return data;
	}

	/** Row → wire DTO (drops `userId`). */
	public toAddressResponseDTO(row: TAddress): TAddressResponse {
		return toAddressResponse(row);
	}

	/** Rows → wire DTOs, default first (already ordered by the repository). */
	public toAddressListResponseDTO(rows: TAddress[]): TAddressResponse[] {
		return rows.map(toAddressResponse);
	}
}
