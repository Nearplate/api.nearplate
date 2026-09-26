import { AppService } from "@/services/app.service";
import { TodoService } from "@/services/todo.service";
import type { Provider } from "@nestjs/common";

export const Services: Provider[] = [AppService, TodoService];
