import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { OrderService } from "@/services/order.service";
import type { TOrderResponse } from "@/transformers/order.dto";
import {
	OrderTransformer,
	type TCustomerOrderListResponse,
} from "@/transformers/order.transformer";
import type { TAuthUser } from "@/types/auth-user";
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	Post,
	Query,
} from "@nestjs/common";

/**
 * Customer-facing orders: placing an order and viewing the caller's own.
 * Owner-facing order routes (list for a restaurant, advance status) live on
 * `RestaurantController` instead, next to the rest of the owner surface.
 */
@LogClass()
@Controller("orders")
export class OrderController {
	constructor(
		@Inject(OrderTransformer)
		private readonly _orderTransformer: OrderTransformer,
		@Inject(OrderService)
		private readonly _orderService: OrderService,
	) {}

	/** Places an order against one restaurant. */
	@Roles(AuthRole.User)
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TOrderResponse> {
		const input = this._orderTransformer.toCreateRequestDTO(body);
		const order = await this._orderService.place(user.id, input);
		return this._orderTransformer.toOrderResponseDTO(order);
	}

	/** The caller's own orders, newest first, each with its restaurant's name. */
	@Roles(AuthRole.User)
	@Get("mine")
	public async list(
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TCustomerOrderListResponse> {
		const input = this._orderTransformer.toListRequestDTO(query);
		const page = await this._orderService.listForUser(user.id, input);
		return this._orderTransformer.toCustomerOrderListResponseDTO(page);
	}

	/** One of the caller's own orders, with its items. */
	@Roles(AuthRole.User)
	@Get(":id")
	public async get(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TOrderResponse> {
		const order = await this._orderService.getForUser(user.id, id);
		return this._orderTransformer.toOrderResponseDTO(order);
	}
}
