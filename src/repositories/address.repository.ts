import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import { isUuid } from "@/repositories/repository.utils";
import { addresses, type TAddress } from "@db/schemas/address.schema";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

export type TCreateAddressInput = {
	line1: string;
	line2?: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber?: string | null;
};

export type TUpdateAddressInput = Partial<TCreateAddressInput>;

/** Data access for `addresses`. Ownership is enforced through the restaurant. */
@LogClass()
@Injectable()
export class AddressRepository {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
	) {}

	/** Inserts an address. */
	public async create(input: TCreateAddressInput): Promise<TAddress> {
		const [row] = await this._databaseService.db
			.insert(addresses)
			.values(input)
			.returning();
		return row;
	}

	/** Null when missing or the id is malformed. */
	public async findById(id: string): Promise<TAddress | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.select()
			.from(addresses)
			.where(eq(addresses.id, id));
		return row ?? null;
	}

	/** Applies only the keys present in `patch`; null when missing. */
	public async update(
		id: string,
		patch: TUpdateAddressInput,
	): Promise<TAddress | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.update(addresses)
			.set(patch)
			.where(eq(addresses.id, id))
			.returning();
		return row ?? null;
	}

	/** True when an address was deleted. */
	public async delete(id: string): Promise<boolean> {
		if (!isUuid(id)) {
			return false;
		}
		const rows = await this._databaseService.db
			.delete(addresses)
			.where(eq(addresses.id, id))
			.returning({ id: addresses.id });
		return rows.length === 1;
	}
}
