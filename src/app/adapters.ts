import { GoogleOauthAdapter } from "@/adapters/google-oauth.adapter";
import { JwtAdapter } from "@/adapters/jwt.adapter";
import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { ResendAdapter } from "@/adapters/resend.adapter";
import { S3StorageAdapter } from "@/adapters/s3-storage.adapter";
import type { Provider } from "@nestjs/common";

export const Adapters: Provider[] = [
	JwtAdapter,
	RedisCacheAdapter,
	ResendAdapter,
	GoogleOauthAdapter,
	S3StorageAdapter,
];
