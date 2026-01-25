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
   * Meeting point count validation
   */
  MEETING_POINTS: {
    MIN_COUNT: 1,
    MAX_COUNT: 10,
    DEFAULT_COUNT: 3,
  },

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

/**
 * Validation utilities for meeting point count
 */
export const MeetingPointValidation = {
  /**
   * Validates if a meeting point count is within the allowed range
   * @param count - The count to validate
   * @returns true if valid, false otherwise
   */
  isValidCount: (count: number): boolean => {
    return (
      Number.isInteger(count) &&
      count >= UI_CONSTANTS.MEETING_POINTS.MIN_COUNT &&
      count <= UI_CONSTANTS.MEETING_POINTS.MAX_COUNT
    )
  },

  /**
   * Clamps a meeting point count to the allowed range
   * @param count - The count to clamp
   * @returns The clamped count within valid bounds
   */
  clampCount: (count: number): number => {
    return Math.max(
      UI_CONSTANTS.MEETING_POINTS.MIN_COUNT,
      Math.min(UI_CONSTANTS.MEETING_POINTS.MAX_COUNT, Math.floor(count))
    )
  },

  /**
   * Validates and clamps a meeting point count, returning both the result and whether clamping occurred
   * @param count - The count to validate and clamp
   * @returns Object with clamped count and whether clamping was needed
   */
  validateAndClamp: (count: number): { count: number; wasClamped: boolean } => {
    const clampedCount = MeetingPointValidation.clampCount(count)
    return {
      count: clampedCount,
      wasClamped: clampedCount !== count,
    }
  },

  /**
   * Gets a validation error message for an invalid count
   * @param count - The invalid count
   * @returns Error message string
   */
  getErrorMessage: (count: number): string => {
    if (!Number.isInteger(count)) {
      return 'Meeting point count must be a whole number'
    }
    if (count < UI_CONSTANTS.MEETING_POINTS.MIN_COUNT) {
      return `Meeting point count must be at least ${UI_CONSTANTS.MEETING_POINTS.MIN_COUNT}`
    }
    if (count > UI_CONSTANTS.MEETING_POINTS.MAX_COUNT) {
      return `Meeting point count cannot exceed ${UI_CONSTANTS.MEETING_POINTS.MAX_COUNT}`
    }
    return `Meeting point count must be between ${UI_CONSTANTS.MEETING_POINTS.MIN_COUNT} and ${UI_CONSTANTS.MEETING_POINTS.MAX_COUNT}`
  },
} as const
