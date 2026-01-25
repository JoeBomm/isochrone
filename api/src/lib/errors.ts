import { logger } from './logger'

export enum ErrorCode {
  // API Configuration Errors
  INVALID_API_KEY = 'INVALID_API_KEY',
  MISSING_API_KEY = 'MISSING_API_KEY',

  // Input Validation Errors
  INVALID_COORDINATES = 'INVALID_COORDINATES',
  INVALID_TRAVEL_TIME = 'INVALID_TRAVEL_TIME',
  INVALID_BUFFER_TIME = 'INVALID_BUFFER_TIME',
  INVALID_TRAVEL_MODE = 'INVALID_TRAVEL_MODE',
  INSUFFICIENT_LOCATIONS = 'INSUFFICIENT_LOCATIONS',
  TOO_MANY_LOCATIONS = 'TOO_MANY_LOCATIONS',

  // External API Errors
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_TIMEOUT = 'API_TIMEOUT',
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  GEOCODING_FAILED = 'GEOCODING_FAILED',
  ISOCHRONE_CALCULATION_FAILED = 'ISOCHRONE_CALCULATION_FAILED',
  MATRIX_CALCULATION_FAILED = 'MATRIX_CALCULATION_FAILED',

  // Multi-phase optimization errors
  COARSE_GRID_MATRIX_FAILED = 'COARSE_GRID_MATRIX_FAILED',
  LOCAL_REFINEMENT_MATRIX_FAILED = 'LOCAL_REFINEMENT_MATRIX_FAILED',
  MULTI_PHASE_OPTIMIZATION_FAILED = 'MULTI_PHASE_OPTIMIZATION_FAILED',
  OPTIMIZATION_FALLBACK_FAILED = 'OPTIMIZATION_FALLBACK_FAILED',

  // Configuration validation errors
  INVALID_GRID_RESOLUTION = 'INVALID_GRID_RESOLUTION',
  INVALID_REFINEMENT_RADIUS = 'INVALID_REFINEMENT_RADIUS',
  INVALID_TOP_K_SELECTION = 'INVALID_TOP_K_SELECTION',
  API_USAGE_LIMIT_EXCEEDED = 'API_USAGE_LIMIT_EXCEEDED',

  // Algorithm failure errors (Task 12.1)
  ANCHOR_GENERATION_FAILED = 'ANCHOR_GENERATION_FAILED',
  GRID_GENERATION_FAILED = 'GRID_GENERATION_FAILED',
  DEDUPLICATION_FAILED = 'DEDUPLICATION_FAILED',
  SCORING_FAILED = 'SCORING_FAILED',
  HYPOTHESIS_GENERATION_FAILED = 'HYPOTHESIS_GENERATION_FAILED',
  INSUFFICIENT_VALID_POINTS = 'INSUFFICIENT_VALID_POINTS',

  // Cache and infrastructure errors (Task 12.2)
  CACHE_UNAVAILABLE = 'CACHE_UNAVAILABLE',
  CACHE_OPERATION_FAILED = 'CACHE_OPERATION_FAILED',

  // Geometry Calculation Errors
  NO_OVERLAPPING_AREAS = 'NO_OVERLAPPING_AREAS',
  GEOMETRY_CALCULATION_FAILED = 'GEOMETRY_CALCULATION_FAILED',
  INVALID_POLYGON_DATA = 'INVALID_POLYGON_DATA',

  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export interface StructuredError {
  code: ErrorCode
  message: string
  userMessage: string
  details?: Record<string, any>
  originalError?: Error
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly userMessage: string
  public readonly details?: Record<string, any>
  public readonly originalError?: Error

  constructor(error: StructuredError) {
    super(error.message)
    this.name = 'AppError'
    this.code = error.code
    this.userMessage = error.userMessage
    this.details = error.details
    this.originalError = error.originalError
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      details: this.details,
    }
  }
}

// Error factory functions for common error scenarios
export const createApiKeyError = (details?: string): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_API_KEY,
    message: `Invalid API key: ${details || 'API key validation failed'}`,
    userMessage:
      'Configuration error: Invalid API key for mapping service. Please check your API key configuration.',
    details: { apiKeyIssue: details },
  })
}

export const createRateLimitError = (): AppError => {
  return new AppError({
    code: ErrorCode.API_RATE_LIMIT,
    message: 'API rate limit exceeded',
    userMessage:
      'Service temporarily unavailable due to rate limits. Please try again in a few minutes.',
  })
}

export const createTimeoutError = (operation: string): AppError => {
  return new AppError({
    code: ErrorCode.API_TIMEOUT,
    message: `${operation} request timed out`,
    userMessage:
      'Request timed out. Please try again with fewer locations or shorter travel times.',
    details: { operation },
  })
}

export const createGeocodingError = (
  address: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.GEOCODING_FAILED,
    message: `Failed to geocode address: ${address}`,
    userMessage: `Unable to find location for "${address}". Please try a more specific address or enter coordinates directly (e.g., "40.7128,-74.0060").`,
    details: { address },
    originalError,
  })
}

export const createInsufficientLocationsError = (): AppError => {
  return new AppError({
    code: ErrorCode.INSUFFICIENT_LOCATIONS,
    message: 'At least 2 locations are required for center calculation',
    userMessage:
      'Please add at least 2 locations to calculate a fair meeting point.',
  })
}

export const createTooManyLocationsError = (): AppError => {
  return new AppError({
    code: ErrorCode.TOO_MANY_LOCATIONS,
    message: 'Maximum 12 locations supported for center calculation',
    userMessage:
      'Maximum of 12 locations supported. Please remove some locations and try again.',
  })
}

export const createBufferTimeError = (bufferTime: number): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_BUFFER_TIME,
    message: `Buffer time ${bufferTime} is outside valid range`,
    userMessage:
      'Buffer time must be between 5 and 60 minutes. Please adjust your settings.',
    details: { bufferTime, validRange: '5-60 minutes' },
  })
}

export const createNoOverlapError = (): AppError => {
  return new AppError({
    code: ErrorCode.NO_OVERLAPPING_AREAS,
    message: 'No overlapping travel areas found between locations',
    userMessage:
      'Locations are too far apart - no overlapping travel areas found. Try increasing travel time or choosing closer locations.',
  })
}

export const createGeometryError = (
  operation: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.GEOMETRY_CALCULATION_FAILED,
    message: `Geometry calculation failed: ${operation}`,
    userMessage:
      'Unable to calculate meeting point due to complex geographic constraints. Try adjusting travel times or location selection.',
    details: { operation },
    originalError,
  })
}

export const createInvalidCoordinatesError = (coordinates: any): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_COORDINATES,
    message: 'Invalid coordinate values provided',
    userMessage:
      'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.',
    details: { coordinates },
  })
}

export const createTravelModeError = (mode: string): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_TRAVEL_MODE,
    message: `Unsupported travel mode: ${mode}`,
    userMessage:
      'Invalid travel mode selected. Please choose from driving, cycling, or walking.',
    details: {
      mode,
      validModes: ['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'],
    },
  })
}

export const createMatrixCalculationError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.MATRIX_CALCULATION_FAILED,
    message: `Travel time matrix calculation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to calculate travel times between locations. Please check your locations and try again.',
    details: { matrixError: details },
    originalError,
  })
}

export const createCoarseGridMatrixError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.COARSE_GRID_MATRIX_FAILED,
    message: `Coarse grid matrix calculation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to calculate travel times for coarse grid optimization. Falling back to baseline optimization.',
    details: { phase: 'COARSE_GRID', matrixError: details },
    originalError,
  })
}

export const createLocalRefinementMatrixError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.LOCAL_REFINEMENT_MATRIX_FAILED,
    message: `Local refinement matrix calculation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to calculate travel times for local refinement. Using coarse grid results.',
    details: { phase: 'LOCAL_REFINEMENT', matrixError: details },
    originalError,
  })
}

export const createMultiPhaseOptimizationError = (
  phase: string,
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.MULTI_PHASE_OPTIMIZATION_FAILED,
    message: `Multi-phase optimization failed at ${phase}: ${details || 'Unknown error'}`,
    userMessage:
      'Advanced optimization failed. Falling back to basic optimization method.',
    details: { failedPhase: phase, optimizationError: details },
    originalError,
  })
}

export const createOptimizationFallbackError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.OPTIMIZATION_FALLBACK_FAILED,
    message: `Optimization fallback failed: ${details || 'Unknown error'}`,
    userMessage:
      'Unable to calculate optimal meeting point. Please check your locations and try again.',
    details: { fallbackError: details },
    originalError,
  })
}



export const createGridResolutionError = (
  resolution: number,
  bounds: string
): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_GRID_RESOLUTION,
    message: `Invalid grid resolution: ${resolution}. ${bounds}`,
    userMessage: `Grid resolution must be within reasonable bounds for performance. Please adjust your settings.`,
    details: { resolution, bounds },
  })
}

export const createRefinementRadiusError = (
  radius: number,
  bounds: string
): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_REFINEMENT_RADIUS,
    message: `Invalid refinement radius: ${radius}km. ${bounds}`,
    userMessage: `Refinement radius must be within geographic constraints. Please adjust your settings.`,
    details: { radius, bounds },
  })
}

export const createTopKSelectionError = (
  topK: number,
  bounds: string
): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_TOP_K_SELECTION,
    message: `Invalid top-K selection: ${topK}. ${bounds}`,
    userMessage: `Number of candidates for refinement must be reasonable. Please adjust your settings.`,
    details: { topK, bounds },
  })
}

export const createApiUsageLimitError = (
  estimatedPoints: number,
  limit: number
): AppError => {
  return new AppError({
    code: ErrorCode.API_USAGE_LIMIT_EXCEEDED,
    message: `Configuration would generate ${estimatedPoints} hypothesis points, exceeding API limit of ${limit}`,
    userMessage: `Your optimization settings would exceed API limits. Please reduce grid resolution or refinement parameters.`,
    details: { estimatedPoints, limit },
  })
}

// Algorithm failure error factories (Task 12.1)
export const createAnchorGenerationError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.ANCHOR_GENERATION_FAILED,
    message: `Anchor point generation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to generate baseline meeting points. Please check your locations and try again.',
    details: { anchorError: details },
    originalError,
  })
}

export const createGridGenerationError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.GRID_GENERATION_FAILED,
    message: `Grid generation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to generate search grid. Please try with different locations or smaller grid size.',
    details: { gridError: details },
    originalError,
  })
}

export const createDeduplicationError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.DEDUPLICATION_FAILED,
    message: `Point deduplication failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to optimize meeting points. Using unoptimized results.',
    details: { deduplicationError: details },
    originalError,
  })
}

export const createScoringError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.SCORING_FAILED,
    message: `Point scoring failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to rank meeting points. Please try again with different optimization settings.',
    details: { scoringError: details },
    originalError,
  })
}

export const createHypothesisGenerationError = (
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.HYPOTHESIS_GENERATION_FAILED,
    message: `Hypothesis generation failed: ${details || 'Unknown error'}`,
    userMessage:
      'Failed to generate candidate meeting points. Please check your locations and try again.',
    details: { hypothesisError: details },
    originalError,
  })
}

export const createInsufficientValidPointsError = (
  validCount: number,
  requiredCount: number
): AppError => {
  return new AppError({
    code: ErrorCode.INSUFFICIENT_VALID_POINTS,
    message: `Only ${validCount} valid points generated, need at least ${requiredCount}`,
    userMessage:
      'Not enough valid meeting points found. Try increasing the search area or using different travel modes.',
    details: { validCount, requiredCount },
  })
}

// Cache and infrastructure error factories (Task 12.2)
export const createCacheUnavailableError = (
  operation: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.CACHE_UNAVAILABLE,
    message: `Cache unavailable for ${operation}`,
    userMessage:
      'Caching service temporarily unavailable. Performance may be slower than usual.',
    details: { operation },
    originalError,
  })
}

export const createCacheOperationError = (
  operation: string,
  details?: string,
  originalError?: Error
): AppError => {
  return new AppError({
    code: ErrorCode.CACHE_OPERATION_FAILED,
    message: `Cache operation failed: ${operation} - ${details || 'Unknown error'}`,
    userMessage: 'Caching operation failed. Continuing without cache.',
    details: { operation, cacheError: details },
    originalError,
  })
}

// Error handler for GraphQL resolvers
export const handleResolverError = (
  error: unknown,
  operation: string
): never => {
  logger.error(`Error in ${operation}:`, error)

  if (error instanceof AppError) {
    // Re-throw structured errors as-is
    throw new Error(error.userMessage)
  }

  if (error instanceof Error) {
    // Handle known error patterns
    const message = error.message.toLowerCase()

    if (message.includes('api key')) {
      throw createApiKeyError(error.message)
    } else if (message.includes('rate limit')) {
      throw createRateLimitError()
    } else if (message.includes('timeout')) {
      throw createTimeoutError(operation)
    } else if (message.includes('overlapping')) {
      throw createNoOverlapError()
    } else if (message.includes('union') || message.includes('centroid')) {
      throw createGeometryError(operation, error)
    } else if (message.includes('coarse grid matrix')) {
      throw createCoarseGridMatrixError(error.message, error)
    } else if (
      message.includes('local refinement matrix') ||
      message.includes('phase 2 matrix')
    ) {
      throw createLocalRefinementMatrixError(error.message, error)
    } else if (message.includes('multi-phase optimization')) {
      throw createMultiPhaseOptimizationError('unknown', error.message, error)
    } else if (message.includes('optimization fallback')) {
      throw createOptimizationFallbackError(error.message, error)
    } else if (message.includes('grid resolution')) {
      throw createGridResolutionError(0, error.message)
    } else if (message.includes('refinement radius')) {
      throw createRefinementRadiusError(0, error.message)
    } else if (message.includes('topk') || message.includes('top-k')) {
      throw createTopKSelectionError(0, error.message)
    } else if (message.includes('api usage') || message.includes('api limit')) {
      throw createApiUsageLimitError(0, 0)
    } else if (
      message.includes('anchor point generation') ||
      message.includes('anchor generation')
    ) {
      throw createAnchorGenerationError(error.message, error)
    } else if (
      message.includes('grid generation') ||
      message.includes('bounding box grid')
    ) {
      throw createGridGenerationError(error.message, error)
    } else if (
      message.includes('deduplication') ||
      message.includes('proximity deduplication')
    ) {
      throw createDeduplicationError(error.message, error)
    } else if (
      message.includes('scoring') ||
      message.includes('point scoring')
    ) {
      throw createScoringError(error.message, error)
    } else if (
      message.includes('hypothesis generation') ||
      message.includes('hypothesis point')
    ) {
      throw createHypothesisGenerationError(error.message, error)
    } else if (
      message.includes('insufficient valid points') ||
      message.includes('not enough valid')
    ) {
      throw createInsufficientValidPointsError(0, 1)
    } else if (
      message.includes('cache unavailable') ||
      message.includes('cache connection')
    ) {
      throw createCacheUnavailableError(operation, error)
    } else if (
      message.includes('cache operation') ||
      message.includes('cache failed')
    ) {
      throw createCacheOperationError(operation, error.message, error)
    } else if (
      message.includes('No valid meeting points found') ||
      message.includes('no valid meeting points')
    ) {
      // Pass through the specific error message for unreachable points
      throw new AppError({
        code: ErrorCode.NO_OVERLAPPING_AREAS,
        message: error.message,
        userMessage: error.message,
        originalError: error,
      })
    }
  }

  // Generic error for unexpected issues
  throw new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: `Internal error in ${operation}`,
    userMessage:
      'An unexpected error occurred. Please try again or contact support if the problem persists.',
    details: { operation },
    originalError: error instanceof Error ? error : new Error(String(error)),
  })
}

// Utility to extract user-friendly error message from any error
export const getUserFriendlyMessage = (error: unknown): string => {
  if (error instanceof AppError) {
    return error.userMessage
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('api key')) {
      return 'Configuration error: Invalid API key for mapping service.'
    } else if (message.includes('rate limit')) {
      return 'Service temporarily unavailable due to rate limits. Please try again in a few minutes.'
    } else if (message.includes('timeout')) {
      return 'Request timed out. Please try again with fewer locations or shorter travel times.'
    } else if (message.includes('overlapping')) {
      return 'Locations are too far apart - no overlapping travel areas found. Try increasing travel time or choosing closer locations.'
    } else if (message.includes('union') || message.includes('centroid')) {
      return 'Unable to calculate meeting point due to complex geographic constraints. Try adjusting travel times or location selection.'
    } else if (message.includes('coarse grid matrix')) {
      return 'Advanced optimization failed. Using basic optimization method instead.'
    } else if (
      message.includes('local refinement matrix') ||
      message.includes('phase 2 matrix')
    ) {
      return 'Local refinement optimization failed. Using coarse grid results instead.'
    } else if (message.includes('multi-phase optimization')) {
      return 'Advanced optimization failed. Falling back to basic optimization method.'
    } else if (message.includes('optimization fallback')) {
      return 'Unable to calculate optimal meeting point. Please check your locations and try again.'
    } else if (message.includes('grid resolution')) {
      return 'Grid resolution must be within reasonable bounds for performance. Please adjust your settings.'
    } else if (message.includes('refinement radius')) {
      return 'Refinement radius must be within geographic constraints. Please adjust your settings.'
    } else if (message.includes('topk') || message.includes('top-k')) {
      return 'Number of candidates for refinement must be reasonable. Please adjust your settings.'
    } else if (message.includes('api usage') || message.includes('api limit')) {
      return 'Your optimization settings would exceed API limits. Please reduce grid resolution or refinement parameters.'
    } else if (
      message.includes('anchor point generation') ||
      message.includes('anchor generation')
    ) {
      return 'Failed to generate baseline meeting points. Please check your locations and try again.'
    } else if (
      message.includes('grid generation') ||
      message.includes('bounding box grid')
    ) {
      return 'Failed to generate search grid. Please try with different locations or smaller grid size.'
    } else if (
      message.includes('deduplication') ||
      message.includes('proximity deduplication')
    ) {
      return 'Failed to optimize meeting points. Using unoptimized results.'
    } else if (
      message.includes('scoring') ||
      message.includes('point scoring')
    ) {
      return 'Failed to rank meeting points. Please try again with different optimization settings.'
    } else if (
      message.includes('hypothesis generation') ||
      message.includes('hypothesis point')
    ) {
      return 'Failed to generate candidate meeting points. Please check your locations and try again.'
    } else if (
      message.includes('insufficient valid points') ||
      message.includes('not enough valid')
    ) {
      return 'Not enough valid meeting points found. Try increasing the search area or using different travel modes.'
    } else if (
      message.includes('cache unavailable') ||
      message.includes('cache connection')
    ) {
      return 'Caching service temporarily unavailable. Performance may be slower than usual.'
    } else if (
      message.includes('cache operation') ||
      message.includes('cache failed')
    ) {
      return 'Caching operation failed. Continuing without cache.'
    }

    return error.message
  }

  return 'An unexpected error occurred. Please try again.'
}
