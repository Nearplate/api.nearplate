import { AuthSessionRepository } from "@/repositories/auth-session.repository";
import { AuthTokenRepository } from "@/repositories/auth-token.repository";
import { AddressRepository } from "@/repositories/address.repository";
import { CartRepository } from "@/repositories/cart.repository";
import { MenuItemRepository } from "@/repositories/menu-item.repository";
import { OrderRepository } from "@/repositories/order.repository";
import { RestaurantDocumentRepository } from "@/repositories/restaurant-document.repository";
import { RestaurantKycRepository } from "@/repositories/restaurant-kyc.repository";
import { RestaurantRepository } from "@/repositories/restaurant.repository";
import { UploadRepository } from "@/repositories/upload.repository";
import { UserRepository } from "@/repositories/user.repository";
import type { Provider } from "@nestjs/common";

export const Repositories: Provider[] = [
	UserRepository,
	AuthTokenRepository,
	AuthSessionRepository,
	AddressRepository,
	RestaurantRepository,
	MenuItemRepository,
	OrderRepository,
	UploadRepository,
	CartRepository,
	RestaurantDocumentRepository,
	RestaurantKycRepository,
];
