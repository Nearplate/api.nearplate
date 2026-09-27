import type { TConfig } from "@/app/modules/config/config";
import * as schema from "@db/schema";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
	drizzle,
	type NodePgDatabase,
	type NodePgQueryResultHKT,
} from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";

type TSchema = typeof schema;

/** The Drizzle client, or a transaction, whichever `db` currently resolves to. */
export type TDatabase =
	| NodePgDatabase<TSchema>
	| PgTransaction<
			NodePgQueryResultHKT,
			TSchema,
			ExtractTablesWithRelations<TSchema>
	  >;

/**
 * Owns the Postgres pool and the Drizzle client. `db` returns the
 * transaction bound to the current call stack (via `AsyncLocalStorage`) when
 * one is open, so repositories always read `this._databaseService.db`
 * without knowing whether they are inside `transaction()`.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
	private readonly _pool: Pool;
	private readonly _root: NodePgDatabase<TSchema>;
	private readonly _als = new AsyncLocalStorage<TDatabase>();

	constructor(
		@Inject(ConfigService)
		configService: ConfigService<TConfig>,
	) {
		this._pool = new Pool({
			connectionString: configService.getOrThrow<string>("DATABASE_URL"),
			// TCP keep-alive avoids sporadic ECONNRESET on idle pooled connections
			// (observed against a local Dockerized Postgres).
			keepAlive: true,
		});
		this._root = drizzle(this._pool, { schema, casing: "snake_case" });
	}

	/** The transaction bound to the current call, or the root client. */
	public get db(): TDatabase {
		return this._als.getStore() ?? this._root;
	}

	/**
	 * Runs `fn` inside a transaction. A call already inside an open
	 * transaction reuses it; `fn` itself calling `transaction()` again through
	 * `this.db` opens a savepoint instead of a new transaction.
	 */
	public async transaction<T>(fn: () => Promise<T>): Promise<T> {
		if (this._als.getStore()) {
			return fn();
		}
		return this._root.transaction((tx) => this._als.run(tx as TDatabase, fn));
	}

	/** Liveness probe for `AppService`. */
	public async ping(): Promise<void> {
		await this._root.execute(sql`select 1`);
	}

	/** Closes the pool when Nest shuts the app down. */
	public async onApplicationShutdown(): Promise<void> {
		await this._pool.end();
	}
}
