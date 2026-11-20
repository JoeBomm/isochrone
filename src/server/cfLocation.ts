import { GEOCODE_FOCUS_DECIMALS } from "../domain/constants";
import { roundCoordinate } from "../domain/geometry";
import type { Coordinate } from "../domain/types";

/**
 * The caller's approximate location from Cloudflare's `request.cf`
 * (IP geolocation, roughly city-level; absent in some local dev setups and for
 * some IPs), rounded to GEOCODE_FOCUS_DECIMALS (~11 km). Undefined when there
 * is no usable value. `cf` gives latitude/longitude as strings; numbers are
 * accepted too.
 */
export function approximateLocation(cf: unknown): Coordinate | undefined {
  if (typeof cf !== "object" || cf === null) return undefined;
  const { latitude, longitude } = cf as { latitude?: unknown; longitude?: unknown };
  if (latitude === undefined || longitude === undefined || latitude === "" || longitude === "") {
    return undefined;
  }
  if (latitude === null || longitude === null) return undefined;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  return roundCoordinate({ lat, lng }, GEOCODE_FOCUS_DECIMALS);
}
