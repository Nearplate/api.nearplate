import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantOnboardingService } from "@/services/restaurant-onboarding.service";
import type {
	TDocumentUploadResponse,
	TRestaurantDocumentResponse,
} from "@/transformers/restaurant-onboarding.dto";
import {
	RestaurantOnboardingTransformer,
	type TDocumentListResponse,
} from "@/transformers/restaurant-onboarding.transformer";
import type { TAuthUser } from "@/types/auth-user";
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Inject,
	Param,
	Post,
} from "@nestjs/common";

/**
 * Owner onboarding data for a restaurant: KYC documents in the private
 * bucket. Shares the `restaurants` prefix with `RestaurantController`; every
 * handler is owner-only and scoped to the caller (foreign ids are 404).
 */
@LogClass()
@Controller("restaurants")
export class RestaurantOnboardingController {
	constructor(
		@Inject(RestaurantOnboardingTransformer)
		private readonly _restaurantOnboardingTransformer: RestaurantOnboardingTransformer,
		@Inject(RestaurantOnboardingService)
		private readonly _restaurantOnboardingService: RestaurantOnboardingService,
	) {}

	/** Requests a presigned S3 POST for one KYC document type. */
	@Roles(AuthRole.Restaurant)
	@Post(":id/documents")
	@HttpCode(HttpStatus.CREATED)
	public async createDocumentUpload(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TDocumentUploadResponse> {
		const input =
			this._restaurantOnboardingTransformer.toCreateDocumentUploadRequestDTO(
				body,
			);
		const upload = await this._restaurantOnboardingService.createDocumentUpload(
			user.id,
			id,
			input,
		);
		return this._restaurantOnboardingTransformer.toCreateDocumentUploadResponseDTO(
			upload,
		);
	}

	/** The caller's documents, each with a short-lived download URL once confirmed. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/documents")
	public async listDocuments(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TDocumentListResponse> {
		const documents = await this._restaurantOnboardingService.listDocuments(
			user.id,
			id,
		);
		return this._restaurantOnboardingTransformer.toListDocumentsResponseDTO(
			documents,
		);
	}

	/** Confirms an uploaded document against S3. */
	@Roles(AuthRole.Restaurant)
	@Post(":id/documents/:type/confirm")
	@HttpCode(HttpStatus.OK)
	public async confirmDocumentUpload(
		@Param("id") id: string,
		@Param("type") type: string,
		@AuthUser() user: TAuthUser,
	): Promise<TRestaurantDocumentResponse> {
		const documentType =
			this._restaurantOnboardingTransformer.toDocumentTypeRequestDTO(type);
		const document =
			await this._restaurantOnboardingService.confirmDocumentUpload(
				user.id,
				id,
				documentType,
			);
		return this._restaurantOnboardingTransformer.toConfirmDocumentUploadResponseDTO(
			document,
		);
	}

	/** Deletes a document and its S3 object. */
	@Roles(AuthRole.Restaurant)
	@Delete(":id/documents/:type")
	@HttpCode(HttpStatus.NO_CONTENT)
	public async removeDocument(
		@Param("id") id: string,
		@Param("type") type: string,
		@AuthUser() user: TAuthUser,
	): Promise<void> {
		const documentType =
			this._restaurantOnboardingTransformer.toDocumentTypeRequestDTO(type);
		await this._restaurantOnboardingService.removeDocument(
			user.id,
			id,
			documentType,
		);
	}
}
