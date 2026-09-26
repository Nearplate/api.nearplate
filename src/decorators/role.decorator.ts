import type { AuthRole } from "@/domain/enums/auth-role";
import { AccessTokenGuard, ROLES_KEY } from "@/guards/access-token.guard";
import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";

/** Requires a valid access token whose role is one of `roles`. */
export const Roles = (...roles: AuthRole[]) =>
	applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AccessTokenGuard));
