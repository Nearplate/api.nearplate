import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

/** Zod parse that turns any failure into a 400 listing the offending fields. */
export function parseOrBadRequest<T extends z.ZodTypeAny>(
	schema: T,
	input: unknown,
): z.infer<T> {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw new BadRequestException(
			parsed.error.issues
				.map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
				.join("; "),
		);
	}
	return parsed.data;
}
