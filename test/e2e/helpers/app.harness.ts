import { GoogleAuthAdapter } from "@/adapters/google-auth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import { AppModule } from "@/app/app.module";
import {
	accessLogMiddleware,
	traceContextMiddleware,
} from "@/app/modules/logger";
import { AuthRole } from "@/domain/enums/auth-role";
import { UserRepository } from "@/repositories/user.repository";
import type { TUser, TUserRole } from "@db/schemas/user.schema";
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
import { FakeGoogleAuthAdapter } from "./fakes/google-auth.adapter.fake";
import { FakeResendAdapter } from "./fakes/resend.adapter.fake";

const _REDIS_KEY_PATTERNS = ["dbcache:*", "ratelimit:*"];

export type TSeededUser = TUser & { accessToken: string };

export type TE2eApp = {
	app: INestApplication;
	http: ReturnType<typeof request>;
	jwt: JwtAdapter;
	resend: FakeResendAdapter;
	google: FakeGoogleAuthAdapter;
	/** `Authorization` header value for a freshly signed token. */
	authHeader: (role: AuthRole, sub?: string) => string;
	/** Inserts a verified user and returns it with a valid access token. */
	seedUser: (input?: {
		role?: TUserRole;
		email?: string;
		name?: string;
	}) => Promise<TSeededUser>;
	/** Drops every collection, clears cache/rate-limit keys, resets the fakes. */
	reset: () => Promise<void>;
};

let _ctx: TE2eApp | null = null;

export function getE2eApp(): TE2eApp {
	if (!_ctx) {
		throw new Error("e2e app is not started");
	}
	return _ctx;
}

async function _clearRedisKeys(): Promise<void> {
	const client = new Redis({
		host: process.env.REDIS_HOST ?? "localhost",
		port: Number(process.env.REDIS_PORT ?? 6379),
		lazyConnect: true,
	});
	try {
		await client.connect();
		for (const pattern of _REDIS_KEY_PATTERNS) {
			const keys = await client.keys(pattern);
			if (keys.length > 0) {
				await client.del(...keys);
			}
		}
	} finally {
		await client.quit();
	}
}

export async function startE2eApp(): Promise<TE2eApp> {
	if (_ctx) {
		return _ctx;
	}

	const resend = new FakeResendAdapter();
	const google = new FakeGoogleAuthAdapter();
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(ResendAdapter)
		.useValue(resend)
		.overrideProvider(GoogleAuthAdapter)
		.useValue(google)
		.compile();

	const app = moduleRef.createNestApplication({ bufferLogs: true });
	app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
	app.flushLogs();
	app.use(traceContextMiddleware);
	app.use(accessLogMiddleware(app.get(WINSTON_MODULE_PROVIDER)));
	await app.init();

	const jwt = app.get(JwtAdapter);
	const users = app.get(UserRepository);
	const connection = app.get<Connection>(getConnectionToken());

	_ctx = {
		app,
		http: request(app.getHttpServer()),
		jwt,
		resend,
		google,
		authHeader: (role, sub = randomUUID()) =>
			`Bearer ${jwt.signAccessToken(sub, role)}`,
		seedUser: async (input = {}) => {
			const role = input.role ?? AuthRole.User;
			const user = await users.create({
				email: input.email ?? `${randomUUID()}@example.com`,
				role,
				name: input.name ?? null,
				emailVerifiedAt: new Date(),
			});
			if (!user) {
				throw new Error("seedUser: email already exists");
			}
			return { ...user, accessToken: jwt.signAccessToken(user.id, role) };
		},
		reset: async () => {
			const collections = await connection.db!.collections();
			await Promise.all(collections.map((c) => c.deleteMany({})));
			await _clearRedisKeys();
			resend.reset();
			google.reset();
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
