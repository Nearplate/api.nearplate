import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/** A todo item owned by exactly one principal (`ownerId` = JWT `sub`). */
@Schema({ collection: "todos", timestamps: true })
export class Todo {
	/** JWT subject of the owner. Every query must be scoped by it. */
	@Prop({ type: String, required: true, index: true })
	ownerId!: string;

	@Prop({ type: String, required: true, trim: true })
	title!: string;

	@Prop({ type: String, default: null })
	description!: string | null;

	@Prop({ type: Boolean, default: false })
	completed!: boolean;

	createdAt!: Date;
	updatedAt!: Date;
}

export type TodoDocument = HydratedDocument<Todo>;

/** Plain (lean) row shape with `_id` mapped to `id` by the repository. */
export type TTodo = {
	id: string;
	ownerId: string;
	title: string;
	description: string | null;
	completed: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export const TodoSchema = SchemaFactory.createForClass(Todo);
TodoSchema.index({ ownerId: 1, createdAt: -1 });
