import { Logger } from "@nestjs/common";

export type TLogClassLevel = "log" | "debug";

export type TLogClassOptions = {
	level?: TLogClassLevel;
	exclude?: string[];
};

/**
 * Nest attaches route/handler metadata (`@HttpCode`, `@Post`, …) to the
 * original method function. PathsExplorer later reads that metadata from the
 * instance callback, so every key must move onto the wrapper.
 */
function copyReflectMetadata(from: object, to: object): void {
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

/**
 * Wraps every public instance method on the class with entry/exit logs.
 * Private methods (names starting with `_`) are skipped.
 */
export function LogClass(options: TLogClassOptions = {}): ClassDecorator {
	const level: TLogClassLevel = options.level ?? "log";
	const exclude = new Set(options.exclude ?? []);

	return (constructor) => {
		const className = constructor.name;
		const proto = constructor.prototype;

		for (const methodName of Object.getOwnPropertyNames(proto)) {
			if (methodName === "constructor") continue;
			if (methodName.startsWith("_")) continue;
			if (exclude.has(methodName)) continue;

			const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
			if (!descriptor || typeof descriptor.value !== "function") continue;

			const original = descriptor.value as (...args: unknown[]) => unknown;
			const wrapped = function (this: unknown, ...args: unknown[]) {
				const logger = new Logger(className);
				logger[level](`${methodName} started`);
				try {
					const result = original.apply(this, args);
					if (result instanceof Promise) {
						return result
							.then((value) => {
								logger[level](`${methodName} completed`);
								return value;
							})
							.catch((error: unknown) => {
								logger.error(`${methodName} failed`, error);
								throw error;
							});
					}
					logger[level](`${methodName} completed`);
					return result;
				} catch (error) {
					logger.error(`${methodName} failed`, error);
					throw error;
				}
			};

			copyReflectMetadata(original, wrapped);
			descriptor.value = wrapped;
			Object.defineProperty(proto, methodName, descriptor);
			copyReflectMetadata(original, proto[methodName]);
		}
	};
}
