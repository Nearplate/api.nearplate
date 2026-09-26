import { LogClass } from "@/app/modules/logger";
import { UserRepository } from "@/repositories/user.repository";
import type { TUser } from "@db/schemas/user.schema";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

/** The caller's own profile. A token whose account is gone is a 401. */
@LogClass()
@Injectable()
export class UserService {
	constructor(
		@Inject(UserRepository)
		private readonly _userRepository: UserRepository,
	) {}

	/** The caller's user; 401 if the account no longer exists. */
	public async getMe(userId: string): Promise<TUser> {
		const user = await this._userRepository.findById(userId);
		if (!user) {
			throw new UnauthorizedException();
		}
		return user;
	}

	/** Updates the caller's profile; 401 if the account no longer exists. */
	public async updateMe(
		userId: string,
		patch: {
			firstName?: string;
			lastName?: string;
			avatarUrl?: string | null;
		},
	): Promise<TUser> {
		const user = await this._userRepository.update(userId, patch);
		if (!user) {
			throw new UnauthorizedException();
		}
		return user;
	}

	/** Sets both names and marks the account onboarded. */
	public async onboard(
		userId: string,
		names: { firstName: string; lastName: string },
	): Promise<TUser> {
		const user = await this._userRepository.update(userId, {
			...names,
			isOnboarded: true,
		});
		if (!user) {
			throw new UnauthorizedException();
		}
		return user;
	}
}
