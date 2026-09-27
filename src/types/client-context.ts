/**
 * Who is calling; stored on refresh sessions. `deviceId` binds a refresh
 * token to the device it was issued to (see `AuthSessionRepository`).
 */
export type TClientContext = {
	deviceId: string | null;
	userAgent: string | null;
};
