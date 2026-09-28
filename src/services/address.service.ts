import { DatabaseService } from "@/app/modules/database";
import { LogClass } from "@/app/modules/logger";
import {
	AddressRepository,
	type TCreateUserAddressInput,
	type TUpdateUserAddressInput,
} from "@/repositories/address.repository";
import type { TAddress } from "@db/schemas/address.schema";
import {
	BadRequestException,
	Inject,
	Injectable,
	NotFoundException,
} from "@nestjs/common";

const _MAX_ADDRESSES = 20;

export type TCreateAddressInput = Omit<
	TCreateUserAddressInput,
	"userId" | "isDefault"
> & { isDefault?: boolean };
export type TUpdateAddressInput = TUpdateUserAddressInput;

/**
 * The caller's address book. Exactly one address is default at a time; the
 * first address a user adds becomes it automatically. Another user's
 * address is a 404, enforced by the repository filter.
 */
@LogClass()
@Injectable()
export class AddressService {
	constructor(
		@Inject(DatabaseService)
		private readonly _databaseService: DatabaseService,
		@Inject(AddressRepository)
		private readonly _addressRepository: AddressRepository,
	) {}

	/** The caller's addresses, default first. */
	public async list(userId: string): Promise<TAddress[]> {
		return this._addressRepository.listForUser(userId);
	}

	/**
	 * Adds an address. The first one is always the default; a later one only
	 * if `isDefault` is requested (clearing the previous default first).
	 */
	public async create(
		userId: string,
		input: TCreateAddressInput,
	): Promise<TAddress> {
		return this._databaseService.transaction(async () => {
			const existing = await this._addressRepository.countForUser(userId);
			if (existing >= _MAX_ADDRESSES) {
				throw new BadRequestException("address book is full");
			}
			const isDefault = existing === 0 || input.isDefault === true;
			if (isDefault && existing > 0) {
				await this._addressRepository.clearDefaultForUser(userId);
			}
			return this._addressRepository.createForUser({
				...input,
				userId,
				isDefault,
			});
		});
	}

	/** Updates an address; setting `isDefault: true` clears the previous one. */
	public async update(
		userId: string,
		id: string,
		patch: TUpdateAddressInput,
	): Promise<TAddress> {
		return this._databaseService.transaction(async () => {
			if (patch.isDefault === true) {
				await this._addressRepository.clearDefaultForUser(userId, id);
			}
			const updated = await this._addressRepository.updateForUser(
				userId,
				id,
				patch,
			);
			if (!updated) {
				throw new NotFoundException();
			}
			return updated;
		});
	}

	/** Deletes an address; promotes the newest remaining one if it was default. */
	public async remove(userId: string, id: string): Promise<void> {
		await this._databaseService.transaction(async () => {
			const address = await this._addressRepository.findForUser(userId, id);
			if (!address) {
				throw new NotFoundException();
			}
			await this._addressRepository.deleteForUser(userId, id);
			if (address.isDefault) {
				await this._addressRepository.promoteNewestForUser(userId);
			}
		});
	}
}
