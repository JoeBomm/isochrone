// Ported from api/src/lib/constants.ts (ALGORITHM_DEFAULTS / VALIDATION_LIMITS).
//
// NOTE: the old GraphQL SDL defaults (topM=5, gridSize=5, threshold=5000)
// disagreed with the constants below (3 / 7 / 2500). The constants are what
// the old code actually used as defaults, so they are used here.
// Cache TTLs are not in the old constants file; they belong to Task 4.

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

export const API_CONFIG = {
  MATRIX_TIMEOUT_MS: 45000,
  ISOCHRONE_TIMEOUT_MS: 30000,
  GEOCODING_TIMEOUT_MS: 10000,
} as const;
