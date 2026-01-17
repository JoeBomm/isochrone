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

  // Geometry Calculation Errors
  NO_OVERLAPPING_AREAS = 'NO_OVERLAPPING_AREAS',
  GEOMETRY_CALCULATION_FAILED = 'GEOMETRY_CALCULATION_FAILED',
  INVALID_POLYGON_DATA = 'INVALID_POLYGON_DATA',

  // Generic Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
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
      details: this.details
    }
  }
}

// Error factory functions for common error scenarios
export const createApiKeyError = (details?: string): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_API_KEY,
    message: `Invalid API key: ${details || 'API key validation failed'}`,
    userMessage: 'Configuration error: Invalid API key for mapping service. Please check your API key configuration.',
    details: { apiKeyIssue: details }
  })
}

export const createRateLimitError = (): AppError => {
  return new AppError({
    code: ErrorCode.API_RATE_LIMIT,
    message: 'API rate limit exceeded',
    userMessage: 'Service temporarily unavailable due to rate limits. Please try again in a few minutes.',
  })
}

export const createTimeoutError = (operation: string): AppError => {
  return new AppError({
    code: ErrorCode.API_TIMEOUT,
    message: `${operation} request timed out`,
    userMessage: 'Request timed out. Please try again with fewer locations or shorter travel times.',
    details: { operation }
  })
}

export const createGeocodingError = (address: string, originalError?: Error): AppError => {
  return new AppError({
    code: ErrorCode.GEOCODING_FAILED,
    message: `Failed to geocode address: ${address}`,
    userMessage: `Unable to find location for "${address}". Please try a more specific address or enter coordinates directly (e.g., "40.7128,-74.0060").`,
    details: { address },
    originalError
  })
}

export const createInsufficientLocationsError = (): AppError => {
  return new AppError({
    code: ErrorCode.INSUFFICIENT_LOCATIONS,
    message: 'At least 2 locations are required for center calculation',
    userMessage: 'Please add at least 2 locations to calculate a fair meeting point.',
  })
}

export const createTooManyLocationsError = (): AppError => {
  return new AppError({
    code: ErrorCode.TOO_MANY_LOCATIONS,
    message: 'Maximum 12 locations supported for center calculation',
    userMessage: 'Maximum of 12 locations supported. Please remove some locations and try again.',
  })
}

export const createBufferTimeError = (bufferTime: number): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_BUFFER_TIME,
    message: `Buffer time ${bufferTime} is outside valid range`,
    userMessage: 'Buffer time must be between 5 and 60 minutes. Please adjust your settings.',
    details: { bufferTime, validRange: '5-60 minutes' }
  })
}

export const createNoOverlapError = (): AppError => {
  return new AppError({
    code: ErrorCode.NO_OVERLAPPING_AREAS,
    message: 'No overlapping travel areas found between locations',
    userMessage: 'Locations are too far apart - no overlapping travel areas found. Try increasing travel time or choosing closer locations.',
  })
}

export const createGeometryError = (operation: string, originalError?: Error): AppError => {
  return new AppError({
    code: ErrorCode.GEOMETRY_CALCULATION_FAILED,
    message: `Geometry calculation failed: ${operation}`,
    userMessage: 'Unable to calculate meeting point due to complex geographic constraints. Try adjusting travel times or location selection.',
    details: { operation },
    originalError
  })
}

export const createInvalidCoordinatesError = (coordinates: any): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_COORDINATES,
    message: 'Invalid coordinate values provided',
    userMessage: 'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180.',
    details: { coordinates }
  })
}

export const createTravelModeError = (mode: string): AppError => {
  return new AppError({
    code: ErrorCode.INVALID_TRAVEL_MODE,
    message: `Unsupported travel mode: ${mode}`,
    userMessage: 'Invalid travel mode selected. Please choose from driving, cycling, or walking.',
    details: { mode, validModes: ['DRIVING_CAR', 'CYCLING_REGULAR', 'FOOT_WALKING'] }
  })
}

export const createMatrixCalculationError = (details?: string, originalError?: Error): AppError => {
  return new AppError({
    code: ErrorCode.MATRIX_CALCULATION_FAILED,
    message: `Travel time matrix calculation failed: ${details || 'Unknown error'}`,
    userMessage: 'Failed to calculate travel times between locations. Please check your locations and try again.',
    details: { matrixError: details },
    originalError
  })
}

// Error handler for GraphQL resolvers
export const handleResolverError = (error: unknown, operation: string): never => {
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
    }
  }

  // Generic error for unexpected issues
  throw new AppError({
    code: ErrorCode.INTERNAL_ERROR,
    message: `Internal error in ${operation}`,
    userMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
    details: { operation },
    originalError: error instanceof Error ? error : new Error(String(error))
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
    }

    return error.message
  }

  return 'An unexpected error occurred. Please try again.'
}