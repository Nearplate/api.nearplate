import type { TConfig } from "@/app/modules/config";
import { S3Client } from "@aws-sdk/client-s3";
import type { ConfigService } from "@nestjs/config";

/**
 * One S3 client config for every bucket adapter (public uploads, private
 * documents): region, endpoint, path style and optional static credentials.
 */
export function createS3Client(
	configService: ConfigService<TConfig>,
): S3Client {
	const accessKeyId = configService.get("S3_ACCESS_KEY_ID");
	const secretAccessKey = configService.get("S3_SECRET_ACCESS_KEY");
	return new S3Client({
		region: configService.getOrThrow("S3_REGION"),
		endpoint: configService.get("S3_ENDPOINT"),
		forcePathStyle: configService.get("S3_FORCE_PATH_STYLE"),
		// Unset falls back to the SDK's default credential chain.
		credentials:
			accessKeyId && secretAccessKey
				? { accessKeyId, secretAccessKey }
				: undefined,
	});
}
