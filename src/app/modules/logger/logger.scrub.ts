const SENSITIVE_PARAMS = ["api_key", "token", "code", "state"];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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
	return value.replace(EMAIL_PATTERN, (email) => maskEmail(email));
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

/** Walks common log fields and redacts sensitive query params and emails. */
export function scrubLogInfo(info: TScrubbableLog): TScrubbableLog {
	for (const key of ["url", "originalUrl", "path"]) {
		if (typeof info[key] === "string") {
			info[key] = stripSensitiveQuery(info[key] as string);
		}
	}

	if (typeof info.message === "string") {
		info.message = scrubString(stripSensitiveQuery(info.message));
	}

	return info;
}

export { scrubValue, scrubString };
