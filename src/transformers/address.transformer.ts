import type { TAddress } from "@db/schemas/address.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";
import { type TAddressResponse, toAddressResponse } from "./address.dto";
import { parseOrBadRequest } from "./parse";
import { addressSchema } from "./restaurant.transformer";

const _MAX_LABEL = 30;

const _label = z.string().trim().min(1).max(_MAX_LABEL);

const _createAddressSchema = addressSchema.extend({
	label: _label,
	isDefault: z.boolean().optional(),
});

const _updateAddressSchema = addressSchema
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
