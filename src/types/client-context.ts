/** Who is calling; stored on refresh sessions for auditing. */
export type TClientContext = {
	ip: string | null;
	userAgent: string | null;
};
