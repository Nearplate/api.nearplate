import { LogClass } from "@/app/modules/logger";
import { AuthUser } from "@/decorators/auth-user.decorator";
import { Roles } from "@/decorators/role.decorator";
import { AuthRole } from "@/domain/enums/auth-role";
import { RestaurantOnboardingService } from "@/services/restaurant-onboarding.service";
import type {
	TDocumentUploadResponse,
	TKycResponse,
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
	Patch,
	Post,
} from "@nestjs/common";

/**
 * Owner onboarding data for a restaurant: KYC documents in the private
 * bucket and KYC/bank details. Shares the `restaurants` prefix with
 * `RestaurantController`; every handler is owner-only and scoped to the
 * caller (foreign ids are 404).
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

	/** The caller's KYC and bank details, PAN and account number masked. */
	@Roles(AuthRole.Restaurant)
	@Get(":id/kyc")
	public async getKyc(
		@Param("id") id: string,
		@AuthUser() user: TAuthUser,
	): Promise<TKycResponse> {
		const kyc = await this._restaurantOnboardingService.getKyc(user.id, id);
		return this._restaurantOnboardingTransformer.toGetKycResponseDTO(kyc);
	}

	/** Saves any subset of the KYC and bank details (partial drafts allowed). */
	@Roles(AuthRole.Restaurant)
	@Patch(":id/kyc")
	public async updateKyc(
		@Param("id") id: string,
		@Body() body: unknown,
		@AuthUser() user: TAuthUser,
	): Promise<TKycResponse> {
		const input =
			this._restaurantOnboardingTransformer.toUpdateKycRequestDTO(body);
		const kyc = await this._restaurantOnboardingService.updateKyc(
			user.id,
			id,
			input,
		);
		return this._restaurantOnboardingTransformer.toUpdateKycResponseDTO(kyc);
	}

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
