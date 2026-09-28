/** Self-reported gender, shown on the profile. Optional on every account. */
export enum UserGender {
	Male = "male",
	Female = "female",
	Other = "other",
	PreferNotToSay = "prefer_not_to_say",
}

export const USER_GENDERS = [
	UserGender.Male,
	UserGender.Female,
	UserGender.Other,
	UserGender.PreferNotToSay,
] as const;
