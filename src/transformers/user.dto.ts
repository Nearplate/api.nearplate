import { AuthRole } from "@/domain/enums/auth-role";
import { USER_GENDERS } from "@/domain/enums/user-gender";
import { z } from "zod";

/**
 * Wire shape of a user, shared by the auth and user transformers. Never
 * exposes `googleSub` or other internals. `createdAt` is coerced because
 * `@DBCache` hits arrive from Redis JSON with dates as strings.
 */
export const userResponseSchema = z.object({
	id: z.string(),
	email: z.string(),
	role: z.enum([AuthRole.Admin, AuthRole.Restaurant, AuthRole.User]),
	firstName: z.string().nullable(),
	lastName: z.string().nullable(),
	isOnboarded: z.boolean(),
	avatarUrl: z.string().nullable(),
	phoneNumber: z.string().nullable(),
	dateOfBirth: z.string().nullable(),
	anniversaryDate: z.string().nullable(),
	gender: z.enum(USER_GENDERS).nullable(),
	createdAt: z.coerce.date().transform((d) => d.toISOString()),
});

export type TUserResponse = z.infer<typeof userResponseSchema>;
