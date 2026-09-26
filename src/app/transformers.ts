import { TodoTransformer } from "@/transformers/todo.transformer";
import type { Provider } from "@nestjs/common";

export const Transformers: Provider[] = [TodoTransformer];
