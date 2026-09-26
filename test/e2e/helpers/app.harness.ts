import { GoogleAuthAdapter } from "@/adapters/google-auth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import { AppModule } from "@/app/app.module";
import { configureApp } from "@/app/configure-app";
import { AuthRole } from "@/domain/enums/auth-role";
import { FoodType } from "@/domain/enums/food-type";
import type { TCreateMenuItemInput } from "@/domain/types/menu-item.types";
import type { TCreateRestaurantInput } from "@/domain/types/restaurant.types";
import { UserRepository } from "@/repositories/user.repository";
import { MenuItemService } from "@/services/menu-item.service";
import { RestaurantService } from "@/services/restaurant.service";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import type { TUser, TUserRole } from "@db/schemas/user.schema";
import type { INestApplication } from "@nestjs/common";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import type { Connection } from "mongoose";
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
		firstName?: string;
		lastName?: string;
	}) => Promise<TSeededUser>;
	/** Creates a restaurant (with address) owned by `ownerId`. */
	seedRestaurant: (
		ownerId: string,
		overrides?: Partial<TCreateRestaurantInput>,
	) => Promise<TRestaurant>;
	/** Creates a menu item on one of `ownerId`'s restaurants. */
	seedMenuItem: (
		ownerId: string,
		restaurantId: string,
		overrides?: Partial<Omit<TCreateMenuItemInput, "restaurantId">>,
	) => Promise<TMenuItem>;
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
	configureApp(app);
	await app.init();

	const jwt = app.get(JwtAdapter);
	const connection0 = app.get<Connection>(getConnectionToken());
	// Indexes build asynchronously on connect; `$geoNear` and the unique slug
	// index must exist before the first test runs.
	await Promise.all(
		Object.values(connection0.models).map((model) => model.init()),
	);
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
				firstName: input.firstName ?? null,
				lastName: input.lastName ?? null,
				emailVerifiedAt: new Date(),
			});
			if (!user) {
				throw new Error("seedUser: email already exists");
			}
			return { ...user, accessToken: jwt.signAccessToken(user.id, role) };
		},
		seedRestaurant: (ownerId, overrides = {}) =>
			app.get(RestaurantService).create(ownerId, {
				name: "Spice Hub",
				cuisines: ["indian"],
				isPureVeg: false,
				coordinates: [77.5946, 12.9716],
				address: {
					line1: "12 MG Road",
					city: "Bengaluru",
					state: "Karnataka",
					zipcode: "560001",
				},
				...overrides,
			}),
		seedMenuItem: (ownerId, restaurantId, overrides = {}) =>
			app.get(MenuItemService).create(ownerId, {
				restaurantId,
				name: "Paneer Tikka",
				category: "Starters",
				priceInPaise: 24900,
				foodType: FoodType.Veg,
				isAvailable: true,
				...overrides,
			}),
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
