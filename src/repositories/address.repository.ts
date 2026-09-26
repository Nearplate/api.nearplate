import { LogClass } from "@/app/modules/logger";
import {
	Address,
	type AddressDocument,
	type TAddress,
} from "@db/schemas/address.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { type Model, isValidObjectId } from "mongoose";

export type TCreateAddressInput = {
	line1: string;
	line2?: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber?: string | null;
};

export type TUpdateAddressInput = Partial<TCreateAddressInput>;

export type TLeanAddress = Omit<TAddress, "id"> & {
	_id: { toString(): string };
};

/** Maps a lean address (also the populated one inside a restaurant) to `TAddress`. */
export function toAddressRow(row: TLeanAddress): TAddress {
	const { _id, ...rest } = row;
	return { id: _id.toString(), ...rest };
}

/** Data access for `addresses`. Ownership is enforced through the restaurant. */
@LogClass()
@Injectable()
export class AddressRepository {
	constructor(
		@InjectModel(Address.name)
		private readonly _model: Model<AddressDocument>,
	) {}

	/** Inserts an address. */
	public async create(input: TCreateAddressInput): Promise<TAddress> {
		const doc = await this._model.create(input);
		return toAddressRow(doc.toObject() as unknown as TLeanAddress);
	}

	/** Null when missing or the id is malformed. */
	public async findById(id: string): Promise<TAddress | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model.findById(id).lean<TLeanAddress>();
		return row ? toAddressRow(row) : null;
	}

	/** Applies only the keys present in `patch`; null when missing. */
	public async update(
		id: string,
		patch: TUpdateAddressInput,
	): Promise<TAddress | null> {
		if (!isValidObjectId(id)) {
			return null;
		}
		const row = await this._model
			.findByIdAndUpdate(id, { $set: patch }, { new: true })
			.lean<TLeanAddress>();
		return row ? toAddressRow(row) : null;
	}

	/** True when an address was deleted. */
	public async delete(id: string): Promise<boolean> {
		if (!isValidObjectId(id)) {
			return false;
		}
		const result = await this._model.deleteOne({ _id: id });
		return result.deletedCount === 1;
	}
}
