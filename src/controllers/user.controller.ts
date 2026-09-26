import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { UserService } from "@/services/user.service";
import type { TUserResponse } from "@/transformers/user.dto";
import { UserTransformer } from "@/transformers/user.transformer";
import type { TAuthUser } from "@/types/auth-user";
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Patch,
	Post,
} from "@nestjs/common";

/** The caller's own profile. Any signed-in (non-guest) role. */
@LogClass()
@Roles(AuthRole.Admin, AuthRole.Restaurant, AuthRole.User)
@Controller("users")
export class UserController {
	constructor(
		@Inject(UserTransformer)
		private readonly _userTransformer: UserTransformer,
		@Inject(UserService)
		private readonly _userService: UserService,
	) {}

	/** The caller's profile. */
	@Get("me")
	public async getMe(@AuthUser() user: TAuthUser): Promise<TUserResponse> {
		return this._userTransformer.toMeResponseDTO(
			await this._userService.getMe(user.id),
		);
	}

	/** Updates the caller's names and/or avatar. */
	@Patch("me")
	public async updateMe(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TUserResponse> {
		const patch = this._userTransformer.toUpdateMeRequestDTO(body);
		return this._userTransformer.toMeResponseDTO(
			await this._userService.updateMe(user.id, patch),
		);
	}

	/** Completes onboarding: sets first and last name. */
	@Post("me/onboard")
	@HttpCode(HttpStatus.OK)
	public async onboard(
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TUserResponse> {
		const names = this._userTransformer.toOnboardRequestDTO(body);
		return this._userTransformer.toMeResponseDTO(
			await this._userService.onboard(user.id, names),
		);
	}
}
