/**
 * Application-wide constants for the Isochrone Center Point application
 */

// Algorithm Configuration Constants
export const ALGORITHM_DEFAULTS = {
  /**
   * Default deduplication threshold in meters
   * Points closer than this distance will be merged during deduplication
   */
  DEDUPLICATION_THRESHOLD: 2500.0, // 5km

  /**
   * Default number of top optimal points to return
   */
  TOP_M: 3,

  /**
   * Default grid size for bounding box grid generation
   */
  GRID_SIZE: 7,

  /**
   * Default buffer time for isochrone calculations (minutes)
   */
  BUFFER_TIME_MINUTES: 5,
} as const

// Validation Constants
export const VALIDATION_LIMITS = {
  /**
   * Minimum deduplication threshold in meters
   */
  MIN_DEDUPLICATION_THRESHOLD: 100,

  /**
   * Maximum deduplication threshold in meters
   */
  MAX_DEDUPLICATION_THRESHOLD: 50000,

  /**
   * Maximum deduplication threshold for the deduplication service
   * (More restrictive than the resolver validation)
   */
  MAX_DEDUPLICATION_SERVICE_THRESHOLD: 10000,

  /**
   * Minimum grid size
   */
  MIN_GRID_SIZE: 2,

  /**
   * Maximum grid size
   */
  MAX_GRID_SIZE: 20,

  /**
   * Minimum top M value
   */
  MIN_TOP_M: 1,

  /**
   * Maximum top M value
   */
  MAX_TOP_M: 50,
} as const

// API Configuration Constants
export const API_CONFIG = {
  /**
   * Default timeout for matrix calculations (milliseconds)
   */
  MATRIX_TIMEOUT: 45000,

  /**
   * Default timeout for isochrone calculations (milliseconds)
   */
  ISOCHRONE_TIMEOUT: 30000,

  /**
   * Default timeout for geocoding (milliseconds)
   */
  GEOCODING_TIMEOUT: 10000,

  /**
   * API usage reset interval (milliseconds)
   */
  USAGE_RESET_INTERVAL: 60 * 60 * 1000, // 1 hour

  /**
   * High usage threshold (calls per hour)
   */
  HIGH_USAGE_THRESHOLD: 100,
} as const

// Export individual constants for convenience
export const DEFAULT_DEDUPLICATION_THRESHOLD =
  ALGORITHM_DEFAULTS.DEDUPLICATION_THRESHOLD
export const DEFAULT_TOP_M = ALGORITHM_DEFAULTS.TOP_M
export const DEFAULT_GRID_SIZE = ALGORITHM_DEFAULTS.GRID_SIZE
export const DEFAULT_BUFFER_TIME_MINUTES =
  ALGORITHM_DEFAULTS.BUFFER_TIME_MINUTES
