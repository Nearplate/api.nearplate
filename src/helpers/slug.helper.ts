import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

const _FALLBACK_SLUG = "restaurant";
const _SUFFIX_BYTES = 3;

/** URL slug generation for restaurant names. */
@Injectable()
export class SlugHelper {
	/** Lowercase, non-alphanumerics collapsed to `-`, trimmed; never empty. */
	public toSlug(name: string): string {
		const slug = name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
		return slug || _FALLBACK_SLUG;
	}

	/** `base` plus a random 6-hex suffix, for resolving a slug collision. */
	public withSuffix(base: string): string {
		return `${base}-${randomBytes(_SUFFIX_BYTES).toString("hex")}`;
	}
}
