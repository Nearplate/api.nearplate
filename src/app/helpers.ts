import { BackgroundJobHelper } from "@/helpers/background-job.helper";
import type { Provider } from "@nestjs/common";

export const Helpers: Provider[] = [BackgroundJobHelper];
