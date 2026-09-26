/** Wire role values. Matches the `role` claim in access-token payloads. */
export enum AuthRole {
	Admin = "admin",
	Restaurant = "restaurant",
	User = "user",
	Guest = "guest",
}

export const AUTH_ROLES = [
	AuthRole.Admin,
	AuthRole.Restaurant,
	AuthRole.User,
	AuthRole.Guest,
] as const;
export type TAuthRole = AuthRole;
