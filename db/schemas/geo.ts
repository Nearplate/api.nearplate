import { raw } from "@nestjs/mongoose";

/** GeoJSON Point; `coordinates` is `[longitude, latitude]`. */
export type TGeoPoint = { type: "Point"; coordinates: [number, number] };

/** Mongoose definition of a GeoJSON Point, for `@Prop(GEO_POINT_PROP)`. */
export const GEO_POINT_PROP = raw({
	type: {
		type: String,
		enum: ["Point"],
		required: true,
		default: "Point",
	},
	coordinates: { type: [Number], required: true },
});
