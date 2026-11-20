import type { PlaceType } from "./types";

// Ported from api/src/lib/constants.ts (ALGORITHM_DEFAULTS / VALIDATION_LIMITS).
//
// NOTE: the old GraphQL SDL defaults (topM=5, gridSize=5, threshold=5000)
// disagreed with the constants below (3 / 7 / 2500). The constants are what
// the old code actually used as defaults, so they are used here.

export const TOP_M = 3;
export const GRID_SIZE = 7;
export const DEDUP_THRESHOLD_METERS = 2500;
export const BUFFER_TIME_MINUTES = 5;

export const VALIDATION_LIMITS = {
  MIN_DEDUPLICATION_THRESHOLD: 100,
  MAX_DEDUPLICATION_THRESHOLD: 50000,
  MAX_DEDUPLICATION_SERVICE_THRESHOLD: 10000,
  MIN_GRID_SIZE: 2,
  MAX_GRID_SIZE: 20,
  MIN_TOP_M: 1,
  MAX_TOP_M: 50,
} as const;

// Participant count. The old service (api/src/services/isochrones.ts) capped
// locations at 12. Independently, every request must fit the ORS hosted
// matrix limit of 3,500 routes; parseFindInput also rejects
// participant/gridSize combinations that exceed it (e.g. 8+ at gridSize 20).
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 12;

// Isochrone travel time in whole minutes. 60 matches the old service's upper
// bound and the ORS hosted time-range cap of 1 hour; the old lower bound of 5
// is relaxed to 1 (short walking isochrones are meaningful).
export const ISOCHRONE_MINUTES = { MIN: 1, MAX: 60 } as const;

// Geocode query length cap (after trimming / whitespace collapsing).
export const GEOCODE_QUERY_MAX_LENGTH = 200;

// Decimal places the geocode focus point is rounded to (1 = ~11 km). Coarse on
// purpose: the focus only biases ranking, a coarse grid keeps the KV hit rate
// up, and no precise location is sent upstream.
export const GEOCODE_FOCUS_DECIMALS = 1;

export const API_CONFIG = {
  MATRIX_TIMEOUT_MS: 45000,
  ISOCHRONE_TIMEOUT_MS: 30000,
  GEOCODING_TIMEOUT_MS: 10000,
  POIS_TIMEOUT_MS: 10000,
} as const;

// KV cache TTLs in seconds, from the old api/src/lib/cache.ts defaults
// (geocoding 7 days; matrix and isochrone 24 hours). KV's minimum
// expirationTtl is 60s; cached() clamps to it.
export const CACHE_TTL = {
  GEOCODE_SECONDS: 7 * 24 * 60 * 60,
  MATRIX_SECONDS: 24 * 60 * 60,
  ISOCHRONE_SECONDS: 24 * 60 * 60,
  PLACES_SECONDS: 24 * 60 * 60,
} as const;
export const KV_MIN_TTL_SECONDS = 60;

// ORS POIs (openpoiservice, OSM data; no ratings). Ids come from a
// `{"request":"list"}` call on 2026-11-20. A type maps to specific categories
// (`category_ids`) or to a whole group (`category_group_ids`).
export type PlaceFilter =
  | { readonly category_ids: readonly number[] }
  | { readonly category_group_ids: readonly number[] };

export const PLACE_FILTERS: Record<PlaceType, PlaceFilter> = {
  accommodation: { category_group_ids: [100] }, // ORS spells the group "accomodation"
  bar: { category_ids: [561, 569] }, // bar, pub
  cafe: { category_ids: [564] },
  cinema: { category_ids: [299] },
  gym: { category_ids: [271] }, // fitness_centre
  library: { category_ids: [133] },
  museum: { category_ids: [134] },
  park: { category_ids: [280] },
  playground: { category_ids: [283] },
  restaurant: { category_ids: [570] },
  shop: { category_group_ids: [420] },
};

// Hosted API caps the search radius (buffer) at 2 km and the area at 50 km^2;
// a point plus a buffer up to 2 km (~12.6 km^2) stays inside both.
export const POI_MAX_BUFFER_METERS = 2000;
export const POI_MIN_BUFFER_METERS = 250;
export const MAX_PLACES_PER_POINT = 10;
// Ranked candidates examined while looking for ones that have a matching
// place; each costs at most one (cached) POI call.
export const POI_MAX_ATTEMPTS = 6;

// Rough straight-line speeds (m/s) used to turn "N minutes" into a place
// search radius. Deliberately below real speeds: a straight line overstates
// what the road network reaches.
export const POI_RADIUS_SPEED_MPS = {
  "foot-walking": 1.2,
  "cycling-regular": 3.5,
  "driving-car": 8,
} as const;
