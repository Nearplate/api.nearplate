/** Where a restaurant is in the admin approval flow. */
export enum RestaurantVerificationStatus {
	Draft = "draft",
	PendingReview = "pending_review",
	Approved = "approved",
	Rejected = "rejected",
}

export const RESTAURANT_VERIFICATION_STATUSES = [
	RestaurantVerificationStatus.Draft,
	RestaurantVerificationStatus.PendingReview,
	RestaurantVerificationStatus.Approved,
	RestaurantVerificationStatus.Rejected,
] as const;
