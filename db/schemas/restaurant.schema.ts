import { RESTAURANT_STATUSES } from "@/domain/enums/restaurant-status";
import type { RestaurantStatus } from "@/domain/enums/restaurant-status";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
	type HydratedDocument,
	Schema as MongooseSchema,
	type Types,
} from "mongoose";
import type { TAddress } from "./address.schema";
import { GEO_POINT_PROP, type TGeoPoint } from "./geo";

/** A restaurant owned by exactly one user (`ownerId` = that user's id). */
@Schema({ collection: "restaurants", timestamps: true })
export class Restaurant {
	/** Every owner-facing query must be scoped by it. */
	@Prop({ type: String, required: true, index: true })
	ownerId!: string;

	@Prop({ type: String, required: true, trim: true })
	name!: string;

	/** Public URL identifier, generated from `name`; stable across renames. */
	@Prop({ type: String, required: true, lowercase: true, trim: true })
	slug!: string;

	@Prop({
		type: String,
		enum: RESTAURANT_STATUSES,
		default: "online",
	})
	status!: RestaurantStatus;

	@Prop({ type: MongooseSchema.Types.ObjectId, ref: "Address", required: true })
	address!: Types.ObjectId;

	/** Lowercased and trimmed, so filters match exactly. */
	@Prop({ type: [String], default: [] })
	cuisines!: string[];

	@Prop({ type: Boolean, default: false })
	isPureVeg!: boolean;

	@Prop(GEO_POINT_PROP)
	location!: TGeoPoint;

	createdAt!: Date;
	updatedAt!: Date;
}

export type RestaurantDocument = HydratedDocument<Restaurant>;

/** Plain (lean) row shape: `_id` → `id`, `address` populated. */
export type TRestaurant = {
	id: string;
	ownerId: string;
	name: string;
	slug: string;
	status: RestaurantStatus;
	address: TAddress;
	cuisines: string[];
	isPureVeg: boolean;
	location: TGeoPoint;
	createdAt: Date;
	updatedAt: Date;
};

export const RestaurantSchema = SchemaFactory.createForClass(Restaurant);
RestaurantSchema.index({ slug: 1 }, { unique: true });
// The only 2dsphere index in the collection, so `$geoNear` needs no `key`.
RestaurantSchema.index({ location: "2dsphere", status: 1 });
