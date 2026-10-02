/** Partial KYC update; only the keys present are written. */
export type TUpdateKycInput = Partial<{
	panNumber: string;
	fssaiNumber: string;
	accountHolderName: string;
	accountNumber: string;
	ifscCode: string;
	bankName: string;
}>;

/**
 * Decrypted KYC details. Transformers decide what reaches the wire: owners
 * get the PAN and account number masked, admins get them in full.
 */
export type TKycDetails = {
	panNumber: string | null;
	fssaiNumber: string | null;
	accountHolderName: string | null;
	accountNumber: string | null;
	ifscCode: string | null;
	bankName: string | null;
	updatedAt: Date | null;
};
