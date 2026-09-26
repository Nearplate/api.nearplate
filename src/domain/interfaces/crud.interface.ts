import type { TAuthUser } from "@/types/auth-user";

/** A page of rows plus the total matching the filter. */
export type TPage<TRow> = { items: TRow[]; total: number };

/**
 * Ports for the owner-scoped CRUD slice. Each layer of a CRUD feature
 * (controller, transformer, service, repository) implements the matching
 * interface, so every feature exposes the same method names and signatures.
 *
 * Type parameters, shared across the four interfaces:
 * - `TRow`       plain row returned by the repository
 * - `TCreate`    domain input for create
 * - `TUpdate`    domain input for a partial update
 * - `TListQuery` domain input for list (filters + paging)
 * - `TResponse` / `TListResponse`  wire DTOs
 *
 * `ownerId` is always the first argument of the service and repository: it
 * comes from the JWT (`@AuthUser()`), never from the request.
 */

/** Data access for one collection. Every query is scoped by `ownerId`. */
export interface ICRUDRepository<TRow, TCreate, TUpdate, TListQuery> {
	/** Inserts a row owned by `ownerId`. */
	create(ownerId: string, input: TCreate): Promise<TRow>;
	/** Owner's rows for the query, plus the total matching. */
	list(ownerId: string, query: TListQuery): Promise<TPage<TRow>>;
	/** Null when missing, malformed id, or owned by someone else. */
	findById(ownerId: string, id: string): Promise<TRow | null>;
	/** Applies the patch; null when missing or not owned. */
	update(ownerId: string, id: string, input: TUpdate): Promise<TRow | null>;
	/** True when a row was deleted. */
	delete(ownerId: string, id: string): Promise<boolean>;
}

/** Business logic. Missing or not-owned rows surface as `NotFoundException`. */
export interface ICRUDService<TRow, TCreate, TUpdate, TListQuery> {
	create(ownerId: string, input: TCreate): Promise<TRow>;
	list(ownerId: string, query: TListQuery): Promise<TPage<TRow>>;
	get(ownerId: string, id: string): Promise<TRow>;
	update(ownerId: string, id: string, input: TUpdate): Promise<TRow>;
	remove(ownerId: string, id: string): Promise<void>;
}

/** Validates request payloads and shapes wire responses. */
export interface ICRUDTransformer<
	TRow,
	TCreate,
	TUpdate,
	TListQuery,
	TResponse,
	TListResponse,
> {
	toCreateRequestDTO(body: unknown): TCreate;
	toListRequestDTO(query: unknown): TListQuery;
	toUpdateRequestDTO(body: unknown): TUpdate;
	toCreateResponseDTO(row: TRow): TResponse;
	toListResponseDTO(page: TPage<TRow>): TListResponse;
	toGetResponseDTO(row: TRow): TResponse;
	toUpdateResponseDTO(row: TRow): TResponse;
}

/** HTTP surface. Thin: transform, delegate to the service, transform back. */
export interface ICRUDController<TResponse, TListResponse> {
	create(body: unknown, user: TAuthUser): Promise<TResponse>;
	list(query: unknown, user: TAuthUser): Promise<TListResponse>;
	get(id: string, user: TAuthUser): Promise<TResponse>;
	update(id: string, body: unknown, user: TAuthUser): Promise<TResponse>;
	remove(id: string, user: TAuthUser): Promise<void>;
}
