const SENSITIVE_PARAMS = ["api_key", "token", "code", "state"];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Restaurant KYC identifiers that must never reach a log line, e.g. inside a
 * failed query's parameters: PAN (`ABCDE1234F`), IFSC (`HDFC0001234`) and
 * any 9-18 digit run (bank account and FSSAI numbers). Case-insensitive
 * because values are logged before the transformer uppercases them.
 */
const KYC_PATTERNS: readonly RegExp[] = [
	/\b[A-Za-z]{5}\d{4}[A-Za-z]\b/g,
	/\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g,
	/\b\d{9,18}\b/g,
];

export function stripSensitiveQuery(url: string): string {
	const [path, qs] = url.split("?");
	if (!qs) {
		return url;
	}

	const params = new URLSearchParams(qs);
	for (const key of SENSITIVE_PARAMS) {
		if (params.has(key)) {
			params.set(key, "[redacted]");
		}
	}

	return `${path}?${params.toString()}`;
}

/** Enough to correlate a support ticket, not a mailing list. */
export function maskEmail(email: string): string {
	const [local, domain] = email.split("@");
	return domain ? `${local.slice(0, 1)}***@${domain}` : "[redacted]";
}

function scrubString(value: string): string {
	return KYC_PATTERNS.reduce(
		(scrubbed, pattern) => scrubbed.replace(pattern, "[redacted]"),
		value.replace(EMAIL_PATTERN, (email) => maskEmail(email)),
	);
}

function scrubValue(value: unknown): unknown {
	if (typeof value === "string") {
		return scrubString(stripSensitiveQuery(value));
	}
	return value;
}

type TScrubbableLog = {
	message?: unknown;
	url?: unknown;
	originalUrl?: unknown;
	path?: unknown;
	[key: string]: unknown;
};

/**
 * Walks common log fields and redacts sensitive query params, emails and KYC
 * identifiers. `stack` is included because an error's stack repeats its
 * message (and so any query parameters it carries).
 */
export function scrubLogInfo(info: TScrubbableLog): TScrubbableLog {
	for (const key of ["url", "originalUrl", "path"]) {
		if (typeof info[key] === "string") {
			info[key] = stripSensitiveQuery(info[key] as string);
		}
	}

	if (typeof info.message === "string") {
		info.message = scrubString(stripSensitiveQuery(info.message));
	}

	if (typeof info.stack === "string") {
		info.stack = scrubString(info.stack);
	}

	return info;
}

export { scrubValue, scrubString };
