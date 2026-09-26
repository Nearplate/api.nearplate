import { LogClass } from "@/app/modules/logger";
import type { TConfig } from "@/app/modules/config";
import {
	type TCreateTodoInput,
	type TListTodosInput,
	type TUpdateTodoInput,
	TodoRepository,
} from "@/repositories/todo.repository";
import type { ICRUDService, TPage } from "@/domain/interfaces/crud.interface";
import type { TTodo } from "@db/schemas/todo.schema";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const _MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Todo business logic. A todo that is missing or not the caller's is a 404. */
@LogClass()
@Injectable()
export class TodoService implements ICRUDService<
	TTodo,
	TCreateTodoInput,
	TUpdateTodoInput,
	TListTodosInput
> {
	constructor(
		@Inject(TodoRepository)
		private readonly _todoRepository: TodoRepository,
		@Inject(ConfigService)
		private readonly _configService: ConfigService<TConfig>,
	) {}

	/** Creates a todo owned by `ownerId`. */
	public create(ownerId: string, input: TCreateTodoInput): Promise<TTodo> {
		return this._todoRepository.create(ownerId, input);
	}

	/** Lists the caller's todos. */
	public list(ownerId: string, input: TListTodosInput): Promise<TPage<TTodo>> {
		return this._todoRepository.list(ownerId, input);
	}

	/** Returns the caller's todo or throws 404. */
	public async get(ownerId: string, id: string): Promise<TTodo> {
		const todo = await this._todoRepository.findById(ownerId, id);
		return this._orNotFound(todo);
	}

	/** Updates the caller's todo or throws 404. */
	public async update(
		ownerId: string,
		id: string,
		input: TUpdateTodoInput,
	): Promise<TTodo> {
		const todo = await this._todoRepository.update(ownerId, id, input);
		return this._orNotFound(todo);
	}

	/** Deletes the caller's todo or throws 404. */
	public async remove(ownerId: string, id: string): Promise<void> {
		const deleted = await this._todoRepository.delete(ownerId, id);
		if (!deleted) {
			throw new NotFoundException();
		}
	}

	/**
	 * Cron entrypoint: deletes completed todos untouched for
	 * `TODO_CLEANUP_AFTER_DAYS`. Idempotent, so overlapping runs are harmless.
	 */
	public purgeCompleted(): Promise<number> {
		const days = this._configService.getOrThrow<number>(
			"TODO_CLEANUP_AFTER_DAYS",
		);
		return this._todoRepository.deleteCompletedBefore(
			new Date(Date.now() - days * _MS_PER_DAY),
		);
	}

	/** Throws 404 for null. */
	private _orNotFound(todo: TTodo | null): TTodo {
		if (!todo) {
			throw new NotFoundException();
		}
		return todo;
	}
}
