/** Named TTLs (seconds) for `@DBCache`. */
export const CacheTTL = {
	ONE_MIN: 60,
	FIVE_MIN: 300,
	FIFTEEN_MIN: 900,
	ONE_HOUR: 3600,
} as const;

export type TCacheTTL = (typeof CacheTTL)[keyof typeof CacheTTL];
