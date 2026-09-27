/** Postgres's `unique_violation` SQLSTATE code (was `11000` under Mongo). */
const _UNIQUE_VIOLATION = "23505";

/** A UUID v1-v5 (Postgres `uuid` columns reject anything else). */
const _UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when `id` is a well-formed UUID; a malformed id is never queried. */
export function isUuid(id: string): boolean {
	return _UUID_RE.test(id);
}

/**
 * True when `error` is a Postgres unique-constraint violation. Drizzle wraps
 * the driver's error in a `DrizzleQueryError`, so the pg error (with `.code`)
 * is usually on `.cause`, not on `error` itself.
 */
export function isUniqueViolation(error: unknown): boolean {
	const cause = (error as { cause?: unknown } | null)?.cause;
	return (
		_pgCode(error) === _UNIQUE_VIOLATION || _pgCode(cause) === _UNIQUE_VIOLATION
	);
}

function _pgCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) {
		return undefined;
	}
	return (error as { code?: string }).code;
}
