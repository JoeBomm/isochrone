/**
 * Web-side constants for the Isochrone Center Point application
 * Re-exports API constants for consistency across the application
 */

// Re-export algorithm defaults from API
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

// Export individual constants for convenience
export const DEFAULT_DEDUPLICATION_THRESHOLD =
  ALGORITHM_DEFAULTS.DEDUPLICATION_THRESHOLD
export const DEFAULT_TOP_M = ALGORITHM_DEFAULTS.TOP_M
export const DEFAULT_GRID_SIZE = ALGORITHM_DEFAULTS.GRID_SIZE
export const DEFAULT_BUFFER_TIME_MINUTES =
  ALGORITHM_DEFAULTS.BUFFER_TIME_MINUTES

// UI-specific constants
export const UI_CONSTANTS = {
  /**
   * Default travel mode for new calculations
   */
  DEFAULT_TRAVEL_MODE: 'DRIVING_CAR' as const,

  /**
   * Default optimization goal
   */
  DEFAULT_OPTIMIZATION_GOAL: 'MINIMAX' as const,

  /**
   * Map configuration
   */
  MAP: {
    DEFAULT_ZOOM: 10,
    DEFAULT_CENTER: { lat: 40.7128, lng: -74.006 }, // New York City
    MIN_ZOOM: 2,
    MAX_ZOOM: 18,
  },
} as const
