import { AccessTokenGuard } from "@/guards/access-token.guard";
import type { Provider } from "@nestjs/common";

export const Guards: Provider[] = [AccessTokenGuard];
