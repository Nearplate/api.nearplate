import { JwtAdapter } from "@/adapters/jwt.adapter";
import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import type { Provider } from "@nestjs/common";

export const Adapters: Provider[] = [JwtAdapter, RedisCacheAdapter];
