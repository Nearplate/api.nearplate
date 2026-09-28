import { Injectable } from "@nestjs/common";
import * as QRCode from "qrcode";

/** QR code rendering, used by `RestaurantService` for the public menu link. */
@Injectable()
export class QrCodeHelper {
	/** `text` encoded as a QR code, returned as a `data:image/png;base64,` URL. */
	public toPngDataUrl(text: string): Promise<string> {
		return QRCode.toDataURL(text, { type: "image/png" });
	}

	/** `text` encoded as a QR code, returned as a `data:image/svg+xml` URL. */
	public async toSvgDataUrl(text: string): Promise<string> {
		const svg = await QRCode.toString(text, { type: "svg" });
		return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
	}
}
