import { JwtAdapter } from "@/adapters/jwt.adapter";
import { AppModule } from "@/app/app.module";
import {
	accessLogMiddleware,
	traceContextMiddleware,
} from "@/app/modules/logger";
import type { AuthRole } from "@/domain/enums/auth-role";
import type { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import type { Connection } from "mongoose";
import {
	WINSTON_MODULE_NEST_PROVIDER,
	WINSTON_MODULE_PROVIDER,
} from "nest-winston";
import { randomUUID } from "node:crypto";
import request from "supertest";

export type TE2eApp = {
	app: INestApplication;
	http: ReturnType<typeof request>;
	jwt: JwtAdapter;
	/** `Authorization` header value for a freshly signed token. */
	authHeader: (role: AuthRole, sub?: string) => string;
	/** Drops every collection and clears the `dbcache:*` Redis keys. */
	reset: () => Promise<void>;
};

let _ctx: TE2eApp | null = null;

export function getE2eApp(): TE2eApp {
	if (!_ctx) {
		throw new Error("e2e app is not started");
	}
	return _ctx;
}

async function _clearDbCacheKeys(): Promise<void> {
	const client = new Redis({
		host: process.env.REDIS_HOST ?? "localhost",
		port: Number(process.env.REDIS_PORT ?? 6379),
		lazyConnect: true,
	});
	try {
		await client.connect();
		const keys = await client.keys("dbcache:*");
		if (keys.length > 0) {
			await client.del(...keys);
		}
	} finally {
		await client.quit();
	}
}

export async function startE2eApp(): Promise<TE2eApp> {
	if (_ctx) {
		return _ctx;
	}

	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	const app = moduleRef.createNestApplication({ bufferLogs: true });
	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
	app.flushLogs();
	app.use(traceContextMiddleware);
	app.use(accessLogMiddleware(app.get(WINSTON_MODULE_PROVIDER)));
	await app.init();

	const jwt = app.get(JwtAdapter);
	const connection = app.get<Connection>(getConnectionToken());

	_ctx = {
		app,
		http: request(app.getHttpServer()),
		jwt,
		authHeader: (role, sub = randomUUID()) =>
			`Bearer ${jwt.signAccessToken(sub, role)}`,
		reset: async () => {
			const collections = await connection.db!.collections();
			await Promise.all(collections.map((c) => c.deleteMany({})));
			await _clearDbCacheKeys();
		},
	};
	return _ctx;
}

export async function stopE2eApp(): Promise<void> {
	if (!_ctx) {
		return;
	}
	await _ctx.app.close();
	_ctx = null;
}
