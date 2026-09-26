import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { AuthTokenRepository } from "@/repositories/auth-token.repository";
import { UserRepository } from "@/repositories/user.repository";
import type { Provider } from "@nestjs/common";

export const Repositories: Provider[] = [
	UserRepository,
	AuthTokenRepository,
	AuthSessionRepository,
];
