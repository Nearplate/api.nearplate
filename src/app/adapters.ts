import { GoogleAuthAdapter } from "@/adapters/google-auth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import type { Provider } from "@nestjs/common";

export const Adapters: Provider[] = [
	JwtAdapter,
	RedisCacheAdapter,
	ResendAdapter,
	GoogleAuthAdapter,
];
