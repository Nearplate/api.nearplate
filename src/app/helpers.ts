import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import { EncryptionHelper } from "@/helpers/encryption.helper";
import { QrCodeHelper } from "@/helpers/qr-code.helper";
import { SessionTokenHelper } from "@/helpers/session-token.helper";
import { SlugHelper } from "@/helpers/slug.helper";
import type { Provider } from "@nestjs/common";

export const Helpers: Provider[] = [
	BackgroundJobHelper,
	SessionTokenHelper,
	SlugHelper,
	QrCodeHelper,
	EncryptionHelper,
];
