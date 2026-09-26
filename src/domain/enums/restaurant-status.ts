/** Whether a restaurant is currently taking orders. */
export enum RestaurantStatus {
	Online = "online",
	Offline = "offline",
}

export const RESTAURANT_STATUSES = [
	RestaurantStatus.Online,
	RestaurantStatus.Offline,
] as const;
