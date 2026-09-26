import { AppService } from "@/services/app.service";
import { AuthService } from "@/services/auth.service";
import { SessionService } from "@/services/session.service";
import type { Provider } from "@nestjs/common";

export const Services: Provider[] = [AppService, AuthService, SessionService];
