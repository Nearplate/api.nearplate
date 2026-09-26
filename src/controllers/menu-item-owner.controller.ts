import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import type { ICRUDController } from "@/domain/interfaces/crud.interface";
import { MenuItemService } from "@/services/menu-item.service";
import type { TMenuItemResponse } from "@/transformers/menu-item.dto";
import {
	MenuItemOwnerTransformer,
	type TMenuItemListResponse,
} from "@/transformers/menu-item-owner.transformer";
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
	Query,
} from "@nestjs/common";

/** A restaurant owner's menu items. `restaurant` accounts only. */
@LogClass()
@Roles(AuthRole.Restaurant)
@Controller("owner/menu-items")
export class MenuItemOwnerController implements ICRUDController<
	TMenuItemResponse,
	TMenuItemListResponse
> {
	constructor(
		@Inject(MenuItemOwnerTransformer)
		private readonly _menuItemOwnerTransformer: MenuItemOwnerTransformer,
		@Inject(MenuItemService)
		private readonly _menuItemService: MenuItemService,
	) {}

	/** Creates an item on one of the caller's restaurants. */
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const input = this._menuItemOwnerTransformer.toCreateRequestDTO(body);
		const item = await this._menuItemService.create(user.id, input);
		return this._menuItemOwnerTransformer.toCreateResponseDTO(item);
	}

	/** Lists the caller's items, optionally filtered. */
	@Get()
	public async list(
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemListResponse> {
		const input = this._menuItemOwnerTransformer.toListRequestDTO(query);
		const page = await this._menuItemService.list(user.id, input);
		return this._menuItemOwnerTransformer.toListResponseDTO(page);
	}

	/** Fetches one item. */
	@Get(":id")
	public async get(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const item = await this._menuItemService.get(user.id, id);
		return this._menuItemOwnerTransformer.toGetResponseDTO(item);
	}

	/** Partially updates an item. */
	@Patch(":id")
	public async update(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const input = this._menuItemOwnerTransformer.toUpdateRequestDTO(body);
		const item = await this._menuItemService.update(user.id, id, input);
		return this._menuItemOwnerTransformer.toUpdateResponseDTO(item);
	}

	/** Marks an item available or sold out. */
	@Patch(":id/availability")
	public async setAvailability(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TMenuItemResponse> {
		const { isAvailable } =
			this._menuItemOwnerTransformer.toAvailabilityRequestDTO(body);
		const item = await this._menuItemService.setAvailability(
			user.id,
			id,
			isAvailable,
		);
		return this._menuItemOwnerTransformer.toUpdateResponseDTO(item);
	}

	/** Deletes an item. */
	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async remove(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._menuItemService.remove(user.id, id);
	}
}
