import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import { isUuid } from "@/repositories/repository.utils";
import { addresses, type TAddress } from "@db/schemas/address.schema";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, ne } from "drizzle-orm";

export type TCreateAddressInput = {
	line1: string;
	line2?: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber?: string | null;
	lat?: number | null;
	lng?: number | null;
};

export type TUpdateAddressInput = Partial<TCreateAddressInput>;

export type TCreateUserAddressInput = TCreateAddressInput & {
	userId: string;
	label: string;
	isDefault: boolean;
};

export type TUpdateUserAddressInput = Partial<
	TCreateAddressInput & { label: string; isDefault: boolean }
>;

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

	/** Inserts an address book entry for a user. */
	public async createForUser(
		input: TCreateUserAddressInput,
	): Promise<TAddress> {
		const [row] = await this._databaseService.db
			.insert(addresses)
			.values(input)
			.returning();
		return row;
	}

	/** A user's addresses, default first, then newest. */
	public async listForUser(userId: string): Promise<TAddress[]> {
		return this._databaseService.db
			.select()
			.from(addresses)
			.where(eq(addresses.userId, userId))
			.orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
	}

	/** How many addresses a user has, for the address-book cap. */
	public async countForUser(userId: string): Promise<number> {
		const [row] = await this._databaseService.db
			.select({ value: count() })
			.from(addresses)
			.where(eq(addresses.userId, userId));
		return row?.value ?? 0;
	}

	/** Null when missing or not owned by `userId`. */
	public async findForUser(
		userId: string,
		id: string,
	): Promise<TAddress | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.select()
			.from(addresses)
			.where(and(eq(addresses.id, id), eq(addresses.userId, userId)));
		return row ?? null;
	}

	/** Applies only the keys present in `patch`; null when missing or not owned. */
	public async updateForUser(
		userId: string,
		id: string,
		patch: TUpdateUserAddressInput,
	): Promise<TAddress | null> {
		if (!isUuid(id)) {
			return null;
		}
		const [row] = await this._databaseService.db
			.update(addresses)
			.set(patch)
			.where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
			.returning();
		return row ?? null;
	}

	/** True when an address owned by `userId` was deleted. */
	public async deleteForUser(userId: string, id: string): Promise<boolean> {
		if (!isUuid(id)) {
			return false;
		}
		const rows = await this._databaseService.db
			.delete(addresses)
			.where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
			.returning({ id: addresses.id });
		return rows.length === 1;
	}

	/**
	 * Unsets the current default (if any) so a new one can be set without
	 * violating the partial unique index. Excludes `exceptId` so re-marking
	 * the same address default is a no-op.
	 */
	public async clearDefaultForUser(
		userId: string,
		exceptId?: string,
	): Promise<void> {
		await this._databaseService.db
			.update(addresses)
			.set({ isDefault: false })
			.where(
				and(
					eq(addresses.userId, userId),
					eq(addresses.isDefault, true),
					exceptId ? ne(addresses.id, exceptId) : undefined,
				),
			);
	}

	/**
	 * Promotes the newest remaining address to default, e.g. after deleting
	 * the previous default. No-op when the user has no addresses left.
	 */
	public async promoteNewestForUser(userId: string): Promise<void> {
		const [newest] = await this._databaseService.db
			.select({ id: addresses.id })
			.from(addresses)
			.where(eq(addresses.userId, userId))
			.orderBy(desc(addresses.createdAt))
			.limit(1);
		if (!newest) {
			return;
		}
		await this._databaseService.db
			.update(addresses)
			.set({ isDefault: true })
			.where(eq(addresses.id, newest.id));
	}
}
