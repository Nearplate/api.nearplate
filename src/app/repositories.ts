import { TodoRepository } from "@/repositories/todo.repository";
import type { Provider } from "@nestjs/common";

export const Repositories: Provider[] = [TodoRepository];
