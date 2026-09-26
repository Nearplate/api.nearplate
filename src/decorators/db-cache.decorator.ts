import type { TCacheTTL } from "@/app/constants/cache-ttl";
import { RedisCacheAdapter } from "@/adapters/redis-cache.adapter";
import { Logger } from "@nestjs/common";

type TOriginalMethod = (...args: unknown[]) => unknown;

export type TDBCacheOptions = {
	entity: string;
	by: string;
	ttl: TCacheTTL | number;
};

export type TDBCacheInvalidateOptions = {
	entity: string;
	fields: string[];
	resolve: (
		args: unknown[],
		result: unknown,
	) => Record<string, unknown> | null | undefined;
};

/** `dbcache:{entity}:{field}:{value}` */
export function buildDBCacheKey(
	entity: string,
	field: string,
	value: unknown,
): string {
	return `dbcache:${entity}:${field}:${String(value)}`;
}

/**
 * Nest attaches route/handler metadata to the original method function.
 * PathsExplorer later reads that metadata from the instance callback, so every
 * key must move onto the wrapper.
 */
function _copyReflectMetadata(from: object, to: object): void {
	const keys = new Set<string | symbol>(Reflect.getMetadataKeys(from) ?? []);
	const getOwn = (
		Reflect as typeof Reflect & {
			getOwnMetadataKeys?: (target: object) => (string | symbol)[];
		}
	).getOwnMetadataKeys;
	for (const key of getOwn?.call(Reflect, from) ?? []) {
		keys.add(key);
	}
	for (const key of keys) {
		const value =
			Reflect.getOwnMetadata?.(key, from) ?? Reflect.getMetadata(key, from);
		Reflect.defineMetadata(key, value, to);
	}
}

function _getClassName(target: object): string {
	return (target as { constructor: { name: string } }).constructor.name;
}

function _formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Key value for `dbcache:{entity}:{by}:{value}`:
 * - 0 args → `_` (singleton queries)
 * - 1 arg → stringified arg (unique lookups)
 * - 2+ args → JSON of all args (analytics / composite lookups)
 */
function _cacheKeyValue(args: unknown[]): string | null {
	if (args.length === 0) {
		return "_";
	}
	if (args.length === 1) {
		if (args[0] == null) {
			return null;
		}
		return String(args[0]);
	}
	try {
		return JSON.stringify(args);
	} catch {
		return null;
	}
}

function _parseCachedValue(
	raw: string,
	label: string,
	logger: Logger,
): unknown | undefined {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		logger.warn(`Corrupt cache for ${label}; treating as miss`);
		return undefined;
	}
}

async function _readFromCache(
	key: string,
	label: string,
	logger: Logger,
): Promise<unknown | undefined> {
	try {
		const hit = await RedisCacheAdapter.instance.get(key);
		if (hit == null) {
			return undefined;
		}
		return _parseCachedValue(hit, label, logger);
	} catch (error: unknown) {
		logger.warn(`Cache get failed for ${label}: ${_formatError(error)}`);
		return undefined;
	}
}

async function _writeToCache(
	key: string,
	value: unknown,
	ttl: number,
	label: string,
	logger: Logger,
): Promise<void> {
	try {
		await RedisCacheAdapter.instance.set(key, JSON.stringify(value), ttl);
	} catch (error: unknown) {
		logger.warn(`Failed to cache ${label}: ${_formatError(error)}`);
	}
}

function _collectInvalidateKeys(
	entity: string,
	fields: string[],
	values: Record<string, unknown>,
): string[] {
	const keys: string[] = [];
	for (const field of fields) {
		const value = values[field];
		if (value == null) {
			continue;
		}
		keys.push(buildDBCacheKey(entity, field, value));
	}
	return keys;
}

async function _invalidateKeys(
	keys: string[],
	label: string,
	logger: Logger,
): Promise<void> {
	if (keys.length === 0) {
		return;
	}
	try {
		await RedisCacheAdapter.instance.delMany(keys);
	} catch (error: unknown) {
		logger.warn(`Failed to invalidate ${label}: ${_formatError(error)}`);
	}
}

async function _invokeOriginal(
	original: TOriginalMethod,
	thisArg: unknown,
	args: unknown[],
): Promise<unknown> {
	return original.apply(thisArg, args);
}

function _wrapCacheMethod(
	original: TOriginalMethod,
	options: TDBCacheOptions,
	className: string,
	methodName: string,
): (...args: unknown[]) => Promise<unknown> {
	const label = `${className}.${methodName}`;
	const logger = new Logger(`DBCache:${options.entity}`);

	return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
		const lookupValue = _cacheKeyValue(args);
		if (lookupValue == null) {
			return _invokeOriginal(original, this, args);
		}

		const key = buildDBCacheKey(options.entity, options.by, lookupValue);
		const cached = await _readFromCache(key, label, logger);
		if (cached !== undefined) {
			return cached;
		}

		const result = await _invokeOriginal(original, this, args);
		if (result != null) {
			await _writeToCache(key, result, options.ttl, label, logger);
		}
		return result;
	};
}

function _wrapInvalidateMethod(
	original: TOriginalMethod,
	options: TDBCacheInvalidateOptions,
	className: string,
	methodName: string,
): (...args: unknown[]) => Promise<unknown> {
	const label = `${className}.${methodName}`;
	const logger = new Logger(`DBCacheInvalidate:${options.entity}`);

	return async function (this: unknown, ...args: unknown[]): Promise<unknown> {
		const result = await _invokeOriginal(original, this, args);
		const values = options.resolve(args, result);
		if (values != null) {
			await _invalidateKeys(
				_collectInvalidateKeys(options.entity, options.fields, values),
				label,
				logger,
			);
		}
		return result;
	};
}

/**
 * Cache the method's non-null result in Redis.
 * Key: `dbcache:{entity}:{by}:{args[0]}` (single-arg lookups).
 */
export function DBCache(options: TDBCacheOptions): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value as TOriginalMethod;
		if (typeof original !== "function") {
			return descriptor;
		}

		const wrapped = _wrapCacheMethod(
			original,
			options,
			_getClassName(target),
			String(propertyKey),
		);
		_copyReflectMetadata(original, wrapped);
		descriptor.value = wrapped;
		return descriptor;
	};
}

/**
 * After a successful write, delete entity cache keys resolved from args/result.
 */
export function DBCacheInvalidate(
	options: TDBCacheInvalidateOptions,
): MethodDecorator {
	return (
		target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value as TOriginalMethod;
		if (typeof original !== "function") {
			return descriptor;
		}

		const wrapped = _wrapInvalidateMethod(
			original,
			options,
			_getClassName(target),
			String(propertyKey),
		);
		_copyReflectMetadata(original, wrapped);
		descriptor.value = wrapped;
		return descriptor;
	};
}
