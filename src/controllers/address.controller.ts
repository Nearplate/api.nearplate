import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { AddressService } from "@/services/address.service";
import type { TAddressResponse } from "@/transformers/address.dto";
import { AddressTransformer } from "@/transformers/address.transformer";
import type { TAuthUser } from "@/types/auth-user";
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	Patch,
	Post,
} from "@nestjs/common";

/** The caller's own address book. */
@LogClass()
@Roles(AuthRole.User)
@Controller("users/me/addresses")
export class AddressController {
	constructor(
		@Inject(AddressTransformer)
		private readonly _addressTransformer: AddressTransformer,
		@Inject(AddressService)
		private readonly _addressService: AddressService,
	) {}

	/** The caller's addresses, default first. */
	@Get()
	public async list(@AuthUser() user: TAuthUser): Promise<TAddressResponse[]> {
		const addresses = await this._addressService.list(user.id);
		return this._addressTransformer.toAddressListResponseDTO(addresses);
	}

	/** Adds an address; the first one becomes the default automatically. */
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TAddressResponse> {
		const input = this._addressTransformer.toCreateRequestDTO(body);
		const address = await this._addressService.create(user.id, input);
		return this._addressTransformer.toAddressResponseDTO(address);
	}

	/** Updates one of the caller's addresses. */
	@Patch(":id")
	public async update(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TAddressResponse> {
		const patch = this._addressTransformer.toUpdateRequestDTO(body);
		const address = await this._addressService.update(user.id, id, patch);
		return this._addressTransformer.toAddressResponseDTO(address);
	}

	/** Deletes one of the caller's addresses. */
	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async remove(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._addressService.remove(user.id, id);
	}
}
