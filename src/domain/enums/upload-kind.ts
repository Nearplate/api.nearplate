/** Which image slot an upload is for: a restaurant's logo/banner, or a menu item's photo. */
export enum UploadKind {
	Logo = "logo",
	Banner = "banner",
	MenuItem = "menu_item",
}

export const UPLOAD_KINDS = [
	UploadKind.Logo,
	UploadKind.Banner,
	UploadKind.MenuItem,
] as const;
