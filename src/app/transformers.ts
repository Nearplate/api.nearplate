import { AuthTransformer } from "@/transformers/auth.transformer";
import type { Provider } from "@nestjs/common";

export const Transformers: Provider[] = [AuthTransformer];
