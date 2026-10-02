import type { TRestaurantDocumentView } from "@/domain/types/restaurant-document.types";
import type { TKycDetails } from "@/domain/types/restaurant-kyc.types";
import type { TRestaurant } from "@db/schemas/restaurant.schema";

/** Onboarding data an admin reviews: full KYC (or null) and every document. */
export type TOnboardingReviewData = {
	kyc: TKycDetails | null;
	documents: TRestaurantDocumentView[];
};

/** One restaurant as an admin reviews it. */
export type TRestaurantReviewDetail = TOnboardingReviewData & {
	restaurant: TRestaurant;
};
