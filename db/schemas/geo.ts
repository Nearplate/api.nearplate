import { customType } from "drizzle-orm/pg-core";

/** GeoJSON Point; `coordinates` is `[longitude, latitude]`. */
export type TGeoPoint = { type: "Point"; coordinates: [number, number] };

/** Set in a little-endian EWKB type word when the SRID follows it. */
const _EWKB_SRID_FLAG = 0x20000000;

/**
 * A PostGIS `geometry(Point,4326)` column, mapped to/from `TGeoPoint` so
 * callers never see PostGIS's own wire format. Writes go through EWKT
 * (`SRID=4326;POINT(lng lat)`), which `geometry_in` accepts directly; reads
 * come back as hex-encoded EWKB (node-postgres does not decode `geometry`,
 * and Postgres defaults to that over WKT for any client that didn't ask for
 * `ST_AsText`), so `fromDriver` decodes the EWKB itself.
 */
export const geoPoint = customType<{ data: TGeoPoint; driverData: string }>({
	dataType() {
		return "geometry(Point,4326)";
	},
	toDriver(value: TGeoPoint): string {
		const [lng, lat] = value.coordinates;
		return `SRID=4326;POINT(${lng} ${lat})`;
	},
	fromDriver(value: string): TGeoPoint {
		return { type: "Point", coordinates: parseEwkbPoint(value) };
	},
});

/**
 * Decodes a little-endian EWKB Point (optionally with an SRID header) into
 * `[lng, lat]`. Point EWKB is always: 1-byte order, 4-byte type/flags,
 * optional 4-byte SRID, then two 8-byte doubles (x, y).
 */
export function parseEwkbPoint(hex: string): [number, number] {
	const buffer = Buffer.from(hex, "hex");
	if (buffer.readUInt8(0) !== 1) {
		throw new Error(`Unsupported (big-endian) EWKB point: ${hex}`);
	}
	const typeAndFlags = buffer.readUInt32LE(1);
	const hasSrid = (typeAndFlags & _EWKB_SRID_FLAG) !== 0;
	const coordsOffset = hasSrid ? 9 : 5;
	return [
		buffer.readDoubleLE(coordsOffset),
		buffer.readDoubleLE(coordsOffset + 8),
	];
}
