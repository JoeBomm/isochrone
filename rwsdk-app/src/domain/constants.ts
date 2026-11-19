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

export const API_CONFIG = {
  MATRIX_TIMEOUT_MS: 45000,
  ISOCHRONE_TIMEOUT_MS: 30000,
  GEOCODING_TIMEOUT_MS: 10000,
} as const;

// KV cache TTLs in seconds, from the old api/src/lib/cache.ts defaults
// (geocoding 7 days; matrix and isochrone 24 hours). KV's minimum
// expirationTtl is 60s; cached() clamps to it.
export const CACHE_TTL = {
  GEOCODE_SECONDS: 7 * 24 * 60 * 60,
  MATRIX_SECONDS: 24 * 60 * 60,
  ISOCHRONE_SECONDS: 24 * 60 * 60,
} as const;
export const KV_MIN_TTL_SECONDS = 60;
