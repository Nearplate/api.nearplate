import { GoogleOauthAdapter } from "@/adapters/google-oauth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import { S3StorageAdapter } from "@/adapters/s3-storage.adapter";
import { AppModule } from "@/app/app.module";
import { configureApp } from "@/app/configure-app";
import { DatabaseService } from "@/app/modules/database";
import { AuthRole } from "@/domain/enums/auth-role";
import { FoodType } from "@/domain/enums/food-type";
import { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { RestaurantVerificationStatus } from "@/domain/enums/restaurant-verification-status";
import type { TCreateMenuItemInput } from "@/domain/types/menu-item.types";
import type {
	TCreateOrderInput,
	TCreateOrderItemInput,
} from "@/domain/types/order.types";
import type { TCreateRestaurantInput } from "@/domain/types/restaurant.types";
import type { TOrderWithItems } from "@/repositories/order.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { UserRepository } from "@/repositories/user.repository";
import { OrderService } from "@/services/order.service";
import { RestaurantService } from "@/services/restaurant.service";
import type { TMenuItem } from "@db/schemas/menu-item.schema";
import type { TRestaurant } from "@db/schemas/restaurant.schema";
import type { TUser, TUserRole } from "@db/schemas/user.schema";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sql } from "drizzle-orm";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { FakeGoogleOauthAdapter } from "./fakes/google-oauth.adapter.fake";
import { FakeResendAdapter } from "./fakes/resend.adapter.fake";
import { FakeS3StorageAdapter } from "./fakes/s3-storage.adapter.fake";

const _REDIS_KEY_PATTERNS = ["dbcache:*", "ratelimit:*"];
/** Every table, leaf-first so `reset` reads the same as the schema's FKs. */
const _TABLES = [
	"order_items",
	"orders",
	"uploads",
	"menu_items",
	"restaurants",
	"addresses",
	"auth_sessions",
	"auth_tokens",
	"users",
];

export type TSeededUser = TUser & { accessToken: string };

export type TE2eApp = {
	app: INestApplication;
	http: ReturnType<typeof request>;
	jwt: JwtAdapter;
	resend: FakeResendAdapter;
	google: FakeGoogleOauthAdapter;
	s3: FakeS3StorageAdapter;
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
		state?: Partial<
			Pick<TRestaurant, "verificationStatus" | "status" | "rejectionReason">
		>,
	) => Promise<TRestaurant>;
	/** Creates a menu item on one of `ownerId`'s restaurants. */
	seedMenuItem: (
		ownerId: string,
		restaurantId: string,
		overrides?: Partial<TCreateMenuItemInput>,
	) => Promise<TMenuItem>;
	/** Places an order for `userId` against `restaurantId`, one item by default. */
	seedOrder: (
		userId: string,
		restaurantId: string,
		items: TCreateOrderItemInput[],
		overrides?: Partial<Omit<TCreateOrderInput, "restaurantId" | "items">>,
	) => Promise<TOrderWithItems>;
	/** Truncates every table, clears cache/rate-limit keys, resets the fakes. */
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
	const client = new Redis(process.env.REDIS_URI ?? "redis://localhost:6380", {
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
	const google = new FakeGoogleOauthAdapter();
	const s3 = new FakeS3StorageAdapter();
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	})
		.overrideProvider(ResendAdapter)
		.useValue(resend)
		.overrideProvider(GoogleOauthAdapter)
		.useValue(google)
		.overrideProvider(S3StorageAdapter)
		.useValue(s3)
		.compile();

	const app = moduleRef.createNestApplication({ bufferLogs: true });
	configureApp(app);
	await app.init();

	const jwt = app.get(JwtAdapter);
	const databaseService = app.get(DatabaseService);
	const users = app.get(UserRepository);

	_ctx = {
		app,
		http: request(app.getHttpServer()),
		jwt,
		resend,
		google,
		s3,
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
		seedRestaurant: async (
			ownerId,
			overrides = {},
			state = {
				verificationStatus: RestaurantVerificationStatus.Approved,
				status: RestaurantStatus.Online,
			},
		) => {
			const created = await app.get(RestaurantService).create(ownerId, {
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
			});
			const seeded = await app
				.get(RestaurantRepository)
				.update(ownerId, created.id, state);
			return seeded ?? created;
		},
		seedMenuItem: (ownerId, restaurantId, overrides = {}) =>
			app.get(RestaurantService).createMenuItem(ownerId, restaurantId, {
				name: "Paneer Tikka",
				category: "Starters",
				priceInPaise: 24900,
				foodType: FoodType.Veg,
				isAvailable: true,
				...overrides,
			}),
		seedOrder: (userId, restaurantId, items, overrides = {}) =>
			app.get(OrderService).place(userId, {
				restaurantId,
				items,
				deliveryAddress: {
					line1: "12 MG Road",
					city: "Bengaluru",
					state: "Karnataka",
					zipcode: "560001",
				},
				...overrides,
			}),
		reset: async () => {
			await databaseService.db.execute(
				sql.raw(
					`TRUNCATE TABLE ${_TABLES.join(", ")} RESTART IDENTITY CASCADE`,
				),
			);
			await _clearRedisKeys();
			resend.reset();
			google.reset();
			s3.reset();
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
