import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/** A postal address; referenced by a restaurant. */
@Schema({ collection: "addresses", timestamps: true })
export class Address {
	@Prop({ type: String, required: true, trim: true })
	line1!: string;

	@Prop({ type: String, default: null, trim: true })
	line2!: string | null;

	@Prop({ type: String, required: true, trim: true })
	city!: string;

	@Prop({ type: String, required: true, trim: true })
	state!: string;

	@Prop({ type: String, required: true, trim: true })
	zipcode!: string;

	@Prop({ type: String, default: null, trim: true })
	phoneNumber!: string | null;

	createdAt!: Date;
	updatedAt!: Date;
}

export type AddressDocument = HydratedDocument<Address>;

/** Plain (lean) row shape with `_id` mapped to `id` by the repository. */
export type TAddress = {
	id: string;
	line1: string;
	line2: string | null;
	city: string;
	state: string;
	zipcode: string;
	phoneNumber: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export const AddressSchema = SchemaFactory.createForClass(Address);
