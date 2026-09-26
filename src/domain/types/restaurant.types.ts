import type { RestaurantStatus } from "@/domain/enums/restaurant-status";

/** `[longitude, latitude]`, the GeoJSON order. */
export type TCoordinates = [number, number];

export type TAddressInput = {
	line1: string;
	line2?: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber?: string | null;
};

export type TCreateRestaurantInput = {
	name: string;
	cuisines: string[];
	isPureVeg: boolean;
	coordinates: TCoordinates;
	address: TAddressInput;
};

/** Every key optional; `address` is a partial patch of the stored address. */
export type TUpdateRestaurantInput = Partial<{
	name: string;
	cuisines: string[];
	isPureVeg: boolean;
	coordinates: TCoordinates;
	address: Partial<TAddressInput>;
}>;

export type TListRestaurantsInput = {
	status?: RestaurantStatus;
	limit: number;
	offset: number;
};

export type TNearbyRestaurantsInput = {
	coordinates: TCoordinates;
	radiusMeters: number;
	isPureVeg?: boolean;
	cuisine?: string;
	limit: number;
};
