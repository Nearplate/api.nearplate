import { AuthCleanupSubscriber } from "@/subscribers/auth-cleanup.subscriber";
import { UploadCleanupSubscriber } from "@/subscribers/upload-cleanup.subscriber";
import type { Provider } from "@nestjs/common";

/** Cron entrypoints (see `.claude/rules/architecture-layers.md`). */
export const Subscribers: Provider[] = [
	AuthCleanupSubscriber,
	UploadCleanupSubscriber,
];
