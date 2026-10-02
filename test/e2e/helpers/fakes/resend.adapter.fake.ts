export type TSentMagicLink = { to: string; url: string; minutes: number };

export type TSentReviewEmail = {
	to: string;
	kind: "approved" | "rejected";
	restaurantName: string;
	url: string;
	reason?: string;
};

/** Captures emails instead of sending them. */
export class FakeResendAdapter {
	public sent: TSentMagicLink[] = [];
	public reviews: TSentReviewEmail[] = [];
	/** When true, review emails throw instead of being captured. */
	public failReviewEmails = false;

	public isConfigured(): boolean {
		return true;
	}

	public async sendMagicLink(
		to: string,
		url: string,
		minutes: number,
	): Promise<void> {
		this.sent.push({ to, url, minutes });
	}

	public async sendRestaurantApproved(
		to: string,
		restaurantName: string,
		url: string,
	): Promise<void> {
		this._captureReview({ to, kind: "approved", restaurantName, url });
	}

	public async sendRestaurantRejected(
		to: string,
		restaurantName: string,
		reason: string,
		url: string,
	): Promise<void> {
		this._captureReview({ to, kind: "rejected", restaurantName, url, reason });
	}

	/** Review emails go out in a background job, so poll briefly for one. */
	public async waitForReviewEmail(email: string): Promise<TSentReviewEmail> {
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			const review = this.reviews.find((r) => r.to === email);
			if (review) {
				return review;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(`No review email sent to ${email}`);
	}

	private _captureReview(review: TSentReviewEmail): void {
		if (this.failReviewEmails) {
			throw new Error("Resend responded with 500");
		}
		this.reviews.push(review);
	}

	/** Most recent link sent to `email`, or null. */
	public lastLinkFor(email: string): TSentMagicLink | null {
		return [...this.sent].reverse().find((m) => m.to === email) ?? null;
	}

	/** The token in a captured link. */
	public tokenOf(link: TSentMagicLink): string {
		return new URL(link.url).searchParams.get("token") ?? "";
	}

	/** Sending happens in a background job, so poll briefly for the link. */
	public async waitForLink(email: string): Promise<TSentMagicLink> {
		const deadline = Date.now() + 2000;
		while (Date.now() < deadline) {
			const link = this.lastLinkFor(email);
			if (link) {
				return link;
			}
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(`No magic link sent to ${email}`);
	}

	public reset(): void {
		this.sent = [];
		this.reviews = [];
		this.failReviewEmails = false;
	}
}
