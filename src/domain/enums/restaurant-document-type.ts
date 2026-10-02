/** Which KYC document a restaurant owner uploads during onboarding. */
export enum RestaurantDocumentType {
	AadhaarFront = "aadhaar_front",
	AadhaarBack = "aadhaar_back",
	PanFront = "pan_front",
	PanBack = "pan_back",
	FssaiCertificate = "fssai_certificate",
	BankProof = "bank_proof",
}

export const RESTAURANT_DOCUMENT_TYPES = [
	RestaurantDocumentType.AadhaarFront,
	RestaurantDocumentType.AadhaarBack,
	RestaurantDocumentType.PanFront,
	RestaurantDocumentType.PanBack,
	RestaurantDocumentType.FssaiCertificate,
	RestaurantDocumentType.BankProof,
] as const;
