import type { ModelDefinition } from "@nestjs/mongoose";
import { Todo, TodoSchema } from "./schemas/todo.schema";

/** Register every Mongoose model here; `DatabaseModule` wires them up. */
export const Models: ModelDefinition[] = [
	{ name: Todo.name, schema: TodoSchema },
];
