import { format, transports, type LoggerOptions } from "winston";
import { utilities } from "nest-winston";
import LokiTransport from "winston-loki";
import { logContext } from "./logger.context";
import { scrubLogInfo } from "./logger.scrub";

export const LOG_LEVELS = {
	fatal: 0,
	error: 1,
	warn: 2,
	info: 3,
	http: 4,
	debug: 5,
	verbose: 6,
} as const;

export type TLogLevel = keyof typeof LOG_LEVELS;

const SEVERITY: Record<TLogLevel, string> = {
	fatal: "CRITICAL",
	error: "ERROR",
	warn: "WARNING",
	info: "INFO",
	http: "INFO",
	debug: "DEBUG",
	verbose: "DEBUG",
};

const withContext = format((info) => {
	const ctx = logContext.getStore();
	if (ctx) {
		info.traceId = ctx.traceId;
	}
	info.kind = info.kind ?? "app";
	return info;
});

const withSeverity = format((info) => {
	const level = info.level as TLogLevel;
	info.severity = SEVERITY[level] ?? "DEFAULT";
	return info;
});

/** nest-winston wraps traces in a one-element array; flatten for JSON output. */
const flattenStack = format((info) => {
	if (Array.isArray(info.stack)) {
		info.stack = info.stack.filter(Boolean).join("\n");
	}
	return info;
});

const scrub = format((info) => {
	scrubLogInfo(info);
	return info;
});

export type TBuildWinstonOptionsParams = {
	serviceName: string;
	port: number;
	level: TLogLevel;
	env: string;
	lokiHost?: string;
};

function toAppName(serviceName: string, port: number): string {
	return `${serviceName.replaceAll(".", "_").toUpperCase()}:${port}`;
}

export function buildWinstonOptions({
	serviceName,
	port,
	level,
	env,
	lokiHost,
}: TBuildWinstonOptionsParams): LoggerOptions {
	const appName = toAppName(serviceName, port);

	const common = [
		format.timestamp(),
		format.errors({ stack: true }),
		withContext(),
		withSeverity(),
		flattenStack(),
		scrub(),
	];

	const nestLikeFormat = format.combine(
		...common,
		utilities.format.nestLike(appName, {
			colors: true,
			prettyPrint: true,
		}),
	);

	const transportsList: NonNullable<LoggerOptions["transports"]> = [
		new transports.Console({ format: nestLikeFormat }),
	];

	if (lokiHost) {
		transportsList.push(
			new LokiTransport({
				host: lokiHost,
				labels: { service: serviceName, env },
				json: true,
				batching: true,
				interval: 5,
				replaceTimestamp: true,
				format: format.combine(...common, format.json()),
				onConnectionError: (err) => {
					console.error("[loki] connection error", err);
				},
			}),
		);
	}

	return {
		levels: LOG_LEVELS,
		level,
		defaultMeta: { service: serviceName, appName, env },
		transports: transportsList,
	};
}
