import type { TAddress } from "@db/schemas/address.schema";
import { z } from "zod";

const _date = z.coerce.date().transform((d) => d.toISOString());

/** Wire shape of one address-book entry. `userId` is never exposed. */
const _addressSchema = z.object({
	id: z.string(),
	label: z.string().nullable(),
	isDefault: z.boolean(),
	line1: z.string(),
	line2: z.string().nullable(),
	city: z.string(),
	state: z.string(),
	zipcode: z.string(),
	phoneNumber: z.string().nullable(),
	lat: z.number().nullable(),
	lng: z.number().nullable(),
	createdAt: _date,
	updatedAt: _date,
});

export type TAddressResponse = z.infer<typeof _addressSchema>;

/** Row → wire DTO. */
export function toAddressResponse(row: TAddress): TAddressResponse {
	return _addressSchema.parse(row);
}
