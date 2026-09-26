import type {
	TCreateTodoInput,
	TListTodosInput,
	TUpdateTodoInput,
} from "@/repositories/todo.repository";
import type {
	ICRUDTransformer,
	TPage,
} from "@/domain/interfaces/crud.interface";
import type { TTodo } from "@db/schemas/todo.schema";
import { BadRequestException, Injectable } from "@nestjs/common";
import { z } from "zod";

const _MAX_TITLE = 200;
const _MAX_DESCRIPTION = 2000;
const _DEFAULT_LIMIT = 50;
const _MAX_LIMIT = 100;

const _title = z.string().trim().min(1).max(_MAX_TITLE);
const _description = z.string().trim().max(_MAX_DESCRIPTION).nullable();

const _createSchema = z
	.object({ title: _title, description: _description.optional() })
	.strict();

const _updateSchema = z
	.object({
		title: _title.optional(),
		description: _description.optional(),
		completed: z.boolean().optional(),
	})
	.strict();

const _listSchema = z.object({
	completed: z.enum(["true", "false"]).optional(),
	limit: z.coerce.number().int().min(1).max(_MAX_LIMIT).default(_DEFAULT_LIMIT),
	offset: z.coerce.number().int().min(0).default(0),
});

/** `z.coerce.date()` because `@DBCache` hits arrive from Redis JSON as strings. */
const _responseSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	completed: z.boolean(),
	createdAt: z.coerce.date().transform((d) => d.toISOString()),
	updatedAt: z.coerce.date().transform((d) => d.toISOString()),
});

export type TTodoResponse = z.infer<typeof _responseSchema>;
export type TTodoListResponse = { items: TTodoResponse[]; total: number };

/** Validates todo request bodies/queries and shapes the wire responses. */
@Injectable()
export class TodoTransformer implements ICRUDTransformer<
	TTodo,
	TCreateTodoInput,
	TUpdateTodoInput,
	TListTodosInput,
	TTodoResponse,
	TTodoListResponse
> {
	/** Body → create input. */
	public toCreateRequestDTO(body: unknown): TCreateTodoInput {
		const data = this._parse(_createSchema, body);
		return { title: data.title, description: data.description ?? null };
	}

	/** Query → list input. */
	public toListRequestDTO(query: unknown): TListTodosInput {
		const data = this._parse(_listSchema, query);
		return {
			limit: data.limit,
			offset: data.offset,
			...(data.completed !== undefined
				? { completed: data.completed === "true" }
				: {}),
		};
	}

	/** Body → partial update; keys are present only when sent, empty body is 400. */
	public toUpdateRequestDTO(body: unknown): TUpdateTodoInput {
		const data = this._parse(_updateSchema, body);
		const input: TUpdateTodoInput = {
			...(data.title !== undefined ? { title: data.title } : {}),
			...(data.description !== undefined
				? { description: data.description }
				: {}),
			...(data.completed !== undefined ? { completed: data.completed } : {}),
		};
		if (Object.keys(input).length === 0) {
			throw new BadRequestException("at least one field is required");
		}
		return input;
	}

	/** Row → wire DTO. */
	public toCreateResponseDTO(row: TTodo): TTodoResponse {
		return this._toResponse(row);
	}

	/** Page → wire DTO. */
	public toListResponseDTO(result: TPage<TTodo>): TTodoListResponse {
		return {
			items: result.items.map((row) => this._toResponse(row)),
			total: result.total,
		};
	}

	/** Row → wire DTO. */
	public toGetResponseDTO(row: TTodo): TTodoResponse {
		return this._toResponse(row);
	}

	/** Row → wire DTO. */
	public toUpdateResponseDTO(row: TTodo): TTodoResponse {
		return this._toResponse(row);
	}

	/** Selects wire fields (drops `ownerId`) and validates the outgoing shape. */
	private _toResponse(row: TTodo): TTodoResponse {
		return _responseSchema.parse(row);
	}

	/** Zod parse that turns failures into a 400. */
	private _parse<T extends z.ZodTypeAny>(
		schema: T,
		input: unknown,
	): z.infer<T> {
		const parsed = schema.safeParse(input);
		if (!parsed.success) {
			throw new BadRequestException(
				parsed.error.issues
					.map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
					.join("; "),
			);
		}
		return parsed.data;
	}
}
