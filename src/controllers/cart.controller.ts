import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { CartService } from "@/services/cart.service";
import {
	CartTransformer,
	type TCartListResponse,
} from "@/transformers/cart.transformer";
import type { TCartResponse } from "@/transformers/cart.dto";
import type { TOrderResponse } from "@/transformers/order.dto";
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

/**
 * A signed-in customer's carts, one per restaurant. Identified by
 * `restaurantId` in the path, never by cart id, so a cart id is never on
 * the wire. Every route needs the `user` role, so `@Roles` sits on the class.
 */
@LogClass()
@Roles(AuthRole.User)
@Controller("carts")
export class CartController {
	constructor(
		@Inject(CartTransformer)
		private readonly _cartTransformer: CartTransformer,
		@Inject(CartService)
		private readonly _cartService: CartService,
	) {}

	/** All of the caller's carts, most recently touched first. */
	@Get()
	public async list(@AuthUser() user: TAuthUser): Promise<TCartListResponse> {
		const carts = await this._cartService.list(user.id);
		return this._cartTransformer.toCartListResponseDTO(carts);
	}

	/**
	 * Folds guest carts from the browser into the caller's server carts. Declared
	 * before the `:restaurantId` routes so `merge` is never read as an id.
	 */
	@Post("merge")
	@HttpCode(HttpStatus.OK)
	public async merge(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TCartListResponse> {
		const input = this._cartTransformer.toMergeRequestDTO(body);
		const carts = await this._cartService.merge(user.id, input);
		return this._cartTransformer.toCartListResponseDTO(carts);
	}

	/** The caller's cart for one restaurant. */
	@Get(":restaurantId")
	public async get(
		@Param("restaurantId") restaurantId: string,
		@AuthUser() user: TAuthUser,
	): Promise<TCartResponse> {
		const cart = await this._cartService.get(user.id, restaurantId);
		return this._cartTransformer.toCartResponseDTO(cart);
	}

	/** Adds an item, creating the cart if it does not exist yet. */
	@Post(":restaurantId/items")
	public async addItem(
		@Param("restaurantId") restaurantId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TCartResponse> {
		const input = this._cartTransformer.toAddItemRequestDTO(body);
		const cart = await this._cartService.addItem(user.id, restaurantId, input);
		return this._cartTransformer.toCartResponseDTO(cart);
	}

	/** Sets a line's quantity outright. */
	@Patch(":restaurantId/items/:menuItemId")
	public async updateItem(
		@Param("restaurantId") restaurantId: string,
		@Param("menuItemId") menuItemId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TCartResponse> {
		const input = this._cartTransformer.toUpdateItemRequestDTO(body);
		const cart = await this._cartService.updateItem(
			user.id,
			restaurantId,
			menuItemId,
			input,
		);
		return this._cartTransformer.toCartResponseDTO(cart);
	}

	/** Removes a line; removing the last one deletes the cart. */
	@Delete(":restaurantId/items/:menuItemId")
	public async removeItem(
		@Param("restaurantId") restaurantId: string,
		@Param("menuItemId") menuItemId: string,
		@AuthUser() user: TAuthUser,
	): Promise<TCartResponse> {
		const cart = await this._cartService.removeItem(
			user.id,
			restaurantId,
			menuItemId,
		);
		return this._cartTransformer.toCartResponseDTO(cart);
	}

	/** Clears the cart outright. */
	@Delete(":restaurantId")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async clear(
		@Param("restaurantId") restaurantId: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._cartService.clear(user.id, restaurantId);
	}

	/** Turns the cart into an order and deletes it. */
	@Post(":restaurantId/checkout")
	@HttpCode(HttpStatus.CREATED)
	public async checkout(
		@Param("restaurantId") restaurantId: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TOrderResponse> {
		const input = this._cartTransformer.toCheckoutRequestDTO(body);
		const order = await this._cartService.checkout(
			user.id,
			restaurantId,
			input,
		);
		return this._cartTransformer.toOrderResponseDTO(order);
	}
}
