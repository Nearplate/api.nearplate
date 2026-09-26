import { FOOD_TYPES, type FoodType } from "@/domain/enums/food-type";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import {
	type HydratedDocument,
	Schema as MongooseSchema,
	type Types,
} from "mongoose";
import { GEO_POINT_PROP, type TGeoPoint } from "./geo";

/** One dish on a restaurant's menu. */
@Schema({ collection: "menu_items", timestamps: true })
export class MenuItem {
	@Prop({
		type: MongooseSchema.Types.ObjectId,
		ref: "Restaurant",
		required: true,
	})
	restaurant!: Types.ObjectId;

	/**
	 * Denormalized from the restaurant so owner-scoped queries need no join.
	 * Must be kept equal to `restaurant.ownerId` (ownership never transfers).
	 */
	@Prop({ type: String, required: true })
	ownerId!: string;

	@Prop({ type: String, required: true, trim: true })
	name!: string;

	@Prop({ type: String, required: true, trim: true })
	category!: string;

	/** Integer paise (1/100 rupee): no floating-point money. */
	@Prop({ type: Number, required: true, min: 0 })
	priceInPaise!: number;

	@Prop({ type: String, enum: FOOD_TYPES, required: true })
	foodType!: FoodType;

	@Prop({ type: Boolean, default: true })
	isAvailable!: boolean;

	/**
	 * Denormalized copy of the restaurant's location, for geo queries on items.
	 * Must be updated whenever the restaurant's location changes.
	 */
	@Prop(GEO_POINT_PROP)
	location!: TGeoPoint;

	createdAt!: Date;
	updatedAt!: Date;
}

export type MenuItemDocument = HydratedDocument<MenuItem>;

/** Plain (lean) row shape with `_id` mapped to `id` by the repository. */
export type TMenuItem = {
	id: string;
	restaurantId: string;
	ownerId: string;
	name: string;
	category: string;
	priceInPaise: number;
	foodType: FoodType;
	isAvailable: boolean;
	location: TGeoPoint;
	createdAt: Date;
	updatedAt: Date;
};

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);
MenuItemSchema.index({ restaurant: 1, category: 1, name: 1 });
MenuItemSchema.index({ ownerId: 1 });
MenuItemSchema.index({ location: "2dsphere", foodType: 1, isAvailable: 1 });
