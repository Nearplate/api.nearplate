export type TSentMagicLink = { to: string; url: string; minutes: number };

/** Captures magic links instead of emailing them. */
export class FakeResendAdapter {
	public sent: TSentMagicLink[] = [];

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
	}
}
