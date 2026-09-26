import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import type { ICRUDController } from "@/domain/interfaces/crud.interface";
import { TodoService } from "@/services/todo.service";
import {
	type TTodoListResponse,
	type TTodoResponse,
	TodoTransformer,
} from "@/transformers/todo.transformer";
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

/** Owner-scoped todo CRUD. Guests are excluded. */
@LogClass()
@Roles(AuthRole.Admin, AuthRole.Restaurant, AuthRole.User)
@Controller("todos")
export class TodoController implements ICRUDController<
	TTodoResponse,
	TTodoListResponse
> {
	constructor(
		@Inject(TodoTransformer)
		private readonly _transformer: TodoTransformer,
		@Inject(TodoService)
		private readonly _service: TodoService,
	) {}

	/** Creates a todo. */
	@Post()
	@HttpCode(HttpStatus.CREATED)
	public async create(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TTodoResponse> {
		const input = this._transformer.toCreateRequestDTO(body);
		const todo = await this._service.create(user.id, input);
		return this._transformer.toCreateResponseDTO(todo);
	}

	/** Lists the caller's todos. */
	@Get()
	public async list(
		@Query() query: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TTodoListResponse> {
		const input = this._transformer.toListRequestDTO(query);
		const result = await this._service.list(user.id, input);
		return this._transformer.toListResponseDTO(result);
	}

	/** Fetches one todo. */
	@Get(":id")
	public async get(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TTodoResponse> {
		const todo = await this._service.get(user.id, id);
		return this._transformer.toGetResponseDTO(todo);
	}

	/** Partially updates a todo. */
	@Patch(":id")
	public async update(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TTodoResponse> {
		const input = this._transformer.toUpdateRequestDTO(body);
		const todo = await this._service.update(user.id, id, input);
		return this._transformer.toUpdateResponseDTO(todo);
	}

	/** Deletes a todo. */
	@Delete(":id")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async remove(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		await this._service.remove(user.id, id);
	}
}
