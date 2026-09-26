import { AsyncLocalStorage } from "node:async_hooks";

export type TLogContext = {
	traceId: string;
	kind: "http" | "job" | "app";
};

export const logContext = new AsyncLocalStorage<TLogContext>();

declare global {
	namespace Express {
		interface Request {
			traceId?: string;
		}
	}
}
