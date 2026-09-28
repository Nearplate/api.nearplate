/** A page of rows plus the total matching the filter. */
export type TPage<TRow> = { items: TRow[]; total: number };
